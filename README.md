# Bukanbarukitchen.com (BBK) AI Growth Automation
AI-assisted inventory and e-commerce automation system transforming fragmented inventory feeds into structured, SEO-ready product data.

## The Problem

The business did not operate from a single warehouse or centralized inventory source.

Product inventory came from **8 independent Telegram groups**, each managed by different warehouse owners or administrators in the used commercial kitchen equipment network.

Each source had its own way of describing products, formatting specifications, posting images, communicating prices, and marking items as sold.

At the same time, the same inventory was accessible to dozens of independent marketers competing to sell the products.

This created several operational problems:

- Fragmented and inconsistent product data
- No standardized product naming or categorization
- Manual monitoring of inventory availability
- Repetitive processing of product images and descriptions
- Difficulty scaling thousands of products into structured web content
- Competition for the same inventory among multiple independent marketers

Instead of manually processing each product, I began building a system that could turn these fragmented inventory feeds into a structured data pipeline.

## System Architecture

The system converts fragmented inventory feeds into structured e-commerce data through a staged pipeline.

```mermaid
flowchart LR
    A["8 Telegram<br/>Inventory Groups"]
    B["Python<br/>Data Ingestion"]
    C["RAW_INVENTORY<br/>Google Sheets"]
    D["AI Normalization<br/>OpenAI API"]
    E["MASTER_INVENTORY<br/>Google Sheets"]
    F["Google Drive<br/>Media Sync"]
    G["WooCommerce<br/>REST API"]
    H["Product Pages"]
    I["Google Search"]

    A --> B
    B --> C
    C --> D
    D --> E
    F --> E
    E --> G
    G --> H
    H --> I
```

### Pipeline

**1. Inventory Ingestion**  
Python scripts collect product information and media references from multiple Telegram inventory groups.

**2. Raw Staging**  
Incoming data is stored in `RAW_INVENTORY`, preserving the source data before transformation.

**3. AI-Assisted Normalization**  
Google Apps Script sends raw product data to the OpenAI API using structured prompting rules. The model returns standardized product information in a predefined JSON format.

**4. Master Inventory**  
Validated output is written to `MASTER_INVENTORY`, which acts as the operational source of truth for publishing.

**5. Media Synchronization**  
Product images stored in Google Drive are mapped back to inventory records using product identifiers.

**6. WooCommerce Publishing**  
Eligible products are published in controlled batches through the WooCommerce REST API.

**7. Organic Discovery**  
Published products become part of the site's searchable and indexable content infrastructure.

## AI-Assisted Normalization

Raw inventory data is not reliable enough to publish directly. Product captions from different sources vary in naming conventions, specifications, formatting, and completeness.

To standardize this data, I designed an AI-assisted normalization layer between `RAW_INVENTORY` and `MASTER_INVENTORY`.

### How It Works

1. Google Apps Script reads unprocessed records from `RAW_INVENTORY`.
2. Raw product data is sent to the OpenAI API with predefined normalization rules.
3. The model is required to return a structured JSON response rather than free-form text.
4. The response is parsed and validated before being written to `MASTER_INVENTORY`.
5. Products are processed in controlled batches to stay within execution and API constraints.

### Output Contract

The AI layer produces structured fields such as:

```json
{
  "product_title": "...",
  "category": "...",
  "specifications": "...",
  "seo_keyword": "...",
  "meta_description": "...",
  "full_description": "..."
}
