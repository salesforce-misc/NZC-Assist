---
description: View a dashboard of the connected Net Zero Cloud org
---

# Net Zero Cloud Org Status

Show a single dashboard view of the connected Net Zero Cloud org.

## Steps

Call `get_org_status` and render:

- Org info (instance, edition, namespace, API version, last refresh)
- Net Zero Cloud license status (`describe_sobject StnryAssetEnvrSrc` success/failure)
- Enabled Industries/Sustainability settings flags (`enableSC*` — stationary assets, vehicle assets, waste, water, Scope 3 procurement, Scope 3 travel)
- PSL assignment counts (`NetZeroCloudUserPsl`, `DataProcessingEnginePsl`, `TCRMforSustainabilityPsl`) and permission-set assignment counts (`NetZeroManager`, `DataProcessingEngineUser`, `TCRMforSustainabilityAdmin`/`User`)
- Record types deployed per source object (`StnryAssetEnvrSrc`, `VehicleAssetEmssnSrc`, `BldgEnrgyIntensity`)
- Reference-data coverage counts (electricity/procurement/waste/travel factor sets, scope allocation, inflation rates)
- Counts of key pipeline objects: sources per domain, periodic energy/activity use per domain, footprints per domain, `AnnualEmssnInventory` records
- Footprints missing an `AnnualEmssnInventoryId` link (should be zero)

Present as a compact ASCII dashboard.
