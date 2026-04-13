# Sales tracking dashboard — structure derived from sheet exports (CAE)

- Source type: `dashboard specification (derived)`
- Snapshot date: `2026-04-07`
- Raw inputs: CSV exports of Google Sheet tabs under `raw/sources/` (manual maintenance; sparse cells)

## Intent

Reproduce **business metrics and cuts** from the historical spreadsheet in a **live dashboard** backed by a database. The UI may differ; the **measures and dimensions** should align.

**Important:** The sheet is a **pivot-style report**. The database should store **atomic facts** and **dimensions**; the dashboard runs **aggregations**.

## Source CSV files (in vault)

- `[CAE] Sales Tracking by NM - Agency Dashboard.csv`
- `[CAE] Sales Tracking by NM - Buyer Behavior Dashboard.csv`
- `[CAE] Sales Tracking by NM - Show Up Dashboard.csv`
- `[CAE] Sales Tracking by NM - Traffic Dashboard [NM].csv`
- `[CAE] Sales Tracking by NM - Traffic Dashboard [OM].csv`

## Tabs / logical dashboards

### 1) Agency Dashboard

- **Columns:** `TOTAL` plus **one column per webinar run** (date-labeled, e.g. May 7, May 21, …).
- **Row groups:** **OM**, **MB**, **NM** (different spend / funnel lines — “agencies” or internal lines).
- **Metrics (per group):** Ads spend (**RM**), **Lead**, **Cost per lead**, **Show up**, **Show up rate**, **Buyer**, **Conversion rate**, **CPA**.
- **Notes:** Many **empty cells** where a line did not run that week; spreadsheet may show **`#DIV/0!`** — product must define **safe division** (null / “N/A”).

### 2) Buyer Behavior Dashboard

- **DYD funnel rows:** e.g. Full, Deposit, Installment, Total student pax, Closing showup pax, Closing %.
- **Buyer occupation** breakdown with counts and % of buyers.
- **DYD program / creative dimension:** long tail of **program names** (e.g. `vid7`, `chart`, …) — **not a fixed enum**; new values appear as tests and agencies change.
- **CSV quirks:** merged-cell artifacts, typos in labels, duplicate blocks — treat as **human-edited** source, not strict schema.

### 3) Show Up Dashboard

- **Show-up counts** by **occupation**.
- **Multiple percentage blocks** — likely **different denominators** (must be **documented in code/SQL** when implemented).
- **Source split:** **NM / OM / MISSING** for show-up attribution.
- **Show-up ads source:** long tail of **creative / UTM-like** names with counts per webinar column.
- **`#DIV/0!`** possible — same safe-math rule as Agency tab.

### 4) Traffic Dashboard [NM] and [OM]

- **Lead occupation** and **sorted lead source** (UTM / ad name lists).
- **[NM]** export may be a **narrow date window** (e.g. only two webinar columns) — not necessarily “full year” in one file.
- **Missing UTM** row appears; **numeric** “source” strings may appear (raw ids).

## Attribution flexibility (Phase 1 and beyond)

- Reporting must support **combinations** of dimensions (e.g. **UTM campaign + medium**), not only a single concatenated key.
- Store **utm_source**, **utm_medium**, **utm_campaign** (and optional content/term) as **separate fields** on leads/events; build combo aggregates in **views/API**.

## Manual process today (to be automated)

- **Zoom export** + manual comparison to **leads sheet** to attribute **show-ups by UTM** (and other cuts).
- Phase 1 can start with **imports**; later replace Zoom export with **Zoom Reports API** without changing the **metric definitions** if join keys stay stable.

## Implementation hazards to avoid

- Do not model the DB as one flat grid per tab.
- Distinguish **null** (unknown / not entered) vs **zero** where the business cares.
- Normalize **currency and percent** storage (numeric in DB; format in UI).
