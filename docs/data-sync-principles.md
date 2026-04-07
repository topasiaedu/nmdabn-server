# Data in Postgres: SQL and columns first

You chose **Supabase (Postgres)** to work in **SQL with real tables and columns**, not to run a document database behind a SQL façade. That is a valid and common reason to pick Postgres.

## What we mean by “everything in SQL”

**Goal:** Every piece of data you rely on for reporting, joins, constraints, and indexes should live in **typed columns** and, where the API is nested, in **normalized child tables**—not buried in a single `jsonb` blob as the only copy.

| Shape in the API | How it belongs in SQL |
|------------------|------------------------|
| Scalar (string, number, boolean, timestamp) | **Column** on the parent table (nullable where needed) |
| List of objects (e.g. attributions, custom field defs) | **Child table** (`contact_id` FK + one row per item or per key-value) |
| Rarely used / true blobs | Optional `jsonb` **only** if you explicitly accept “not first-class SQL” for that slice—or skip until you promote it |

That is different from: *“One `metadata` column holds the world; Postgres is just Mongo with extra steps.”*

## Why the old GHL sync felt wrong for that goal

The previous approach treated **`raw_json` as the complete record** and added **only a small set of columns**. For your goals, that was backwards: the **columns (and child tables) should be the contract**, and any jsonb should be **optional** (e.g. debug capture), not the place where “real” fields like **`source`** or **attribution** only exist.

So your frustration is aligned with the product direction: **attribution and the rest should be modeled in SQL**, not left as JSON-only.

## “Why not literally every key as a column on `contacts`?”

A few practical boundaries:

1. **Nested lists** do not become “a column per key” on one row—they become **rows in another table** (still fully SQL).
2. **Vendor churn:** If GHL adds fields often, you add **migrations** when you adopt those fields—same as any evolving schema. That is a cost you accept for SQL purity.
3. **Sparse matrices:** A 200-column `contacts` table is hard to manage; splitting **domain** (e.g. `contact_attribution`, `contact_custom_field_values`) keeps tables understandable while staying relational.

So “every key” really means **every field you care about is either a column or a row in a related table**—not one wide table with every leaf key.

## Row-level completeness (still required)

SQL shape does not replace **fetching** everything:

- Paginate **all** contacts, **all** conversations, **all** messages, etc.
- Missing rows are still missing data, even with perfect columns.

## This repository *today*

App **`contacts`** and migrations should **grow toward full coverage** of the CRM fields you need (see `002_contact_attribution.sql` as a start). When GHL sync returns, it should **write into those columns and child tables** as the primary path, with policy documented in `docs/database/README.md` and new migrations for each batch of fields.

**GHL mirror (`ghl_contacts`):** use a **dual layer**: normalized columns and child tables for SQL you query often, plus **`raw_json`** storing the **entire** GET `/contacts/{id}` response. That gives you vendor-drift insurance and a place to mine new fields later without losing data; it does **not** replace columns for joins and indexes.

## Summary

- **You are right** to want **tables and columns** (and related tables), not Mongo-in-Postgres.
- The earlier **jsonb-only** pattern was wrong when **typed fields** only lived in JSON. The fix is **columns + normalization first**, with **`raw_json` as a full-payload mirror**, not as the only place real fields exist.
