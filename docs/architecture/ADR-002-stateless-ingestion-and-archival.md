# ADR-002: Stateless Ingestion and Post-Publishing Archival

## Status

Implemented

## Context

BBKitchen continuously receives inventory data from multiple independent Telegram supplier groups.

Telegram acts as an upstream inventory source, but the automation system should not depend on maintaining complex local application state to determine which products have already entered the pipeline.

The ingestion process also downloads product images locally before they are:

1. Processed and compressed into WebP.
2. Associated with a generated BBKitchen SKU.
3. Synchronized with the central inventory.
4. Used by the WooCommerce publishing workflow.

Without a cleanup strategy, processed media would accumulate in the active working directory and make it increasingly difficult to distinguish between active and completed inventory assets.

## Decision

The ingestion workflow was designed around reproducible source extraction, centralized processing state, and post-publishing archival.

Local storage is treated primarily as a temporary processing environment rather than the authoritative inventory database.

Pipeline state is maintained in Google Sheets through identifiers and status fields rather than through a separate local state database.

## Ingestion Strategy

The Telegram ingestion script supports configurable date ranges:

```text
Telegram Groups
      |
      v
Date-Range Fetch
      |
      v
JSON + Raw Images
      |
      v
Parser / Media Processing
      |
      v
RAW_INVENTORY
```

Each source is exported into its own directory.

The parser then transforms these exports into structured inventory units.

Existing Telegram message links stored in `RAW_INVENTORY` are used to prevent duplicate ingestion.

## Media Processing

Downloaded product images are transformed before entering the publishing pipeline.

The processing stage includes:

- Image deduplication
- Image resizing
- WebP conversion
- Compression
- BBKitchen watermark application
- SKU-based filename generation

Example:

```text
Telegram Image
      |
      v
BBK0051 source image
      |
      v
Resize + Compress + Watermark
      |
      v
BBK0051_1.webp
BBK0051_2.webp
BBK0051_3.webp
```

Using SKU-based filenames allows downstream automation to associate media assets with inventory records without requiring a separate media database.

## Centralized State

The system does not rely on local files to determine the authoritative state of a product.

Instead, Google Sheets maintains operational state through fields such as:

```text
IS_PROCESSED
STATUS_PIPELINE
SKU
PRODUCT_ID
```

Typical lifecycle:

```text
RAW
 |
 v
PROCESSING
 |
 v
PENDING_PHOTOS
 |
 v
READY_TO_PUBLISH
 |
 v
PUBLISHED
```

This separates temporary processing files from the actual state of the inventory pipeline.

## Post-Publishing Archival

Once a product reaches the `PUBLISHED` state, the cleanup workflow identifies local media files using the product SKU.

Example:

```text
BBK0051_1.webp
BBK0051_2.webp
BBK0051_3.webp
```

Files matching:

```text
BBK0051_*
```

are moved from the active media directory into an archive directory.

This keeps the working directory focused on inventory that is still moving through the pipeline.

## Why This Approach

The system was designed for operational simplicity.

Maintaining processing state inside a separate local database would introduce another synchronization layer between:

- Telegram
- Local processing
- Google Sheets
- Google Drive
- WooCommerce

Instead, the architecture keeps Google Sheets as the operational source of truth while local storage remains disposable processing infrastructure.

## Trade-offs

### Positive

- Local processing environments remain simple.
- Pipeline state is visible from Google Sheets.
- Re-running Telegram extraction does not automatically create duplicate inventory records.
- SKU-based media naming simplifies downstream asset matching.
- Published assets can be removed from the active workspace without deleting historical files.
- Recovery does not depend on a complex local state database.

### Negative

- Duplicate detection depends on stable source references such as Telegram message links.
- Local media processing still requires sufficient disk space during active runs.
- Archived files require their own storage management strategy over time.
- A failure between processing stages may require manual inspection of pipeline status.

## Failure Recovery

Because operational state is stored centrally, failed processing can be inspected through status fields rather than inferred from local files.

For example:

```text
PROCESSING
ERROR
PENDING_PHOTOS
NO_PHOTOS_FOUND
READY_TO_PUBLISH
PUBLISHED
```

These states make it possible to identify where an inventory unit stopped and retry the appropriate stage.

## Consequences

The resulting architecture treats local Python processing as an execution environment rather than the permanent system of record.

This keeps the ingestion layer replaceable while preserving inventory state in the central operational database.

If the system later moves to containerized workers, cloud functions, or dedicated job queues, the ingestion layer can be replaced without fundamentally changing the upstream or downstream inventory model.
