# Sales tracking dashboard model

How to implement the CAE sales tracking dashboards without copying spreadsheet layout into the database.

## Core principle

The sheet is a **pivot-style report**. The database holds **atomic facts** (events, spend lines, leads, attendance facts, purchases) and **dimensions** (webinar run, agency line OM/MB/NM, occupation, program/creative, UTM components). The dashboard = **aggregations** in SQL or a semantic layer.

## Four logical surfaces

Maps to raw spec tabs:

1. **Agency** — spend and funnel KPIs by agency line and webinar run column.
2. **Buyer behavior** — DYD funnel, occupation mix, open-ended program/creative dimension.
3. **Show up** — occupation and source splits; document each **percentage denominator** explicitly in code or a metrics dictionary.
4. **Traffic** — lead occupation and source lists; handle missing UTM and raw numeric “source” ids.

## Implementation hazards (guardrails)

- No one-wide “flat grid” table per tab.
- Safe division: null / N/A when denominator missing (sheet `#DIV/0!`).
- **Null vs zero** semantics defined per metric.
- **UTM** stored as separate columns; composite keys built in views/API.

## Related

- [[Sales-Tracking-Dashboard-Spec-From-Sheet-Exports]]
- [[SQL-First-Data-Layer]]
- [[Product-Phase-Roadmap]]
