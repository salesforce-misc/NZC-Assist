# Settings — Industries / Sustainability Enablement

Org-wide feature flags that gate which Net Zero Cloud domains are active. Deployed as `Industries.settings` metadata. Most flags are one-way once turned on — treat every enable as a confirm-first action.

## Primary objects / metadata

`Industries.settings` (`enableSC*` flags — one per domain: stationary assets, vehicle assets, waste, water, Scope 3 procurement, Scope 3 travel).

## Sources

- Journey row 4 in [`JOURNEY_MAP.md`](../../../JOURNEY_MAP.md)
- Net Zero Cloud Developer Guide — see `documentation/README.md` for the confirmed link once fetched

## Setup-sequence position

Step 4 — after licensing/PSLs/permission sets (steps 1-3), before record types (step 5). A domain's record types and `*Config` metadata are meaningless until that domain's settings flag is on.

## Related module

[`record-types-config/`](../record-types-config/README.md) — depends directly on this module being complete first.
