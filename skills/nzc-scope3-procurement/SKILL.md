---
name: nzc-scope3-procurement
description: Scope 3 procurement emission sources, spend-based procurement line items, procurement emission factors, suppliers, and inflation normalization. Use when the user asks about purchased goods and services, Scope 3 procurement, or spend-based emissions in Net Zero Cloud.
---

# Net Zero Cloud Scope 3 Procurement Expert

Purchased goods/services emissions via the spend-based method (`JOURNEY_MAP.md` Part 1, row 11).

## Objects

| Role | Object | Notes |
|---|---|---|
| Owner | `Supplier` | Must exist before a procurement source can reference it |
| Source | `Scope3EmssnSrc` | Record-typed for procurement |
| Periodic use | `Scope3PcmtItem` | Spend-based line items |
| Factors | `PcmtEmssnFctrSet`/`PcmtEmssnFctrItem` | Category-level spend-based factors — target coverage **300+ items** (`procurement-factor-items-loaded`) |
| Normalization | `InflationRate` | Normalizes spend across fiscal years before pricing against a factor |
| Footprint | `Scope3CrbnFtprnt` | Shared across procurement + travel; must carry non-null `AnnualEmssnInventoryId` |

## Setup order for this domain

1. Confirm the Scope 3 settings flag is on.
2. Load procurement emission factors + inflation rates (`/nzc:load-reference-data`).
3. Create `Supplier` records **before** any procurement source references one — `scope3-procurement-sources-have-supplier` will flag the gap otherwise.
4. Create procurement `Scope3EmssnSrc` records (`/nzc:configure-scope3-procurement`).
5. Load `Scope3PcmtItem` spend line items.
6. Calculate footprints only after the annual inventory exists.

## Gotchas

- The spend-based method is sensitive to fiscal-year normalization — a missing `InflationRate` row for a given year silently skews every procurement footprint calculated against it.
- `Scope3EmssnSrc` is shared between procurement and travel — always filter by record type (e.g. `RecordType.DeveloperName = 'Procurement'`) before assuming a query only returns procurement sources.
- Category-level factor coverage matters more than line-item volume here — 300+ factor items is the practical floor for realistic spend-category coverage; fewer than that and most real-world spend categories won't match.

## Tools to use

`describe_sobject` · `run_soql` · `bulk_upsert_records` · `calculate_footprints`

## See also

`JOURNEY_MAP.md` Part 1 row 11 · `knowledge/modules/scope3-procurement/README.md` · `knowledge/validation-rules/{reference-data,data-integrity}.yaml` (`procurement-factor-items-loaded`, `scope3-procurement-sources-have-supplier`) · `nzc-data-model`, `nzc-reference-data` skills.
