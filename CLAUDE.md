# Claude for Net Zero Cloud

A Claude Code plugin providing Net-Zero-Cloud-specific knowledge, templates, tools, skills, and agents for **Salesforce Net Zero Cloud** carbon-accounting and sustainability implementations.

## Org Selection — IMPORTANT

When connecting to a Salesforce org, follow these rules strictly:

1. **If only one org is authenticated**, use it automatically — do not ask the user.
2. **If multiple orgs are authenticated and no target is set**, ask the user **exactly once** which org to use, then call `set_target_org` with their choice.
3. **Once an org is selected (via `set_target_org` or auto-detection), NEVER ask again.** The choice persists for the entire session. All tools automatically use the selected org.
4. **Do not call `check_nzc_setup` or `list_sf_orgs` before every operation.** Only call them if the user explicitly asks about setup or if a tool returns an authentication error.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Claude Code                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                  nzc (Plugin)                            │ │
│  │                                                          │ │
│  │  Skills (Auto-invoked)    │   Commands (User-invoked)   │ │
│  │  ─────────────────────    │   ─────────────────────────  │ │
│  │  • nzc-data-model          │   • /nzc:setup-plugin       │ │
│  │  • nzc-foundation-licensing│   • /nzc:enable-net-zero    │ │
│  │  • nzc-sample-data         │   • /nzc:scaffold-sample-data│ │
│  │  • (12 more)               │   • /nzc:audit              │ │
│  │                           │   • (18 more)                │ │
│  │                                                          │ │
│  │  Agents                   │   MCP Server (Tools)         │ │
│  │  ─────────────────────    │   ───────────────────────── │ │
│  │  • nzc-sdet                │   • Knowledge tools          │ │
│  │  • nzc-consultant          │   • Salesforce org tools     │ │
│  │  • nzc-admin               │   • SOQL, CRUD, metadata     │ │
│  │  • nzc-data-architect      │   • NZC setup + sample data  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                           │                                  │
│                           ▼                                  │
│                    Salesforce CLI (sf)                       │
│                           │                                  │
│                           ▼                                  │
│              Your Net Zero Cloud Salesforce Org              │
└─────────────────────────────────────────────────────────────┘
```

## Canonical Journey + Setup Order

See **`JOURNEY_MAP.md`** for the canonical 16-row journey map and 15-step dependency-ordered setup sequence. Every skill, command, and agent must respect this ordering.

**Key irreversible / hard-to-reverse steps** (never recommend lightly):
- **NZC / Data Processing Engine / TCRM-for-Sustainability licenses** — provisioned by Salesforce; cannot be self-service enabled or revoked. Detect with `describe_sobject StnryAssetEnvrSrc` before attempting anything else.
- **Industries/Sustainability settings flags** (`enableSC*` in `Industries.settings`) — most are one-way once turned on; assume no clean "off" path once deployed.
- **Record types** (`StnryAssetEnvrSrc`, `VehicleAssetEmssnSrc`, `BldgEnrgyIntensity`) — once referenced by live source/energy-use/footprint data, deleting or renaming them requires manual reassignment first.

**Footprint calculation is always last.** `StnryAssetCrbnFtprnt`, `VehicleAssetCrbnFtprnt`, and `Scope3CrbnFtprnt` records require their source object's energy/activity-use records **and** an existing `AnnualEmssnInventory` to already exist. Never attempt footprint calculation before both are in place.

## Target Users

- **Sustainability Program Manager** *(primary persona)*: Org-wide rollout sequencing, licensing/PSL readiness, go-live checklists, cross-team reporting scope.
- **ESG / Sustainability Analyst or Data Architect**: Emission-factor data model, source-to-footprint traceability, annual inventory construction, Scope 1/2/3 coverage.
- **Administrators**: Day-to-day permission set / PSL maintenance, Industries settings toggles, record type upkeep.
- **Implementation Consultants**: Setup sequencing, prerequisite validation, go-live readiness across the full NZC data model.
- **SDET / QA engineers**: Repeatable sample-data scaffolding, teardown, count/integrity validation, audit automation.

## Plugin Components

### Skills (Claude auto-invokes based on context)

| Skill | Description |
|-------|-------------|
| `nzc-data-model` | Expert knowledge of the Net Zero Cloud data model (reference → source → energy use → footprint → inventory pipeline) |
| `nzc-foundation-licensing` | NZC/DPE/TCRM licenses, permission set licenses, permission sets — the mandatory foundation |
| `nzc-reference-data` | Emission factor sets/items, scope allocation, inflation rates, UOM conversions, fuel types |
| `nzc-stationary-buildings` | Stationary assets (buildings, data centers), building size category, building energy intensity |
| `nzc-vehicles-fleet` | Vehicle/fleet emission sources and vehicle energy use |
| `nzc-waste` | Waste generation sources, waste disposal emission factors, waste footprints |
| `nzc-water` | Stationary asset water activity and water footprints |
| `nzc-scope3-procurement` | Scope 3 procurement emission sources, spend-based procurement items and factors |
| `nzc-scope3-travel` | Scope 3 business travel — air, hotel, rental car, ground travel energy use |
| `nzc-carbon-footprint-calc` | Carbon footprint calculation across stationary/vehicle/waste/water/Scope 3 sources, linked to the annual inventory |
| `nzc-annual-inventory` | Annual Emissions Inventory construction — the umbrella container every footprint must reference |
| `nzc-sample-data` | Orchestrates the hybrid seed + runtime-generation sample-data build (reference seed → structural seed → generated transactional data → footprints) |
| `nzc-testing-validation` | Validation-rule authoring/execution, audit interpretation, fixture teardown |
| `nzc-troubleshoot` | Diagnoses and resolves Net Zero Cloud configuration and data issues |
| `salesforce-query` | Helps construct and execute SOQL queries |

### Commands (User-invoked with `/nzc:command`)

| Command | Description |
|---------|-------------|
| `/nzc:setup-plugin` | Check plugin status and connect to a Salesforce org |
| `/nzc:getting-started` | Interactive onboarding |
| `/nzc:status` | Dashboard view of the connected Net Zero Cloud org |
| `/nzc:open-org` | Open the connected org in the browser |
| `/nzc:soql-query` | Run a SOQL query |
| `/nzc:describe` | Describe a Salesforce object's fields |
| `/nzc:help` | Search the Net Zero Cloud knowledge base by topic |
| `/nzc:docs` | Browse Net Zero Cloud documentation by category |
| `/nzc:enable-net-zero` | Wizard — verify licensing, deploy Industries/Sustainability settings |
| `/nzc:assign-permissions` | Wizard — PSLs + permission sets (NetZeroManager, DPE User, TCRM Admin/User) |
| `/nzc:configure-record-types` | Wizard — record types + `*Config` metadata for sources and building intensity |
| `/nzc:load-reference-data` | Load committed emission-factor / reference seed data in dependency order |
| `/nzc:configure-stationary-assets` | Wizard — stationary asset sources (buildings, data centers) |
| `/nzc:configure-vehicles` | Wizard — vehicle/fleet emission sources |
| `/nzc:configure-waste` | Wizard — waste generation sources |
| `/nzc:configure-water` | Wizard — water activity sources |
| `/nzc:configure-scope3-procurement` | Wizard — Scope 3 procurement sources + suppliers |
| `/nzc:configure-scope3-travel` | Wizard — Scope 3 business travel sources |
| `/nzc:scaffold-sample-data` | **SDET** — generate + load a full sample data graph (sources → energy/activity use → footprints) to target counts |
| `/nzc:calculate-footprints` | Calculate/load carbon footprints linked to the annual inventory |
| `/nzc:build-annual-inventory` | Create/verify the Annual Emissions Inventory container for a fiscal year |
| `/nzc:audit` | Run validation rules against the connected org |
| `/nzc:health-check` | Comprehensive Net Zero Cloud org health check |

### Agents

| Agent | Description |
|-------|-------------|
| `nzc-sdet` | **Primary (execution)** — SDET/QA engineer for sample-data scaffolding, teardown, count/integrity validation, audits |
| `nzc-consultant` | Senior implementation consultant — rollout sequencing, prerequisite validation, go-live readiness |
| `nzc-admin` | Day-to-day Net Zero Cloud administrator — executes configuration + permission changes |
| `nzc-data-architect` | Data model expert — factor wiring, sample-data graph design, footprint↔inventory integrity |
| `nzc-journey-architect` | Router — maps a request onto `JOURNEY_MAP.md` and delegates to the right skill/agent/command |

## Critical conventions for Claude (do not skip)

### License & enablement gate — check this first, always

Net Zero Cloud objects and settings fields do not exist in an org without the NZC license provisioned. Before attempting any settings, record-type, or data work, call `describe_sobject` on `StnryAssetEnvrSrc`. If it fails, **stop and report** — do not attempt settings deploys or data loads against an unlicensed org.

### Tooling-API / metadata entities — never use `run_soql`

Record types, `*Config` custom metadata (`buildingEnergyIntensityConfigs`, `stationaryAssetEnvSourceConfigs`, `vehicleAssetEmssnSourceConfigs`), and Industries/Sustainability settings (`Industries.settings`) are metadata, not data. The relevant skills must call `deploy_metadata` / `retrieve_metadata`, never `run_soql`.

### Strict load order — never reorder

License/PSLs → permission sets → Industries/Sustainability settings → record types + `*Config` metadata → reference/factor data → accounts/suppliers → annual inventory → sources → periodic energy/activity use → carbon footprints. See `JOURNEY_MAP.md` Part 2 for the full 15-step sequence and the reasoning behind each position.

### Factor sets before energy use; footprints must reference the inventory

Emission factor sets/items must be loaded before any energy or activity use record that relies on them. Every carbon footprint record must carry a non-null `AnnualEmssnInventoryId` — a footprint with no inventory link is invalid and validation rules will flag it.

### Always `describe_sobject` before building SOQL or CSVs

Net Zero Cloud object and field API names drift across releases. Never hand-write a SOQL query or a bulk-load CSV header row against a Net Zero object without describing it first in the current org.

### Never fabricate emission-factor values

Committed reference/seed data (`data/reference/`) must reflect real, sourced emission factors (e.g., published EPA/DEFRA/GHG Protocol figures) — never invented numbers. Only transactional volumes (energy use quantities, travel nights, procurement spend) are synthetically generated at runtime.

## Reference

- `JOURNEY_MAP.md` — the canonical journey + setup-sequence blueprint
- `knowledge/data-model.md` — the reference → source → energy use → footprint → inventory pipeline
- `knowledge/setup-order.md` — prose walkthrough of the dependency-ordered setup sequence
- `documentation/README.md` — curated links into the official Net Zero Cloud Developer Guide (source of truth; no PDF, no personal paths)
- https://developer.salesforce.com/docs/atlas.en-us.netzero_cloud_dev_guide.meta/netzero_cloud_dev_guide/netzero_cloud_std_objects_intro.htm — Net Zero Cloud Developer Guide: Standard Objects
