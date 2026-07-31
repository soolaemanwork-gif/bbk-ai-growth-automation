# ADR-001: Google Sheets as the Central Operational Database

## Status

Implemented

## Context

BBKitchen aggregates commercial kitchen equipment inventory from multiple independent Telegram supplier groups.

Each source operates independently and uses different conventions for:

- Product naming
- Specifications
- Product condition
- Pricing format
- Warehouse location
- Image grouping
- Sold-status communication

The business does not own the warehouses or control how upstream suppliers structure their inventory data.

This creates a fragmented data environment where raw Telegram messages cannot be published directly into a consistent e-commerce catalog.

The system therefore requires a central operational layer between source ingestion and downstream publishing.

## Decision

Google Sheets was selected as the central operational database and Single Source of Truth for the inventory pipeline.

The data model is separated into two primary layers:

### RAW_INVENTORY

Stores source-level inventory records collected from Telegram.

Typical fields include:

- Unit code
- Source group
- Original Telegram message
- Raw caption
- Photo references
- Fetch timestamp
- Source timestamp
- Warehouse mapping
- Processing status

### MASTER_INVENTORY

Stores normalized, enriched, and publication-ready product records.

Typical fields include:

- SKU
- Product title
- Category
- Product condition
- Pipeline status
- Warehouse
- SEO content
- Yoast metadata
- Image URLs
- Image metadata
- WooCommerce product ID
- Source reference

The RAW layer preserves source data while the MASTER layer represents the standardized commercial product model.

## Why Google Sheets

The system was designed for a small business environment where operational simplicity was more valuable than introducing database infrastructure prematurely.

Google Sheets provided:

- Low infrastructure overhead
- Direct integration with Google Apps Script
- Human-readable operational visibility
- Easy manual inspection and correction
- API accessibility from Python
- Simple integration with Google Drive
- Fast iteration while the data model was still evolving

This allowed the automation pipeline to coexist with manual operational control.

## Data Flow

```text
Telegram Sources
       |
       v
Python Ingestion
       |
       v
RAW_INVENTORY
       |
       v
AI Normalization
       |
       v
MASTER_INVENTORY
       |
       +------> Media Synchronization
       |
       +------> WooCommerce Publishing
       |
       <------ WooCommerce Callback
```

## Trade-offs

Google Sheets is not intended to be a high-scale transactional database.

Known limitations include:

- API quotas
- Apps Script runtime limits
- Row-based processing overhead
- Limited concurrency control
- Increasing performance costs as datasets grow

These constraints are managed through batch processing, pipeline status fields, and execution limits.

For the current operational scale, the simplicity and visibility of Google Sheets outweigh the cost of introducing dedicated database infrastructure.

## Consequences

### Positive

- Operations can inspect pipeline state without engineering tools.
- Python and Apps Script can share the same operational data.
- Raw source records remain separated from normalized product records.
- Failed records can be inspected and retried manually.
- New automation modules can consume the MASTER layer without modifying ingestion logic.

### Negative

- Processing must respect Google API and Apps Script limits.
- Large-scale growth may eventually require migration to a dedicated database.
- Spreadsheet schema changes must be coordinated with scripts that depend on column positions.

## Future Migration Trigger

A dedicated database should be considered when spreadsheet limitations begin materially affecting:

- Processing reliability
- Concurrency
- Query performance
- Data integrity
- Operational scalability

Until those constraints become significant, Google Sheets remains the operational Single Source of Truth for the BBKitchen pipeline.
