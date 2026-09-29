---
description: Deploy Net Zero Cloud record types and their *Config metadata
---

# Configure Net Zero Cloud Record Types

Deploy the record types Net Zero Cloud's source objects need, plus their companion `*Config` custom metadata.

$ARGUMENTS

## Steps

1. Confirm org connection and license (`describe_sobject StnryAssetEnvrSrc`) before deploying.
2. Confirm which domain(s) to configure from arguments, or ask (stationary/buildings, vehicles/fleet, or all).
3. Call `deploy_metadata` against `metadata/record-types/` to deploy:
   - `StnryAssetEnvrSrc`: `Commercial_Building`, `Data_Center`
   - `BldgEnrgyIntensity`: `Building_Energy_Intensity`, `Regional_Building_Energy_Intensity`
   - `VehicleAssetEmssnSrc`: `Fleet_Vehicle`, `Private_Jet`
4. Call `deploy_metadata` against `metadata/nzc-configs/` for the matching `*Config` custom metadata (`stationaryAssetEnvSourceConfigs`, `buildingEnergyIntensityConfigs`, `vehicleAssetEmssnSourceConfigs`).
5. Verify with `describe_sobject` on each source object — confirm the expected record types now appear.
6. Report deployed record types and any deploy errors verbatim (don't paraphrase Salesforce error text).
7. Suggest next step: `/nzc:load-reference-data`.
