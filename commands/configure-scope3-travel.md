---
description: Set up Scope 3 business travel emission tracking in Net Zero Cloud
---

# Configure Scope 3 Travel

Wizard for setting up the Scope 3 business-travel domain (four travel-mode periodic-use objects sharing one footprint object).

$ARGUMENTS

## Steps

1. Verify prerequisites: license and air/hotel/rental/ground travel factor sets loaded (`/nzc:load-reference-data` if missing).
2. Use `describe_sobject AirTravelEnrgyUse` (and `HotelStayEnrgyUse`, `RentalCarEnrgyUse`, `GroundTravelEnrgyUse`) to confirm current field names before building records — these are typically the plugin's highest transactional-volume tier.
3. Ask which travel modes apply. `GroundTravelEnrgyUse` is optional — confirm before including it.
4. Create/upsert periodic-use records per mode, referencing the matching travel emission factor and an owning `Scope3EmssnSrc`.
5. Assert with `run_soql`: counts per travel-mode object.
6. Report created record counts and IDs. Suggest `/nzc:calculate-footprints` or `/nzc:audit scope3`.
