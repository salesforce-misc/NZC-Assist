---
name: nzc-sample-data
description: Orchestrates the hybrid seed + runtime-generation sample-data build — reference seed, structural seed, generated transactional data, and footprints, loaded in dependency order with fixture tracking for teardown. Use when the user asks to scaffold, generate, or tear down Net Zero Cloud sample data.
---

# Net Zero Cloud Sample Data Orchestration Expert

This skill is the core of this plugin's v1 goal: replicate what `NZCwithSampleData` (the CumulusCI reference project) achieves, using LLM-driven orchestration instead of committed CCI flows.

## The hybrid model

- **Committed seed** (`data/reference/`, `data/seed/`) — small, structural, or published-factor data that should never be regenerated differently each run: emission factors, UOM/fuel types, ~61 accounts, ~21 suppliers, source/inventory seeds.
- **Runtime-generated** (`data/generators/*.spec.yaml`) — high-volume transactional data (periodic energy/activity use, footprints) generated within realistic ranges at scaffold time, per a target-count spec.

## Load order (authoritative — never reorder)

Reference (tree, ordered) → accounts → suppliers → annual inventory → sources → generated energy/activity use (`StnryAssetEnrgyUse` ~134 → `VehicleAssetEnrgyUse` ~42 → `GeneratedWaste` ~40 → `StnryAssetWaterActvty` → `Scope3PcmtItem` ~202 → `AirTravelEnrgyUse` ~400 → `HotelStayEnrgyUse` ~345 → `RentalCarEnrgyUse` ~277 → `GroundTravelEnrgyUse` optional) → generated footprints linked to the annual inventory (`StnryAssetCrbnFtprnt`/`Itm` ~12 → `VehicleAssetCrbnFtprnt` ~8 → `WasteFootprint`/`Item` → `StnryAssetWaterFtprnt`/`Item` → `Scope3CrbnFtprnt` ~2).

Counts above are targets from the plan, not hard requirements — always confirm against the specific `*.spec.yaml` in `data/generators/` for the authoritative count for a given run.

## Per-tier procedure

For every tier in the load order:

1. `describe_sobject` the target object — confirm field names before generating a CSV header.
2. Query parent-tier IDs just created (e.g., source IDs before generating their periodic-use rows) — never hard-code IDs across runs.
3. Generate the CSV within the spec's field ranges/enums.
4. `bulk_upsert_records` (Bulk API 2.0 — required for the 200+ row tiers; tree import caps out around 200 rows/file).
5. `COUNT()` assert the load actually landed the expected number of rows.
6. Record every created ID in a fixture manifest, in load order, for reverse-order teardown.

## Production-write safety

**Refuse by default** against a production-type org (`isSandbox:false`). Require explicit, unambiguous confirmation before any bulk write against such an org — this is not a formality; a live production NZC org is a realistic connection target for this plugin.

## Teardown

`scaffold_sample_data --teardownId <manifestId>` deletes every created ID in **reverse** dependency order (footprints → energy/activity use → sources → inventory → suppliers → accounts — never delete a parent before its children, Salesforce will reject the parent delete or orphan the children depending on cascade rules).

## Gotchas

- Generating transactional volume before confirming reference data actually loaded produces a full-looking but zero-value footprint graph — always audit reference-data coverage first (`nzc-reference-data`, `/nzc:audit reference-data`).
- Scaffolding without a fixture manifest means teardown has nothing to reverse — always create the manifest as part of the same operation that creates the data, not as an afterthought.
- Bulk API 2.0 jobs can partially fail — always check per-row results, not just the job's overall status, before asserting counts.

## Tools to use

`import_tree` · `bulk_upsert_records` · `run_soql` · `describe_sobject` · `calculate_footprints` · `scaffold_sample_data`

## See also

`JOURNEY_MAP.md` Part 2 steps 10-14 · `PERSONA_JOURNEYS.md` § SDET/QA Engineer · `knowledge/troubleshooting/common-issues.md` · `nzc-data-model`, `nzc-carbon-footprint-calc`, `nzc-testing-validation` skills.
