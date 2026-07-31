# BBKitchen Data Dictionary

## Overview

BBKitchen uses Google Sheets as the central operational data layer for the inventory automation pipeline.

The system separates inventory data into two primary datasets:

```text
RAW_INVENTORY
      |
      | AI normalization
      v
MASTER_INVENTORY
```

`RAW_INVENTORY` preserves source-level data collected from Telegram and tracks whether each source record has entered the normalization pipeline.

`MASTER_INVENTORY` contains standardized product records used by the media synchronization, SEO enrichment, WooCommerce publishing, and post-publication workflows.

---

# 1. RAW_INVENTORY

## Purpose

`RAW_INVENTORY` acts as the staging layer between Telegram ingestion and AI normalization.

Records in this sheet remain close to the original source data while adding operational identifiers required by the automation pipeline.

## Schema

| Column | Field | Description |
|---|---|---|
| A | `KODE_UNIT` | Internal BBKitchen unit identifier generated during ingestion. |
| B | `SOURCE_GROUP` | Identifier representing the Telegram source group. |
| C | `LINK_MESSAGE` | Reference to the original Telegram message used for traceability and duplicate detection. |
| D | `CAPTION_RAW` | Original product caption collected from the Telegram source. |
| E | `PHOTO_URLS` | Pipe-separated or comma-separated references to processed product image files. |
| F | `FETCH_DATE` | Timestamp when the inventory record entered the ingestion pipeline. |
| G | `LAST_SEEN_DATE` | Timestamp associated with the original Telegram source message. |
| H | `LOKASI_GUDANG` | Internally mapped warehouse associated with the source group. |
| I | `STATUS_UNIT` | Initial operational availability status assigned during ingestion. |
| J | `IS_PROCESSED` | Processing state used by the AI normalization workflow. |

---

## KODE_UNIT

Example:

```text
BBK0051
```

Generated sequentially by the Python ingestion workflow.

The identifier is used to associate:

- Source inventory
- Processed images
- MASTER records
- WooCommerce products
- Archived media

Example media naming:

```text
BBK0051_1.webp
BBK0051_2.webp
BBK0051_3.webp
```

---

## SOURCE_GROUP

Identifies which upstream Telegram source supplied the inventory record.

Production source identifiers are anonymized in the public repository.

Example:

```text
SOURCE_01
SOURCE_02
SOURCE_03
```

The field allows the pipeline to map source-specific information such as warehouse assignment without exposing supplier identities publicly.

---

## LINK_MESSAGE

Stores a reference to the original Telegram message.

Primary purposes:

```text
Traceability
Duplicate prevention
Source verification
```

During ingestion, existing message references are loaded from `RAW_INVENTORY`.

A Telegram record whose source link already exists is excluded from the new-record ingestion set.

---

## CAPTION_RAW

Contains the unstructured source caption.

Example conceptual input:

```text
deep fryer gas 2 basket ex resto 40x70 kondisi bagus
```

The field is intentionally preserved before AI transformation.

It serves as the source input for:

```text
normalizeAndBuildMaster()
```

---

## PHOTO_URLS

Stores media references associated with the inventory unit.

Depending on the pipeline stage or historical data format, values may contain filenames or URLs.

Example:

```text
BBK0051_1.webp|BBK0051_2.webp|BBK0051_3.webp
```

The media synchronization workflow supports:

```text
Pipe separator:  |
Comma separator: ,
```

---

## FETCH_DATE

Timestamp representing when the ingestion pipeline created the RAW record.

Example:

```text
2026-07-30 14:32:10
```

---

## LAST_SEEN_DATE

Timestamp derived from the original Telegram message.

This is distinct from `FETCH_DATE`.

```text
LAST_SEEN_DATE = source timestamp
FETCH_DATE     = pipeline ingestion timestamp
```

---

## LOKASI_GUDANG

Warehouse assignment derived from the source-group mapping.

Production warehouse locations are anonymized in the public repository.

Example:

```text
WAREHOUSE_A
WAREHOUSE_B
WAREHOUSE_C
```

---

## STATUS_UNIT

Initial inventory availability state.

The Python ingestion workflow currently creates new inventory records with an available status.

This source-level state is later normalized into the operational model used by `MASTER_INVENTORY`.

---

## IS_PROCESSED

Controls whether the RAW record should enter AI normalization.

Typical states include:

```text
FALSE
PROCESSING
TRUE
SKIP: ...
ERROR: ...
```

Conceptual lifecycle:

```text
FALSE
  |
  v
PROCESSING
  |
  +------ success ------> TRUE
  |
  +------ invalid ------> SKIP
  |
  +------ failure ------> ERROR
```

---

# 2. MASTER_INVENTORY

## Purpose

`MASTER_INVENTORY` is the standardized operational product model.

Records are created after the AI normalization workflow successfully transforms a RAW inventory caption into structured product data.

The sheet coordinates downstream processes including:

```text
Media synchronization
WooCommerce publishing
Product status tracking
Sale-data callbacks
Post-publishing cleanup
```

---

## Schema

The current Apps Script implementation writes a 24-field MASTER record.

| Column | Field | Description |
|---|---|---|
| A | `SKU` | BBKitchen product identifier inherited from `KODE_UNIT`. |
| B | `PRODUCT_TITLE` | AI-normalized product title. |
| C | `SEO_TITLE` | SEO title template used for publication. |
| D | `CATEGORY_SLUG` | Controlled WooCommerce product-category slug. |
| E | `STATUS_UNIT` | Operational inventory availability state. |
| F | `STATUS_PIPELINE` | Current automation workflow state. |
| G | `LOKASI_UNIT` | Normalized internal warehouse mapping. |
| H | `KONDISI_UNIT` | Standardized product condition. |
| I | `SHORT_DESCRIPTION` | AI-generated short product description. |
| J | `FULL_DESCRIPTION` | AI-generated long-form product description. |
| K | `YOAST_KEYWORD` | Primary SEO keyword. |
| L | `YOAST_DESCRIPTION` | SEO meta description. |
| M | `MAIN_IMAGE` | Primary product image reference. |
| N | `PHOTO_URLS` | Additional product image references. |
| O | `SOURCE_DATE` | Timestamp inherited from the source record. |
| P | `LAST_PUBLISH` | Publication-related field reserved by the operational schema. |
| Q | `TANGGAL_TERJUAL` | Sale date received from the WooCommerce callback. |
| R | `DURASI_TERJUAL` | Sale-duration data received from the WooCommerce callback. |
| S | `PRODUCT_ID` | WooCommerce product ID returned after successful publication. |
| T | `IS_DIRTY` | Boolean field reserved for change/synchronization tracking. |
| U | `IMAGE_ALT` | AI-generated image alt text. |
| V | `IMAGE_TITLE` | AI-generated image title. |
| W | `IMAGE_CAPTION` | AI-generated image caption. |
| X | `IMAGE_DESCRIPTION` | AI-generated image description. |

---

## SKU

Inherited from:

```text
RAW_INVENTORY.KODE_UNIT
```

Example:

```text
BBK0051
```

This identifier provides lineage across the pipeline:

```text
Telegram
   |
   v
RAW_INVENTORY
BBK0051
   |
   v
MASTER_INVENTORY
BBK0051
   |
   v
WooCommerce
BBK0051
```

---

## PRODUCT_TITLE

Generated during AI normalization.

The prompt instructs the model to:

- Produce a natural SEO-oriented title.
- Preserve known dimensions, capacity, series, or type.
- Correct obvious source-caption typographical errors.
- Avoid unnecessary ALL CAPS formatting.

---

## SEO_TITLE

The normalization workflow currently inserts the following template:

```text
%%title%% %%page%% %%sep%% BBKitchen
```

This allows the downstream SEO system to construct the final search title from the normalized product title.

---

## CATEGORY_SLUG

Product classification selected from a controlled taxonomy.

Examples:

```text
deep-fryer
oven
ice-maker
single-sink-stainless
double-sink-stainless
wallshelf
```

The model is instructed to select from the predefined category set rather than invent arbitrary categories.

---

## STATUS_UNIT

Represents inventory availability rather than automation progress.

Example states:

```text
READY
SOLD
```

The WooCommerce publishing workflow maps:

```text
READY → instock
SOLD  → outofstock
```

---

## STATUS_PIPELINE

Represents the product's current automation stage.

Typical states include:

```text
PENDING_PHOTOS
READY_TO_PUBLISH
NO_PHOTOS_FOUND
SKIP: NO IMAGE
PUBLISHED
ERROR: <code>
ERROR: SCRIPT FAILED
```

Conceptual lifecycle:

```text
PENDING_PHOTOS
      |
      v
Media Synchronization
      |
      +---- no media ----> NO_PHOTOS_FOUND
      |
      v
READY_TO_PUBLISH
      |
      v
WooCommerce Publisher
      |
      +---- failure -----> ERROR
      |
      v
PUBLISHED
```

`STATUS_UNIT` and `STATUS_PIPELINE` intentionally represent different concerns:

```text
STATUS_UNIT     = Business inventory state
STATUS_PIPELINE = Automation state
```

---

## LOKASI_UNIT

Normalized warehouse mapping used by downstream publication.

The public repository replaces real production locations with anonymized values.

Example:

```text
WAREHOUSE_A
```

---

## KONDISI_UNIT

Controlled product-condition value produced during AI normalization.

Allowed values:

```text
BARU
BEKAS
```

Various source expressions are normalized into this smaller operational vocabulary.

---

## SHORT_DESCRIPTION

Short-form commercial description generated from the source caption.

This field is included in the WooCommerce publishing payload as:

```text
excerpt
```

---

## FULL_DESCRIPTION

Long-form product content generated during AI normalization.

This field is included in the publishing payload as:

```text
content
```

The prompt requests structured commercial content including product usage, available specifications, and a call to action.

The model is explicitly instructed not to invent unsupported specifications.

---

## YOAST_KEYWORD

Primary keyword generated for the product.

This field is sent downstream as:

```text
yoast_keyword
```

---

## YOAST_DESCRIPTION

SEO meta description generated during normalization.

This field is sent downstream as:

```text
yoast_description
```

---

## MAIN_IMAGE

Primary product image resolved during the Drive synchronization stage.

The first successfully resolved media reference becomes the main product image.

---

## PHOTO_URLS

Stores additional product images after the main image.

Conceptually:

```text
Resolved images:

Image 1 → MAIN_IMAGE
Image 2 → PHOTO_URLS
Image 3 → PHOTO_URLS
Image 4 → PHOTO_URLS
```

---

## SOURCE_DATE

Preserves the source timestamp inherited from `RAW_INVENTORY`.

This maintains temporal lineage between the original inventory source and the normalized product record.

---

## LAST_PUBLISH

Reserved by the current operational schema for publication-related tracking.

The public repository should not claim specific behavior for this field unless the corresponding implementation is present in the published source.

---

## TANGGAL_TERJUAL

Sale-date field populated through the WooCommerce callback.

The webhook receives:

```text
tanggal_terjual
```

and writes the value back into the matching MASTER record.

---

## DURASI_TERJUAL

Sale-duration field populated through the WooCommerce callback.

The webhook receives:

```text
durasi_terjual
```

and writes the value into the matching MASTER record.

---

## PRODUCT_ID

WooCommerce product identifier.

After successful publication, the publishing workflow receives the product ID from the WordPress endpoint and stores it in this field.

Conceptually:

```text
MASTER PRODUCT
     |
     v
WooCommerce Publisher
     |
     v
WordPress REST Endpoint
     |
     v
Product Created
     |
     v
Return Product ID
     |
     v
MASTER_INVENTORY.PRODUCT_ID
```

The ID is subsequently used to match WooCommerce callback events with the corresponding MASTER record.

---

## IS_DIRTY

Boolean field reserved for synchronization/change tracking in the operational schema.

Because the currently published workflow does not fully demonstrate all dirty-state behavior, this repository documents the field without claiming a complete change-data-capture implementation.

---

## IMAGE_ALT

AI-generated alternative text intended for product-image accessibility and search context.

---

## IMAGE_TITLE

AI-generated image title associated with the product media.

---

## IMAGE_CAPTION

AI-generated short caption describing the product image.

---

## IMAGE_DESCRIPTION

AI-generated longer internal description of the product image.

---

# 3. Data Lineage

The core record lineage is:

```text
Telegram Message
       |
       v
SOURCE_GROUP
LINK_MESSAGE
CAPTION_RAW
       |
       v
KODE_UNIT
       |
       v
RAW_INVENTORY
       |
       v
AI Normalization
       |
       v
SKU
PRODUCT_TITLE
CATEGORY_SLUG
SEO CONTENT
       |
       v
MASTER_INVENTORY
       |
       v
Media Synchronization
       |
       v
MAIN_IMAGE + PHOTO_URLS
       |
       v
WooCommerce Publishing
       |
       v
PRODUCT_ID
       |
       v
WooCommerce Callback
       |
       v
Sale Metadata
```

---

# 4. Separation of Concerns

The two datasets intentionally serve different purposes.

```text
RAW_INVENTORY
--------------------------------
What did the source provide?

MASTER_INVENTORY
--------------------------------
What does BBKitchen operationally
know and publish about the product?
```

This separation prevents source-level inconsistency from directly contaminating the publication model.

It also preserves traceability back to the original Telegram record.

---

# 5. Public Repository Notes

The public GitHub version intentionally excludes or anonymizes:

```text
Telegram group IDs
Private Telegram URLs
Google Drive folder IDs
Service-account credentials
OpenAI API credentials
WooCommerce credentials
Exact supplier identities
Production warehouse details
```

Secrets used by Google Apps Script are loaded through:

```javascript
PropertiesService.getScriptProperties()
```

Python credentials and configuration files should remain excluded through `.gitignore`.

---

# 6. Schema Evolution

The current schema reflects the production workflow represented by the repository.

Future versions may replace positional spreadsheet columns with a more explicit database model.

Potential migration targets include:

```text
PostgreSQL
BigQuery
Managed relational databases
Dedicated workflow/job storage
```

Any future migration should preserve the core conceptual separation:

```text
Source / Staging Data
        |
        v
Normalized Operational Data
        |
        v
Publication / Distribution Systems
```

This separation is more important than the specific storage technology used.
