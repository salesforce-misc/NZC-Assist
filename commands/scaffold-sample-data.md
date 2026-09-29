---
description: Generate and load sample data across the Net Zero Cloud domains
---

# Scaffold Net Zero Cloud Sample Data

Build a full hybrid sample-data set — committed seed plus runtime-generated transactional records — across all configured domains.

$ARGUMENTS

## Steps

1. **Production-write safety** — call `get_org_status`/`check_nzc_setup` and check org type. If the target org is production-type (`isSandbox:false`), refuse by default: explain the risk and require the user to explicitly confirm by name/alias before proceeding. Never assume confirmation from a generic "yes."
2. Verify prerequisites are already in place: license, settings, record types, reference data (`/nzc:load-reference-data`). If any are missing, stop and route to the right command rather than trying to paper over gaps with generated data.
3. Ask for a profile (e.g., "small"/"full", or specific per-tier counts), or default to the reference profile documented in `nzc-sample-data` skill (matching `NZCwithSampleData`'s target volumes).
4. Call `scaffold_sample_data` with the chosen profile. It runs the authoritative load order:
   - accounts → suppliers → annual inventory → sources (stationary/vehicle/scope3) → generated energy/activity use per domain → generated footprints linked to the inventory.
5. For each tier, report: target count, actual created count, and any partial-failure detail (never silently swallow bulk-load row failures).
6. Write/confirm the fixture manifest (created record IDs per tier) so this run can be torn down later.
7. Run a quick `/nzc:audit` at the end and surface any red rules immediately.
8. If the user later wants to remove this data, offer `scaffold_sample_data` with the manifest's teardown ID — reverse tier order (footprints → use records → sources → inventory → suppliers → accounts).
