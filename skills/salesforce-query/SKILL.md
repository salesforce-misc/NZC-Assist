---
name: salesforce-query
description: Helps construct and execute SOQL queries against the connected Net Zero Cloud Salesforce org. Use when the user wants to query sources, energy/activity use, footprints, accounts, suppliers, or any other Net Zero Cloud or standard Salesforce object.
---

# Net Zero Cloud SOQL Query Helper

You build correct, efficient SOQL against a Net Zero Cloud org.

## Workflow

1. Verify org connection (`check_nzc_setup`).
2. **Always describe before querying** — call `describe_sobject` to confirm field API names. Net Zero Cloud object/field names can change by release.
3. Construct the query with verified field names.
4. Execute with `run_soql`.
5. Format results as a readable table.

## Common starter queries

```soql
-- Stationary sources owned by an account
SELECT Id, Name, AccountId, RecordType.DeveloperName
FROM StnryAssetEnvrSrc
WHERE AccountId = :accountId

-- Footprints missing an inventory link (data-integrity check)
SELECT COUNT() FROM StnryAssetCrbnFtprnt WHERE AnnualEmssnInventoryId = null

-- Scope 3 procurement sources without a supplier
SELECT Id, Name FROM Scope3EmssnSrc
WHERE RecordType.DeveloperName = 'Procurement' AND SupplierId = null

-- Reference-data coverage check
SELECT COUNT() FROM PcmtEmssnFctrItem

-- Vehicle energy use threaded off a source
SELECT Id, VehicleAssetEmssnSrcId, EnergyQuantity__c, Period__c
FROM VehicleAssetEnrgyUse
WHERE VehicleAssetEmssnSrcId = :sourceId
```

(Field names above follow the plugin's design-time model — confirm every one with `describe_sobject` before relying on it.)

## NEVER use SOQL for these

These are Tooling API / Metadata API entities and **will fail** in standard SOQL:

- Record types on `StnryAssetEnvrSrc`, `VehicleAssetEmssnSrc`, `BldgEnrgyIntensity` (use `describe_sobject` or `retrieve_metadata`)
- `*Config` custom metadata types (`stationaryAssetEnvSourceConfigs`, `vehicleAssetEmssnSourceConfigs`, `buildingEnergyIntensityConfigs`) — use `retrieve_metadata`/`deploy_metadata`
- `Industries.settings` / `enableSC*` flags — use `deploy_metadata`

If the user asks for one of these via SOQL, redirect to the right tool.

## Performance reminders

- Always include a selective `WHERE` filter — energy-use and travel objects can grow large even in a sample-data org.
- Use `LIMIT` for exploration.
- `COUNT()` queries (no field list) are the fastest way to verify a load completed — prefer them over pulling full rows just to check volume.

## See also

`nzc-data-model` skill · `nzc-testing-validation` skill.
