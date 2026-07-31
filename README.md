# BBKitchen (bukanbarukitchen.com) — Automated Organic Growth & AI-Driven Inventory Pipeline

> A production workflow that transforms fragmented inventory from independent Telegram supplier groups into structured, SEO-ready WooCommerce product listings.

## Project Overview

BBKitchen is an organic growth and inventory automation system built for a used commercial kitchen equipment business operating without its own warehouse inventory.

The business sources products through a network of independent warehouse owners and administrators who publish available equipment inside private Telegram groups.

This creates an unusual operational environment:

- Inventory is controlled by independent suppliers.
- Each supplier uses different naming and caption conventions.
- Product specifications are inconsistent.
- Product photos arrive in different formats and groupings.
- Availability and sold status are communicated differently.
- The same marketer competes with many other independent resellers for the same inventory.
- New inventory needs to become searchable and commercially usable quickly.

Instead of manually copying products from Telegram into a website, I built an automation pipeline that converts fragmented supplier data into a centralized product catalog.

The system combines:

```text
Python
Google Sheets
Google Apps Script
Google Drive
OpenAI API
WordPress / WooCommerce
```

The project was developed using an AI-intensive implementation workflow. My role focused on defining the business problem, designing the system architecture and workflow logic, specifying AI behavior and constraints, testing the system end-to-end, debugging failures, and iterating based on production behavior.

---

# The Problem

The original workflow looked roughly like this:

```text
Independent Warehouse A ─┐
Independent Warehouse B ─┤
Independent Warehouse C ─┤
Independent Warehouse D ─┤
Independent Warehouse E ─┼──> Telegram ──> Manual Reseller Workflow
Independent Warehouse F ─┤
Independent Warehouse G ─┤
Independent Warehouse H ─┤
Additional Sources ──────┘
```

Each source could describe the same type of equipment differently.

Example conceptual inputs:

```text
Source A:
deep fryer gas 2 basket ex resto 40x70 kondisi bagus

Source B:
FRYER 2TUNGKU
uk 40 70
second
minus lecet

Source C:
deep fryer restoran bekas

Source D:
SOLD
```

At larger inventory volumes, manually turning these messages into structured website listings creates several bottlenecks:

```text
Telegram monitoring
        ↓
Copy product information
        ↓
Interpret inconsistent captions
        ↓
Download images
        ↓
Rename images
        ↓
Compress images
        ↓
Add watermark
        ↓
Determine category
        ↓
Write product title
        ↓
Write SEO content
        ↓
Create metadata
        ↓
Upload images
        ↓
Publish to WooCommerce
        ↓
Track product status
```

The objective was to convert this fragmented process into a repeatable pipeline.

---

# Solution

BBKitchen uses a staged automation architecture.

```text
Telegram Supplier Groups
          |
          v
   Python Extraction
          |
          v
 JSON + Product Images
          |
          v
 Parsing / Media Processing
          |
          v
    RAW_INVENTORY
          |
          v
   OpenAI Enrichment
          |
          v
   MASTER_INVENTORY
          |
          v
 Google Drive Media Sync
          |
          v
   READY_TO_PUBLISH
          |
          v
 WordPress REST Endpoint
          |
          v
      WooCommerce
          |
          v
      PUBLISHED
          |
          v
 WooCommerce Callback
          |
          v
   MASTER_INVENTORY
```

The architecture intentionally separates deterministic operations from semantic AI processing.

```text
DETERMINISTIC CODE

Fetch
Parse
Deduplicate
Generate SKU
Process images
Move files
Manage state
Call APIs
Publish
Archive


AI

Interpret inconsistent captions
Normalize product information
Classify products
Generate structured commercial content
Generate SEO metadata
Generate image metadata
```

---

# System Architecture

The system is divided into four main layers.

## 1. Source Ingestion

Python retrieves inventory messages and images from multiple Telegram sources.

The ingestion workflow supports date-based extraction and stores each source independently.

```text
Telegram API
     |
     v
telethon_fetch.py
     |
     +----> result.json
     |
     +----> source images
```

The parser then groups related images and captions into inventory units.

Duplicate source messages are prevented from entering the database by comparing Telegram message references against existing records.

Source:

[`src/python/`](./src/python/)

---

## 2. Central Operational Data Layer

Google Sheets acts as the operational Single Source of Truth.

The data model is divided into:

```text
RAW_INVENTORY
      |
      v
MASTER_INVENTORY
```

### RAW_INVENTORY

Preserves source-level information such as:

```text
KODE_UNIT
SOURCE_GROUP
LINK_MESSAGE
CAPTION_RAW
PHOTO_URLS
FETCH_DATE
LAST_SEEN_DATE
LOKASI_GUDANG
STATUS_UNIT
IS_PROCESSED
```

### MASTER_INVENTORY

Contains normalized operational product data including:

```text
SKU
PRODUCT_TITLE
CATEGORY_SLUG
STATUS_UNIT
STATUS_PIPELINE
KONDISI_UNIT
SEO CONTENT
IMAGE REFERENCES
PRODUCT_ID
SALE METADATA
```

Full schema documentation:

[`docs/data-dictionary.md`](./docs/data-dictionary.md)

---

## 3. AI Transformation Layer

Unstructured Telegram captions are processed through the OpenAI API.

The model is not used as an autonomous agent.

Instead, it operates inside a deterministic workflow with a strict JSON output contract.

Expected output:

```json
{
  "product_title": "",
  "category_slug": "",
  "kondisi_unit": "",
  "short_description": "",
  "full_description": "",
  "yoast_keyword": "",
  "yoast_description": "",
  "image_alt": "",
  "image_title": "",
  "image_caption": "",
  "image_description": ""
}
```

The implementation explicitly requests:

```javascript
response_format: {
  "type": "json_object"
}
```

The prompt also contains operational constraints — internally referred to as the **Golden Rules** — designed to prevent unsupported product information.

Examples include:

```text
Do not expose source pricing.

Do not expose original warehouse information.

Do not invent specifications.

Do not invent brands.

Do not invent materials.

Do not invent product condition.

Select categories from the controlled taxonomy.

Normalize product condition into controlled values.
```

This turns the LLM into a bounded transformation component rather than allowing it to control the workflow.

Source:

[`src/apps-script/normalizeAndBuildMaster.gs`](./src/apps-script/normalizeAndBuildMaster.gs)

Architecture decision:

[`ADR-004 — AI Output Contract and Controlled Content Generation`](./docs/architecture/ADR-004-ai-output-contract-and-controlled-generation.md)

---

# Media Processing

Product images are processed before publication.

The Python workflow handles:

```text
Raw Telegram Image
        |
        v
Deduplication
        |
        v
Resize
        |
        v
WebP Conversion
        |
        v
Compression
        |
        v
Watermark
        |
        v
SKU-Based Filename
```

Example:

```text
BBK0051_1.webp
BBK0051_2.webp
BBK0051_3.webp
```

SKU-based naming creates a simple relationship between product records and media assets.

The Google Drive synchronization workflow later resolves those files and assigns:

```text
MAIN_IMAGE
PHOTO_URLS
```

before advancing the product to:

```text
READY_TO_PUBLISH
```

Source:

[`src/apps-script/syncDrivePhotosToMaster.gs`](./src/apps-script/syncDrivePhotosToMaster.gs)

---

# WooCommerce Publishing

Products that reach:

```text
READY_TO_PUBLISH
```

are eligible for publication.

Google Apps Script builds a structured payload containing:

```text
SKU
Product title
SEO title
Category
Inventory status
Warehouse
Condition
Descriptions
Yoast metadata
Images
Source reference
Image metadata
```

The payload is sent through an authenticated request to a custom WordPress REST endpoint.

```text
MASTER_INVENTORY
       |
       v
Structured Payload
       |
       v
Authenticated REST Request
       |
       v
Custom WordPress Endpoint
       |
       v
WooCommerce
       |
       v
Product Created
       |
       v
PRODUCT_ID returned
       |
       v
STATUS_PIPELINE = PUBLISHED
```

Source:

[`src/apps-script/publishMasterToWooCommerce.gs`](./src/apps-script/publishMasterToWooCommerce.gs)

---

# WooCommerce Feedback Loop

The architecture also contains a callback endpoint implemented through Google Apps Script.

WooCommerce can send product sale information back to the operational inventory using the stored `PRODUCT_ID`.

```text
WooCommerce
     |
     v
Webhook POST
     |
     v
Google Apps Script
     |
     v
Find PRODUCT_ID
     |
     v
MASTER_INVENTORY
     |
     +----> TANGGAL_TERJUAL
     |
     +----> DURASI_TERJUAL
```

The callback structure is implemented in the repository.

Its presence demonstrates the architecture for downstream-to-upstream feedback, but this repository does not claim a fully verified real-time bidirectional stock synchronization system.

Source:

[`src/apps-script/handleStockStatusChange.gs`](./src/apps-script/handleStockStatusChange.gs)

---

# Resource-Aware Automation

The pipeline intentionally does not attempt to process the entire inventory in one execution.

Different stages use different batch limits.

```text
Python → Google Sheets       10 rows / batch
OpenAI enrichment            10 products / execution
Google Drive media sync      15 products / execution
WooCommerce publishing        5 products / execution
```

The objective is:

```text
Reliability > Maximum Single-Run Throughput
```

Small batches reduce:

```text
Apps Script timeout risk
API quota pressure
Network failure impact
WooCommerce server load
Failure domain size
```

The Python Google Sheets uploader also implements retry behavior for transient failures.

Architecture decision:

[`ADR-003 — Batch Throttling and Resource-Aware Automation`](./docs/architecture/ADR-003-batch-throttling-and-resource-aware-automation.md)

---

# Pipeline State Management

Instead of introducing dedicated queue infrastructure, the system uses explicit spreadsheet states as a lightweight operational queue.

Example lifecycle:

```text
RAW_INVENTORY

FALSE
  |
  v
PROCESSING
  |
  +---- ERROR
  |
  +---- SKIP
  |
  v
TRUE
```

Then:

```text
MASTER_INVENTORY

PENDING_PHOTOS
       |
       v
READY_TO_PUBLISH
       |
       v
PUBLISHED
```

Alternative failure states include:

```text
NO_PHOTOS_FOUND
SKIP: NO IMAGE
ERROR: <code>
ERROR: SCRIPT FAILED
```

This makes pipeline failures visible and allows individual stages to resume without reprocessing the entire inventory.

---

# Architecture Decisions

The repository documents the major design decisions separately from the implementation.

### ADR-001 — Google Sheets as Central Operational Database

Why Google Sheets was selected as the operational Single Source of Truth instead of introducing dedicated database infrastructure prematurely.

[`Read ADR-001`](./docs/architecture/ADR-001-google-sheets-as-central-database.md)

### ADR-002 — Stateless Ingestion and Post-Publishing Archival

Why local storage is treated as temporary processing infrastructure while pipeline state remains centralized.

[`Read ADR-002`](./docs/architecture/ADR-002-stateless-ingestion-and-archival.md)

### ADR-003 — Batch Throttling and Resource-Aware Automation

Why different pipeline stages intentionally use small processing batches.

[`Read ADR-003`](./docs/architecture/ADR-003-batch-throttling-and-resource-aware-automation.md)

### ADR-004 — AI Output Contract and Controlled Content Generation

Why AI is constrained by structured output, controlled taxonomy, explicit prompt rules, and deterministic pipeline execution.

[`Read ADR-004`](./docs/architecture/ADR-004-ai-output-contract-and-controlled-generation.md)

---

# Production Evidence

This repository includes production evidence separately from source code.

## Product Sitemap Scale

The production WooCommerce catalog is distributed across multiple product sitemap files:

- [`product-sitemap.md`](./evidence/product-sitemap.md)
- [`product-sitemap2.md`](./evidence/product-sitemap2.md)
- [`product-sitemap3.md`](./evidence/product-sitemap3.md)

Together, these files provide evidence of a large live e-commerce catalog.

They support claims regarding:

```text
Large-scale product catalog deployment
Thousands of product URLs exposed through sitemap infrastructure
Production implementation beyond a prototype environment
```

The sitemap evidence demonstrates catalog scale.

It does **not**, by itself, prove that every listed product was published through the automation pipeline.

---

# Verified Project Scale

Evidence available for this project supports the following scale:

```text
Master inventory        2,333 SKUs
Organic impressions     24,307 / 12 months
Organic clicks             883 / 12 months
Product sitemap URLs    ~2,000+ across production sitemap evidence
Geo SEO targets            183 districts
Ahrefs Health Score         67 / 100
```

Important:

```text
24,307 impressions = total over the measured 12-month period.

It is NOT a daily impression figure.
```

The repository intentionally separates verified metrics from assumptions.

---

# Organic Growth Context

The automation system supports a broader organic acquisition strategy.

BBKitchen operates in a market where multiple independent marketers can compete to sell inventory supplied by the same warehouse network.

The strategic advantage is therefore not exclusive access to inventory.

The advantage is improving:

```text
Inventory discovery
        +
Processing speed
        +
Catalog consistency
        +
Search discoverability
        +
Operational scalability
```

Instead of treating every Telegram product as an individual manual marketing task, the system turns incoming inventory into structured searchable assets.

This connects operations automation directly to organic growth.

---

# My Role

This project was built using an AI-intensive development workflow.

I do not position the project as evidence that every line of code was manually authored without AI assistance.

My responsibilities included:

```text
Business problem definition

Workflow design

System architecture

Data model design

AI prompt specification

Output-contract design

Pipeline-state design

Integration decisions

Testing

Debugging

Failure analysis

Iteration based on production behavior

Organic search strategy
```

AI tools were heavily used for:

```text
Code generation
Implementation support
Debugging assistance
Regular-expression development
Refactoring
Documentation support
```

The engineering value demonstrated by this project is therefore primarily in:

```text
Problem decomposition
System orchestration
AI-assisted implementation
Operational automation
Growth systems thinking
```

rather than manual code authorship as an end in itself.

---

# Tech Stack

```text
Python
├── Telethon
├── Pillow
├── gspread
└── Google OAuth

Google Apps Script
├── SpreadsheetApp
├── DriveApp
├── UrlFetchApp
├── PropertiesService
└── ContentService

AI
└── OpenAI API

Data / Storage
├── Google Sheets
└── Google Drive

Commerce
├── WordPress
└── WooCommerce

SEO
├── Yoast SEO
├── Google Search Console
└── Ahrefs
```

---

# Repository Structure

```text
bbk-organic-growth-engine/
│
├── src/
│   │
│   ├── python/
│   │   ├── telethon_fetch.py
│   │   ├── telegram_parser.py
│   │   └── clean_files.py
│   │
│   └── apps-script/
│       ├── normalizeAndBuildMaster.gs
│       ├── syncDrivePhotosToMaster.gs
│       ├── publishMasterToWooCommerce.gs
│       └── handleStockStatusChange.gs
│
├── docs/
│   │
│   ├── architecture/
│   │   ├── ADR-001-google-sheets-as-central-database.md
│   │   ├── ADR-002-stateless-ingestion-and-archival.md
│   │   ├── ADR-003-batch-throttling-and-resource-aware-automation.md
│   │   └── ADR-004-ai-output-contract-and-controlled-generation.md
│   │
│   └── data-dictionary.md
│
├── evidence/
│   ├── product-sitemap.md
│   ├── product-sitemap2.md
│   └── product-sitemap3.md
│
└── README.md
```

---

# Security and Public Repository Sanitization

Production credentials are intentionally excluded.

The public repository must not contain:

```text
OpenAI API keys
Telegram API credentials
Telegram session files
Google service-account credentials
WooCommerce consumer keys
WooCommerce consumer secrets
Private supplier identities
Private Telegram group IDs
Production Google Drive folder IDs
```

Google Apps Script secrets are retrieved through:

```javascript
PropertiesService.getScriptProperties()
```

Example:

```javascript
const props = PropertiesService.getScriptProperties();

const domain = props.getProperty("WOO_DOMAIN");
const consumerKey = props.getProperty("WOO_CK");
const consumerSecret = props.getProperty("WOO_CS");
```

Local credential files should remain excluded through `.gitignore`.

---

# What This Project Demonstrates

This repository is intended as a case study in building an operational growth system around a real business constraint.

It demonstrates the ability to connect:

```text
Messy real-world data
        ↓
Data ingestion
        ↓
Structured operational storage
        ↓
Controlled AI transformation
        ↓
Media automation
        ↓
API integration
        ↓
E-commerce publishing
        ↓
Technical SEO
        ↓
Organic acquisition
```

The core principle behind the architecture is simple:

> Use deterministic automation for predictable operations, use AI for ambiguous semantic transformation, and keep business state observable and recoverable.

---

# Documentation

Start here:

[`Data Dictionary`](./docs/data-dictionary.md)

Architecture decisions:

[`ADR-001 — Central Operational Database`](./docs/architecture/ADR-001-google-sheets-as-central-database.md)

[`ADR-002 — Stateless Ingestion & Archival`](./docs/architecture/ADR-002-stateless-ingestion-and-archival.md)

[`ADR-003 — Resource-Aware Batch Processing`](./docs/architecture/ADR-003-batch-throttling-and-resource-aware-automation.md)

[`ADR-004 — Controlled AI Generation`](./docs/architecture/ADR-004-ai-output-contract-and-controlled-generation.md)
