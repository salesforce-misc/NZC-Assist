---
description: Set up waste emission tracking in Net Zero Cloud
---

# Configure Waste

Wizard for setting up the waste emissions domain (`GeneratedWaste` — combines source and use, unlike other domains).

$ARGUMENTS

## Steps

1. Verify prerequisites: license and `WstDispoEmssnFctrSet(+Itm)` waste-disposal factor sets loaded (`/nzc:load-reference-data` if missing). Waste has no dedicated record types to deploy.
2. Use `describe_sobject GeneratedWaste` to confirm current field names — remember this single object plays both the "source" and "periodic use" role that other domains split across two objects.
3. Ask which accounts/facilities and disposal methods (landfill, recycling, composting, incineration, etc.) apply.
4. Create/upsert `GeneratedWaste` records with owning Account, disposal method, waste type, and quantity, referencing the matching `WstDispoEmssnFctrSet` item — a record with no matching factor item will silently calculate to zero, not error, so confirm the factor link resolves before moving on.
5. Assert with `run_soql`: `SELECT COUNT() FROM GeneratedWaste` and the `waste-factor-items-loaded` validation rule.
6. Report created record counts and IDs. Suggest `/nzc:calculate-footprints` or `/nzc:audit waste`.
