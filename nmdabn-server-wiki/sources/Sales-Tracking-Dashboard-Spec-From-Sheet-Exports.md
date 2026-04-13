# Sales tracking dashboard — sheet-derived spec

**Raw:** [2026-04-07-sales-tracking-dashboard-spec-from-sheet-exports.md](../raw/sources/2026-04-07-sales-tracking-dashboard-spec-from-sheet-exports.md)

## Summary

Specification to rebuild **CAE sales tracking** as a **live dashboard** on **atomic facts + dimensions**, not as one flat grid per spreadsheet tab. Measures and cuts should match the historical Google Sheet exports; UI can differ.

## Companion files (same folder)

Markdown spec only; underlying exports live beside it under `raw/sources/`:

- `[CAE] Sales Tracking by NM - Agency Dashboard.csv`
- `[CAE] Sales Tracking by NM - Buyer Behavior Dashboard.csv`
- `[CAE] Sales Tracking by NM - Show Up Dashboard.csv`
- `[CAE] Sales Tracking by NM - Traffic Dashboard [NM].csv`
- `[CAE] Sales Tracking by NM - Traffic Dashboard [OM].csv`
- `[Dr Jasmine] Sales Tracking by NM.xlsx`
- `Phase-1-Better-Data-Faster-Decisions.pdf`

The agent does not edit these binaries; treat them as curated inputs.

## Logical dashboards (from raw)

1. **Agency** — OM / MB / NM rows; webinar-run columns; spend, leads, CPL, show-up, buyer, conversion, CPA; safe handling of empty cells and `#DIV/0!`.
2. **Buyer behavior** — DYD funnel rows, occupation breakdown, long-tail program/creative dimension (not a fixed enum).
3. **Show up** — by occupation, multiple % blocks (denominators must be documented in SQL), NM/OM/MISSING split, ads source long tail.
4. **Traffic [NM] / [OM]** — lead occupation, sorted lead source; possible narrow date windows in export.

## Product rules called out in raw

- Store **utm_source**, **utm_medium**, **utm_campaign** (and optional content/term) as **separate** columns; combine in views/API.
- Distinguish **null** vs **zero** where the business cares.
- Normalize currency and percent in DB; format in UI.

## Related wiki

- [[Sales-Tracking-Dashboard-Model]]
- [[Product-Phase-Roadmap]]
- [[Buyer-Journey-Event-Store]]
- [[SQL-First-Data-Layer]]
