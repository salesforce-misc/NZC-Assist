---
description: Enable Net Zero Cloud / Sustainability Industries settings in your org
---

# Enable Net Zero Cloud Settings

Turn on the Industries/Sustainability settings flags Net Zero Cloud needs, after confirming the license is actually provisioned.

$ARGUMENTS

## Steps

1. **License pre-check** — call `describe_sobject StnryAssetEnvrSrc`. If it fails, stop here: report that Net Zero Cloud is not provisioned in this org and point to `nzc-foundation-licensing` skill. Do not attempt settings deployment against an unlicensed org.
2. Confirm target org with `check_nzc_setup` / `get_org_status`. If production-type, confirm the user wants to proceed before any deploy.
3. Call `enable_net_zero_settings`, which deploys `metadata/settings/Industries.settings` (the `enableSC*` flags: stationary assets, vehicle assets, waste, water, Scope 3 procurement, Scope 3 travel).
4. Report per-flag result. Some flags may be UI-only in this org/release and fail via metadata deploy — for each failed flag, give the exact Setup path to enable it manually (Setup → Feature Settings → Sustainability, or equivalent) rather than guessing at a fix.
5. Re-verify with a targeted `describe_sobject` or settings read; summarize what's enabled vs. still manual.
6. Suggest next step: `/nzc:assign-permissions`.
