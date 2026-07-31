# ADR-004: AI Output Contract and Controlled Content Generation

## Status

Implemented

## Context

BBKitchen receives inventory information from multiple independent Telegram supplier groups.

The incoming captions are unstructured and inconsistent.

Depending on the source, a caption may contain different combinations of:

- Product name
- Brand
- Dimensions
- Capacity
- Product condition
- Technical specifications
- Price
- Warehouse location
- Informal abbreviations
- Typographical errors
- Sales-oriented language
- Missing information

Example conceptual inputs:

```text
Source A:
deep fryer gas 2 basket ex resto 40x70 kondisi bagus harga xxx

Source B:
FRYER 2TUNGKU
uk 40 70
second
minus lecet pemakaian

Source C:
sold

Source D:
ice maker 50kg/day kondisi mulus
```

These records cannot be mapped directly into a standardized WooCommerce catalog.

The system needs to transform unstructured source captions into structured product data while avoiding a major risk associated with generative AI:

```text
Plausible but unsupported information
```

For commercial inventory, hallucinated specifications, brands, materials, or product conditions could create inaccurate listings.

The AI layer therefore cannot operate as an unconstrained copywriting system.

It must operate as a controlled transformation layer.

## Decision

The OpenAI integration uses a strict output contract and explicit content-generation rules.

The model is instructed to return a JSON object with a predefined schema.

The expected structure is:

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

The API request also explicitly enables structured JSON output:

```javascript
response_format: {
  "type": "json_object"
}
```

The response is parsed before being inserted into `MASTER_INVENTORY`.

Conceptually:

```text
Unstructured Caption
        |
        v
Controlled Prompt
        |
        v
OpenAI
        |
        v
JSON Output Contract
        |
        v
JSON.parse()
        |
        v
Structured MASTER_INVENTORY Record
```

## Why Use an Output Contract

Free-form AI responses would introduce unnecessary complexity into downstream automation.

For example, a model could otherwise return:

```text
Here is the optimized product listing:

Title: ...
Category: ...
Description: ...
```

or:

```text
Sure! I can help you with that.
```

Neither format is suitable for deterministic automation.

The output contract instead requires machine-readable fields that can be mapped directly into the inventory schema.

This changes the role of the model from:

```text
General-purpose copywriter
```

into:

```text
Structured transformation component
```

## Controlled Taxonomy

The model is not allowed to invent arbitrary product categories.

A predefined list of valid category slugs is injected into the prompt.

Examples include:

```text
blower
ducting
hood
ice-bin
ice-maker
deep-fryer
oven
single-sink-stainless
double-sink-stainless
cake-showcase
wallshelf
```

The model must select from the provided taxonomy.

Conceptually:

```text
Raw Product
     |
     v
LLM Classification
     |
     v
Allowed Category Set
     |
     v
Valid WooCommerce Category Slug
```

This prevents category naming from drifting between products and keeps AI-generated output compatible with the existing WooCommerce taxonomy.

## Golden Rules

The prompt contains explicit constraints referred to operationally as the "Golden Rules."

These rules define what the model may and may not infer from source data.

Key constraints include:

### 1. Remove Sensitive Source Information

The generated public listing must not expose source-level pricing or original warehouse-location information contained in Telegram captions.

```text
Raw Source Information
        |
        v
AI Transformation
        |
        +---- Source price --------X
        |
        +---- Raw location --------X
        |
        v
Public Product Content
```

### 2. Preserve Known Specifications

When dimensions, capacity, series, or product type are present in the source caption, the model should preserve them in the normalized product title and content.

### 3. Do Not Invent Specifications

The model is explicitly prohibited from hallucinating:

```text
Specifications
Brand
Material
Condition
```

If information is not supported by the source caption, it should not be presented as a known fact.

### 4. Controlled Product Condition

The `kondisi_unit` field is constrained to:

```text
BARU
BEKAS
```

Source terms such as:

```text
SECOND
COPOTAN
REKONDISI
EX
```

are normalized into:

```text
BEKAS
```

This converts inconsistent source terminology into a controlled operational value.

### 5. Structured SEO Generation

The AI layer generates several SEO-oriented fields:

```text
product_title
yoast_keyword
yoast_description
full_description
```

This allows the system to transform one source caption into multiple downstream content assets without manually rewriting each product listing.

### 6. Image Metadata Generation

The same transformation also produces:

```text
image_alt
image_title
image_caption
image_description
```

This metadata is later associated with product media in the publishing workflow.

## Input Validation Before AI Execution

Not every Telegram record should be sent to the model.

The normalization workflow performs basic validation first.

Records are skipped when:

```text
KODE_UNIT is empty
```

or when the caption:

```text
Contains fewer than 30 characters
```

or consists only of sold-status messages such as:

```text
sold
sold out
terjual
```

Conceptually:

```text
RAW Record
    |
    v
Input Validation
    |
    +---- Invalid ----> SKIP
    |
    v
Eligible Record
    |
    v
AI Processing
```

This prevents unnecessary API calls for records that cannot produce meaningful product listings.

## Batch Processing

AI enrichment is intentionally limited to:

```javascript
const MAX_AI_PER_RUN = 10;
```

Only a maximum of ten eligible records are processed during one execution.

This protects the Apps Script workflow from excessive runtime and limits the impact of external API failures.

The reasoning for this decision is documented separately in:

```text
ADR-003: Batch Throttling and Resource-Aware Automation
```

## Error Handling

Before processing begins, the RAW record is moved into:

```text
PROCESSING
```

If the transformation succeeds:

```text
RAW_INVENTORY
IS_PROCESSED = TRUE
```

and the generated product enters `MASTER_INVENTORY`.

If an exception occurs:

```text
ERROR: <message>
```

is written back to the RAW processing field.

Conceptually:

```text
RAW
 |
 v
PROCESSING
 |
 +------ Success ------> MASTER_INVENTORY
 |                            |
 |                            v
 |                      PENDING_PHOTOS
 |
 +------ Failure ------> ERROR
```

This makes AI processing failures visible to the operator rather than silently discarding them.

## Why AI Is Used Here

Traditional parsing works well when input follows predictable patterns.

The Telegram inventory sources do not.

For example:

```text
Product Name + Dimension + Condition
```

may appear in different orders, formats, abbreviations, and writing styles across independent sources.

Building a deterministic parser for every possible caption variation would require extensive source-specific rules and continuous maintenance.

The LLM is therefore used specifically for the ambiguous transformation layer:

```text
Unstructured Human Input
          ↓
Semantic Interpretation
          ↓
Structured Product Schema
```

Deterministic code remains responsible for:

```text
Fetching data
Generating SKUs
Moving files
Updating Sheets
Managing pipeline state
Calling APIs
Publishing products
```

The architecture therefore uses AI where semantic interpretation is valuable and conventional code where deterministic behavior is preferable.

## Separation of Responsibilities

```text
                TELEGRAM CAPTION
                       |
                       v
             +-------------------+
             | Deterministic Code |
             +-------------------+
                       |
             Validation / Routing
                       |
                       v
                 +-----------+
                 |    LLM    |
                 +-----------+
                       |
              Semantic Transform
                       |
                       v
              Structured JSON
                       |
                       v
             +-------------------+
             | Deterministic Code |
             +-------------------+
                       |
              Parse / Store / Route
                       |
                       v
              MASTER_INVENTORY
```

The LLM does not control pipeline execution.

It produces structured content inside a deterministic workflow.

## Trade-offs

### Positive

- Handles inconsistent natural-language source data.
- Reduces manual content-production workload.
- Produces standardized machine-readable output.
- Enforces a controlled category taxonomy.
- Generates multiple SEO fields from a single source record.
- Makes AI output directly consumable by downstream automation.
- Explicit prompt constraints reduce unsupported content generation.

### Negative

- Structured JSON does not guarantee factual correctness.
- Prompt constraints reduce but do not eliminate hallucination risk.
- Model behavior can change across model versions.
- AI processing introduces API cost and external-service dependency.
- Generated commercial content may still require human review.
- Long-form content generated from limited source data has inherent factual limits.

## Important Limitation

The output contract guarantees structure, not truth.

This distinction is important:

```text
Valid JSON ≠ Factually Valid Product Data
```

The architecture therefore treats prompt constraints, controlled taxonomy, source preservation, and operational review as complementary safeguards.

The system should not claim that AI output is automatically factual merely because it successfully passes JSON parsing.

## Why Not Fully Autonomous AI?

The objective is not to allow an AI agent to independently manage the e-commerce operation.

The objective is to automate a specific high-cost transformation step while keeping business state and execution under deterministic control.

Therefore:

```text
AI decides how to normalize content.

Code decides when it runs,
where the result goes,
what states are valid,
and whether downstream processing continues.
```

This keeps the AI component bounded within the larger system.

## Consequences

The AI layer becomes an interchangeable component rather than the architecture itself.

As long as a future model can satisfy the same structured output contract, the rest of the pipeline can remain largely unchanged.

Conceptually:

```text
Current Model
     |
     v
JSON Contract
     |
     v
Pipeline

Future Model
     |
     v
Same JSON Contract
     |
     v
Same Pipeline
```

This separation reduces coupling between the business workflow and a specific LLM implementation.
