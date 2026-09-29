# Net Zero Cloud — Setup Order (Prose)

> Prose walkthrough of `JOURNEY_MAP.md` Part 2. Read that table for the authoritative "why this position" / source column; this doc is for talking through the sequence with a user or narrating an audit's findings.

## Why order matters here

Net Zero Cloud has almost no forgiving steps. A footprint calculated before its factor set loads produces a wrong or zero result that looks superficially fine. A source created before its record type exists gets silently miscategorized. The plugin enforces the sequence below rather than letting any command "jump ahead," and every `/nzc:configure-*` command checks its own prerequisites before writing anything.

## The sequence, in five phases

**Phase 1 — Can we even do this? (steps 1-3)**
Confirm the NZC license is actually provisioned (`describe_sobject StnryAssetEnvrSrc` must succeed — if it fails, stop, nothing below is reachable), then layer permission set licenses and permission sets on top. Skipping this phase doesn't just fail loudly — it can fail *silently* if a user has partial access and sees some-but-not-all objects.

**Phase 2 — Turn the lights on (steps 4-6)**
Deploy the Industries/Sustainability settings flags for whichever domains are in scope, then deploy record types and `*Config` metadata. These are metadata operations, never SOQL/DML — see `CLAUDE.md` § "Tooling-API / metadata entities."

**Phase 3 — Load the physics (steps 7-9)**
UOM conversions, fuel types, every emission factor set/item, scope allocation, inflation rates, and (for buildings) size category + energy intensity benchmarks. This is the "physics" of the org — the numbers every footprint will eventually multiply against. Nothing here is generated; it's committed, sourced seed data.

**Phase 4 — Build the graph (steps 10-13)**
Accounts and suppliers, then the annual emissions inventory container (note: the inventory loads *before* sources, even though footprints — its main referrer — load last), then sources for every in-scope domain, then their periodic energy/activity-use records.

**Phase 5 — Roll it up (step 14, always last)**
Carbon footprint calculation. Every footprint must reference an existing annual inventory (phase 4) and rolls up periodic use (phase 4) against factors (phase 3). This is a Data Processing Engine batch job or Setup UI action in most orgs — v1 loads/derives coherent footprint data directly and documents the DPE/UI path rather than invoking DPE.

**Out of v1 scope (step 15)**
Targets, forecasting, carbon credits, and ESG disclosure reporting all depend on one or more complete annual inventories existing first, so even when they're scoped in a later version they'll still sit after step 14.

## Talking a user through it

If someone asks "what's left before I can calculate footprints," the answer is always: walk phases 1 through 4 in order, and don't call `/nzc:calculate-footprints` until `/nzc:audit` (or a targeted describe/SOQL check) confirms every phase-1-through-4 step is actually complete — not just started.

## See also

- `JOURNEY_MAP.md` Part 2 — the authoritative table
- `knowledge/data-model.md` — how the objects at each phase connect
- `knowledge/troubleshooting/common-issues.md` — what it looks like when a phase was skipped
