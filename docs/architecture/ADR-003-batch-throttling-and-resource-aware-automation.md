# ADR-003: Batch Throttling and Resource-Aware Automation

## Status

Implemented

## Context

The BBKitchen automation pipeline connects several services with different operational constraints:

- Telegram API
- Local Python processing
- Google Sheets API
- Google Apps Script
- Google Drive
- OpenAI API
- WordPress / WooCommerce

The system processes a large inventory, but the underlying infrastructure is intentionally lightweight.

Attempting to process the entire inventory in a single execution would increase the risk of:

- Google Apps Script runtime timeouts
- API quota exhaustion
- Network failures
- WooCommerce server overload
- Large failure domains
- Difficult recovery after partial execution

The goal was therefore not maximum throughput per execution.

The goal was reliable, repeatable processing within the limits of the available infrastructure.

## Decision

BBKitchen uses deliberately small processing batches at multiple stages of the pipeline.

Instead of attempting large synchronous jobs, each automation stage processes a limited number of records and leaves the remaining records for subsequent executions.

Current implemented limits include:

```text
Python → Google Sheets upload     10 rows per batch
OpenAI enrichment                10 products per execution
Google Drive media sync          15 products per execution
WooCommerce publishing            5 products per execution
```

These limits are implementation-specific safeguards rather than universal performance requirements.

## Pipeline Model

```text
                    FULL INVENTORY
                          |
                          v
                 +-----------------+
                 | Eligible Records |
                 +-----------------+
                          |
                          v
                Process Limited Batch
                          |
                          v
                  Update Pipeline State
                          |
                          v
                 End Current Execution
                          |
                          v
                Next Execution Continues
                          |
                          v
                     Remaining Data
```

The system therefore progresses incrementally rather than attempting to complete the entire workload atomically.

## Python → Google Sheets Batching

The Python inventory parser accumulates new structured records before uploading them to Google Sheets.

Uploads are divided into batches of:

```text
10 rows
```

Each batch has a retry mechanism with up to:

```text
3 attempts
```

If an upload fails because of a network or API issue, the script waits before retrying.

A short delay is also introduced between successful batches.

Conceptually:

```text
Structured Inventory
        |
        v
   Batch 1: 10 rows
        |
        v
     Upload
        |
        +---- failure ----> wait ----> retry
        |
      success
        |
        v
   Short Delay
        |
        v
   Batch 2: 10 rows
```

This reduces the impact of transient connectivity failures and avoids sending the entire workload through a single API request.

## OpenAI Enrichment Throttling

The AI normalization workflow uses:

```javascript
const MAX_AI_PER_RUN = 10;
```

Only records that have not yet been processed are selected.

Once ten eligible records have been collected, the workflow stops adding records to the current execution.

This creates the following behavior:

```text
RAW_INVENTORY
      |
      v
Find Unprocessed Records
      |
      v
Select Maximum 10
      |
      v
OpenAI Enrichment
      |
      v
MASTER_INVENTORY
```

The limit reduces the risk that multiple external API requests and spreadsheet operations exceed the Apps Script execution window.

## Google Drive Media Synchronization

The media synchronization workflow uses:

```javascript
const MAX_PER_RUN = 15;
```

Only products with:

```text
STATUS_PIPELINE = PENDING_PHOTOS
```

are eligible.

The workflow attempts to resolve the product's media references and then transitions the record to either:

```text
READY_TO_PUBLISH
```

or:

```text
NO_PHOTOS_FOUND
```

Processing stops after fifteen eligible products have been evaluated during the execution.

## WooCommerce Publishing Throttling

The publishing workflow uses:

```javascript
const MAX_PROCESS = 5;
```

This is the most conservative processing limit in the pipeline.

Publishing requires sending structured product data and media references from the MASTER inventory to a custom WordPress REST endpoint.

Only records in an eligible publishing state are processed.

Conceptually:

```text
MASTER_INVENTORY
       |
       v
READY_TO_PUBLISH
       |
       v
Maximum 5 Products
       |
       v
WordPress REST Endpoint
       |
       v
WooCommerce
       |
       v
PUBLISHED + PRODUCT_ID
```

The smaller batch reduces pressure on the WooCommerce environment and limits the number of products affected if a publishing execution fails.

## Why Different Batch Sizes

Each stage performs a different type of workload.

Therefore, a single global batch size would not accurately reflect the cost or risk of each operation.

For example:

```text
Operation                    Relative Concern
----------------------------------------------------------
Sheet row upload             API/network reliability
AI enrichment                External API + runtime
Drive media lookup           Drive API operations
WooCommerce publishing       Server/API workload
```

Batch sizes were selected independently according to the characteristics of each stage.

## Pipeline State as a Queue

The architecture does not require a dedicated message queue.

Instead, status fields inside the operational database behave as a lightweight queue.

Examples include:

```text
FALSE
PROCESSING
PENDING_PHOTOS
NO_PHOTOS_FOUND
READY_TO_PUBLISH
PUBLISHED
ERROR
```

Each automation module searches for records in the state it is responsible for processing.

For example:

```text
RAW_INVENTORY
IS_PROCESSED = FALSE
        |
        v
AI NORMALIZER
        |
        v
PENDING_PHOTOS
        |
        v
MEDIA SYNC
        |
        v
READY_TO_PUBLISH
        |
        v
WOO PUBLISHER
        |
        v
PUBLISHED
```

This allows each module to process a small amount of work independently.

## Failure Isolation

Small batches reduce the failure domain of each execution.

If one external service becomes unavailable, the entire inventory does not need to be reprocessed.

For example:

```text
2,000+ inventory records
          |
          X
Do not process everything as one job

Instead:

[10] → [10] → [10] → [10] → ...

or

[5] → [5] → [5] → [5] → ...
```

A failed batch can therefore be investigated without invalidating previously completed records.

## Trade-offs

### Positive

- Lower risk of runtime timeout.
- Reduced pressure on external APIs.
- Reduced WooCommerce server load.
- Smaller failure domains.
- Easier debugging and recovery.
- Processing can resume from pipeline state.
- Infrastructure can remain relatively lightweight.

### Negative

- Total processing time is longer than unrestricted bulk processing.
- Large backlogs require multiple executions.
- Throughput depends on how frequently workflows are triggered.
- Batch sizes may require tuning as infrastructure changes.
- Google Sheets is acting as both operational storage and a lightweight workflow queue.

## Why Not Maximize Throughput?

The business requirement is not to publish every inventory record within a single execution.

The more important requirement is to maintain a pipeline that can operate repeatedly without destabilizing the services it depends on.

Therefore:

```text
Reliability > Maximum Single-Run Throughput
```

This is particularly important because the system integrates services outside the direct control of the application.

## Scaling Path

The current batch architecture is appropriate for the existing operational environment.

If throughput becomes a material constraint, possible future improvements include:

- Dedicated job queues
- Asynchronous workers
- Cloud Functions or containerized workers
- Exponential backoff
- Centralized retry management
- Database-backed job states
- Parallel processing where safe
- Observability and automated failure alerts

These should be introduced only when operational requirements justify the additional infrastructure complexity.

## Consequences

BBKitchen intentionally trades maximum processing speed for operational reliability.

Batch throttling allows the system to automate a large inventory using relatively simple infrastructure while keeping API usage, execution time, and downstream server load within manageable boundaries.

The architecture can later increase throughput without fundamentally changing the inventory data model or pipeline stages.
