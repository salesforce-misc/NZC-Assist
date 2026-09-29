---
description: Assign Net Zero Cloud permission set licenses and permission sets to a user
---

# Assign Net Zero Cloud Permissions

Assign the permission set licenses (PSLs) and permission sets a user needs to work in Net Zero Cloud.

$ARGUMENTS

## Steps

1. Identify the target user (username/email) from arguments, or ask.
2. Confirm org connection with `check_nzc_setup`.
3. Verify available PSLs and permission sets with `list_permission_sets`; confirm exact `DeveloperName`s rather than assuming (`NetZeroCloudUserPsl`, `DataProcessingEnginePsl`, `TCRMforSustainabilityPsl`, `NetZeroManager`, `DataProcessingEngineUser`, `TCRMforSustainabilityAdmin`/`TCRMforSustainabilityUser`).
4. Assign PSLs with `assign_permset_license` (primary path: `sf org assign permsetlicense`; if that fails, the tool falls back to an anonymous-Apex insert of `PermissionSetLicenseAssign` — report which path was used).
5. Assign permission sets with `assign_permset`.
6. Re-query assignments (`PermissionSetLicenseAssign`, `PermissionSetAssignment`) to confirm success.
7. Report a clear before/after summary per user. If any assignment fails, show the raw error rather than guessing at a cause — point to `nzc-foundation-licensing` skill for known failure modes.
