# Net Zero Cloud — Persona-Driven Setup Journeys

> Companion to `JOURNEY_MAP.md`. The journey map answers *"what is the canonical NZC blueprint?"*; this doc answers *"if I am persona X, what do I do tomorrow morning?"*.
>
> **Provenance note.** AutomotiveAssist's equivalent file is built on a real, verified Salesforce Help article ("Key Roles and Responsibilities in Automotive Cloud") that names specific OEM/dealer business roles with quoted responsibility text. A research pass looking for an equivalent published article for Net Zero Cloud came back **inconclusive** (search/browser tooling failures prevented a real check — not a confirmed "no such article exists"). Rather than fabricate role names or quotes and attribute them to an unverified source, the five personas below are **the plugin's own model**, first defined in `CLAUDE.md` § "Target Users." This mirrors AutoAssist's own "Implementation-team personas (plugin-internal)" section, which uses this same non-quoted, plugin-defined approach for its `auto-consultant`/`auto-admin`/`auto-developer`/`auto-sdet` agents. If a verified Salesforce-published NZC roles article turns up later, this file should be revised to quote it directly, the way AutoAssist's is.
>
> Sources: `CLAUDE.md` § "Target Users" · `JOURNEY_MAP.md` (16-row journey map + 15-step setup sequence) · `knowledge/modules/*` · skills under `skills/nzc-*/SKILL.md`.
> Last revised: 2026-09-29.

---

## How to read this doc

Each persona section contains:

1. **Role label** — as defined in `CLAUDE.md` § "Target Users."
2. **Plugin-defined responsibility** — this plugin's own description of the role (not an external quote — see provenance note above).
3. **Module footprint** — which of the 11 knowledge modules (plus the cross-cutting foundation/data-model skills) they touch (✅ owns / 🤝 collaborates / — out of scope).
4. **Setup journey** — ordered steps mapped to `JOURNEY_MAP.md` Part 2 numbers, the plugin skill/command to invoke, and hard-to-reverse flags.
5. **Daily-loop journey** — what they do *after* setup is done.
6. **Failure modes** — common ways they get stuck (drawn from `knowledge/troubleshooting/common-issues.md`).
7. **Plugin agent + skills** — which agent/skills the plugin should auto-invoke.

**Hard-to-reverse markers** (carried verbatim from `JOURNEY_MAP.md`):

- 🔒 **NZC / DPE / TCRM-for-Sustainability licenses** — provisioned by Salesforce; no self-service path either direction.
- 🔒 **Industries/Sustainability settings flags** (`enableSC*`) — most are one-way once turned on.
- ⚠️ **Footprint calculation is always last** — every prior phase (license → settings → record types → reference data → accounts/sources → periodic use → annual inventory) must be complete first.

---

## Persona index

| # | Role | Plugin agent | Primary module cluster |
|---|---|---|---|
| 1 | [Sustainability Program Manager](#1-sustainability-program-manager) *(primary)* | `nzc-consultant` | Annual inventory, footprint calc (go-live/reporting scope) |
| 2 | [ESG / Sustainability Analyst or Data Architect](#2-esg--sustainability-analyst-or-data-architect) | `nzc-data-architect` | Reference data, all source/footprint domains |
| 3 | [Administrator](#3-administrator) | `nzc-admin` | Foundation/licensing, settings, record types |
| 4 | [Implementation Consultant](#4-implementation-consultant) | `nzc-consultant` | Cross-cutting — sequencing and go-live readiness |
| 5 | [SDET / QA Engineer](#5-sdet--qa-engineer) | `nzc-sdet` | Sample-data scaffolding + validation across every domain |

`nzc-journey-architect` is the cross-cutting router for all five personas — it maps any request onto `JOURNEY_MAP.md` and delegates to the right skill/agent/command, and doesn't own a module footprint of its own.

---

## Cross-cutting setup spine (every persona depends on this)

`JOURNEY_MAP.md` Part 2 defines a 15-step dependency-ordered setup sequence. The **first three steps** apply before any persona-specific configuration:

1. 🔒 NZC license provisioned (detect via `describe_sobject StnryAssetEnvrSrc`)
2. Permission Set Licenses (`NetZeroCloudUserPsl`, `DataProcessingEnginePsl`, `TCRMforSustainabilityPsl`)
3. Permission sets (`NetZeroManager`, `DataProcessingEngineUser`, `TCRMforSustainabilityAdmin`, `TCRMforSustainabilityUser`)

Steps 4–13 are domain-specific and live under each persona below. Step 14 (⚠️ footprint calculation) is always last among v1-scoped steps; step 15 (targets/forecast/credits/ESG) is out of v1 scope entirely.

---

## 1. Sustainability Program Manager

**Plugin-defined responsibility.** Owns the rollout end-to-end: sequencing which domains go live in which order, confirming licensing/PSL readiness before committing to a timeline, signing off on go-live checklists, and setting the cross-team reporting scope (which fiscal year, which domains) that the annual inventory ultimately has to satisfy.

### Module footprint

| Module | Status | Why |
|---|:---:|---|
| Foundation & licensing | 🤝 | Needs to know it's done, doesn't execute it |
| Settings | 🤝 | Approves which domains get enabled and when |
| Record types & config | — | Delegated |
| Reference data | 🤝 | Cares that coverage is complete, not how it's loaded |
| Stationary / Vehicles / Waste / Water / Scope 3 | 🤝 | Approves domain scope and sequencing |
| Annual inventory | ✅ | Owns the fiscal-year/reporting-scope decision |
| Footprint calc | ✅ | Owns the go-live milestone — reporting can't start until this is real |

### Setup journey

| Step | Action | Plugin surface |
|---|---|---|
| Spine 1–3 | Confirm licensing/PSL/permset readiness | `/nzc:status`, `/nzc:health-check` |
| 4 | Approve settings rollout scope (which domains, what order) | `nzc-consultant` |
| 11 | Decide the fiscal year(s) in scope; confirm `/nzc:build-annual-inventory` | `/nzc:build-annual-inventory` |
| 14 | Confirm footprint calculation is complete and linked before declaring go-live | `/nzc:calculate-footprints`, `/nzc:audit` |

### Daily-loop journey

- Track go-live checklist status across domains via `/nzc:health-check`.
- Review `/nzc:audit` output before any milestone sign-off.
- Decide reporting-scope questions (which fiscal year, which domains count) that downstream data architects implement.

### Failure modes

- Declares go-live before `/nzc:audit` is clean — footprints missing an inventory link surface later as reporting gaps.
- Approves settings rollout without knowing a flag is one-way — reversal requires a support case.

### Plugin agent + skills

`nzc-consultant` · `nzc-annual-inventory` · `nzc-carbon-footprint-calc` · `nzc-testing-validation`.

---

## 2. ESG / Sustainability Analyst or Data Architect

**Plugin-defined responsibility.** Owns the emission-factor data model itself: which factor sets apply to which sources, source-to-footprint traceability, annual inventory construction mechanics, and making sure Scope 1/2/3 coverage is actually complete rather than just plausible-looking.

### Module footprint

| Module | Status | Why |
|---|:---:|---|
| Foundation & licensing | — | Delegated to admin |
| Settings | 🤝 | Needs domains on before modeling them |
| Record types & config | ✅ | Owns the `*Config` metadata that drives calculation behavior |
| Reference data | ✅ | Owns factor-set correctness — never fabricated, always sourced |
| Stationary / Vehicles / Waste / Water | ✅ | Owns the object graph for every in-scope domain |
| Scope 3 — procurement / travel | ✅ | Owns supplier/category factor wiring |
| Annual inventory | 🤝 | Consumes the PM's fiscal-year decision |
| Footprint calc | ✅ | Owns correctness of the rollup itself |

### Setup journey

| Step | Action | Plugin surface |
|---|---|---|
| 5–6 | Record types + `*Config` metadata per domain | `/nzc:configure-record-types` |
| 7–9 | UOM/fuel types, factor sets/items/scope-alloc/inflation, building intensity benchmarks | `/nzc:load-reference-data` |
| 12–13 | Sources, then periodic energy/activity use, per domain | `/nzc:configure-stationary-assets`, `/nzc:configure-vehicles`, `/nzc:configure-waste`, `/nzc:configure-water`, `/nzc:configure-scope3-procurement`, `/nzc:configure-scope3-travel` |
| 14 | Footprint calculation — verify every record links to the annual inventory | `/nzc:calculate-footprints` |

### Daily-loop journey

- Verify new factor data against the source-of-truth Developer Guide before committing it — never invent a number.
- Trace a specific footprint back through its source and factor set when a number looks wrong.
- Run `/nzc:describe` before writing any new SOQL or CSV header — object/field names drift across releases.

### Failure modes

- Loads energy-use data before the matching factor set exists → footprint calculates to zero, looks superficially fine.
- Scope 3 procurement source created before its Supplier exists → orphaned source, flagged by `scope3-procurement-sources-have-supplier`.
- Trusts a cached object/field name from a prior release instead of re-describing.

### Plugin agent + skills

`nzc-data-architect` · `nzc-data-model` · `nzc-reference-data` · `nzc-stationary-buildings` · `nzc-vehicles-fleet` · `nzc-waste` · `nzc-water` · `nzc-scope3-procurement` · `nzc-scope3-travel` · `nzc-carbon-footprint-calc`.

---

## 3. Administrator

**Plugin-defined responsibility.** Owns day-to-day operational upkeep: permission set / PSL maintenance as users join or change roles, Industries/Sustainability settings toggles, and record-type upkeep as domains get added.

### Module footprint

| Module | Status | Why |
|---|:---:|---|
| Foundation & licensing | ✅ | Owns PSL/permset assignment on an ongoing basis |
| Settings | ✅ | Executes the settings deploy the PM/consultant approved |
| Record types & config | ✅ | Executes record-type/`*Config` deploys |
| Reference data | 🤝 | Runs the load, doesn't author the values |
| Every domain module | 🤝 | Executes configuration wizards; doesn't design the data model |
| Footprint calc | — | Delegated to the data architect |

### Setup journey

| Step | Action | Plugin surface |
|---|---|---|
| Spine 1–3 | 🔒 Confirm license, assign PSLs and permission sets | `/nzc:assign-permissions` |
| 4 | Deploy Industries/Sustainability settings | `/nzc:enable-net-zero` |
| 5–6 | Deploy record types + `*Config` metadata | `/nzc:configure-record-types` |
| — | Ongoing: reassign PSLs/permsets as users change roles | `/nzc:assign-permissions`, `/nzc:audit` |

### Daily-loop journey

- Assign PSLs/permission sets to newly onboarded users.
- Re-run `/nzc:health-check` after any Salesforce release upgrade — object/field/settings names can drift.
- Field "why can't this user see X" questions — usually a missing PSL or permission set, not a data problem.

### Failure modes

- Assigns a permission set but not the underlying PSL (or vice versa) — user still can't see the feature.
- Uses a `DeveloperName` for `sf org assign permsetlicense` that doesn't match this org's actual PSL name — silent no-op; confirm via SOQL first.
- Flips a settings flag expecting it to be reversible — most `enableSC*` flags are one-way.

### Plugin agent + skills

`nzc-admin` · `nzc-foundation-licensing` · `salesforce-query` · `nzc-troubleshoot`.

---

## 4. Implementation Consultant

**Plugin-defined responsibility.** Owns setup sequencing and prerequisite validation across the whole rollout — the person who can answer "what has to happen before we can turn on Scope 3 travel" and catches a skipped step before it becomes a data-integrity problem three phases later.

### Module footprint

| Module | Status | Why |
|---|:---:|---|
| Foundation & licensing | ✅ | Validates this is actually done before anything else starts |
| Settings | ✅ | Sequences which domains go live in which order |
| Every domain module | 🤝 | Validates prerequisites; doesn't execute the domain-specific config itself |
| Annual inventory / Footprint calc | 🤝 | Confirms readiness; the analyst/architect owns correctness |

### Setup journey

| Step | Action | Plugin surface |
|---|---|---|
| All | Walk `JOURNEY_MAP.md` Part 2 end-to-end with the customer; flag any step being skipped | `nzc-journey-architect`, `/nzc:status` |
| Spine 1–3 | Confirm licensing before committing to any timeline | `/nzc:setup-plugin` |
| 14 | Go-live readiness check before declaring the rollout complete | `/nzc:audit`, `/nzc:health-check` |

### Daily-loop journey

- Run `/nzc:audit` at the end of every implementation phase, not just at the end of the project.
- Translate `knowledge/setup-order.md`'s five phases into a customer-facing rollout plan.
- Flag every 🔒 hard-to-reverse step to the customer *before* it's flipped, not after.

### Failure modes

- Sequences a domain's go-live before its reference data is confirmed loaded — `/nzc:audit` catches this, but only if it's actually run.
- Assumes a settings flag is reversible and recommends flipping it "to test" — most are one-way.

### Plugin agent + skills

`nzc-consultant` · `nzc-journey-architect` · `nzc-data-model` · `nzc-testing-validation`.

---

## 5. SDET / QA Engineer

**Plugin-defined responsibility.** Owns repeatable sample-data scaffolding and teardown, count/integrity validation, and audit automation — the primary persona for exercising this plugin's core "replicate NZCwithSampleData via LLM skills" goal.

### Module footprint

| Module | Status | Why |
|---|:---:|---|
| Foundation & licensing | 🤝 | Needs it done; doesn't own it |
| Reference data | 🤝 | Verifies counts loaded; doesn't author values |
| Stationary / Vehicles / Waste / Water | ✅ | Scaffolds sample sources + energy/activity use to target counts |
| Scope 3 — procurement / travel | ✅ | Scaffolds sample sources + line items to target counts |
| Annual inventory | 🤝 | Needs it to exist; doesn't decide the fiscal year |
| Footprint calc | ✅ | Validates every footprint links to the inventory |

### Setup journey

| Step | Action | Plugin surface |
|---|---|---|
| Pre-req | Confirm foundation + reference data are complete (refuses to scaffold otherwise) | `/nzc:scaffold-sample-data` |
| 10–13 | Generate + bulk-load accounts/suppliers, sources, periodic use to target counts, threading parent IDs at each tier | `/nzc:scaffold-sample-data` |
| 14 | Generate/verify footprints link to the annual inventory | `/nzc:calculate-footprints`, `/nzc:audit` |
| Teardown | Delete every created ID in reverse dependency order | `/nzc:scaffold-sample-data --teardownId` |

### Daily-loop journey

- Scaffold a fresh sample-data graph before a demo or a test run; tear it down afterward.
- Run `/nzc:audit` and `COUNT()` assertions after every load tier, not just at the end.
- Refuse (by default) to bulk-write against a production-type org without explicit confirmation — the connected `AF1`-style org is a live example of exactly this case.

### Failure modes

- Scaffolds data without recording a fixture manifest — teardown has nothing to reverse.
- Generates transactional volumes before checking `/nzc:load-reference-data` actually completed — footprints calculate to zero.
- Runs a bulk load against production without confirming that's intended.

### Plugin agent + skills

`nzc-sdet` · `nzc-sample-data` · `nzc-testing-validation` · `salesforce-query`.

---

## Module ↔ Persona ownership matrix

(✅ owns · 🤝 collaborates · — out of scope)

| # | Module | Sustainability PM | ESG Analyst / Data Architect | Admin | Consultant | SDET |
|---|---|:---:|:---:|:---:|:---:|:---:|
| — | Foundation & licensing *(cross-cutting)* | 🤝 | — | ✅ | ✅ | 🤝 |
| 4 | Settings | 🤝 | 🤝 | ✅ | ✅ | 🤝 |
| 5 | Record types & config | — | ✅ | ✅ | 🤝 | 🤝 |
| 6 | Reference data | 🤝 | ✅ | 🤝 | 🤝 | 🤝 |
| 7 | Stationary / buildings | 🤝 | ✅ | 🤝 | 🤝 | ✅ |
| 8 | Vehicles / fleet | 🤝 | ✅ | 🤝 | 🤝 | ✅ |
| 9 | Waste | 🤝 | ✅ | 🤝 | 🤝 | ✅ |
| 10 | Water | 🤝 | ✅ | 🤝 | 🤝 | ✅ |
| 11 | Scope 3 — procurement | 🤝 | ✅ | 🤝 | 🤝 | ✅ |
| 12 | Scope 3 — travel | 🤝 | ✅ | 🤝 | 🤝 | ✅ |
| 13 | Annual inventory | ✅ | 🤝 | 🤝 | 🤝 | 🤝 |
| 14 | Footprint calc | ✅ | ✅ | — | 🤝 | ✅ |

> Rows 15 (targets/forecast/credits/ESG) and 16 (testing & go-live) from `JOURNEY_MAP.md` aren't shown here — row 15 is out of v1 scope, and row 16 *is* the SDET column above applied everywhere.

---

## Persona ↔ Skill quick map

| Role | Auto-invoked skills (most-used) |
|---|---|
| Sustainability Program Manager | `nzc-annual-inventory`, `nzc-carbon-footprint-calc`, `nzc-testing-validation` |
| ESG / Sustainability Analyst or Data Architect | `nzc-data-model`, `nzc-reference-data`, `nzc-stationary-buildings`, `nzc-vehicles-fleet`, `nzc-waste`, `nzc-water`, `nzc-scope3-procurement`, `nzc-scope3-travel`, `nzc-carbon-footprint-calc` |
| Administrator | `nzc-foundation-licensing`, `salesforce-query`, `nzc-troubleshoot` |
| Implementation Consultant | `nzc-data-model`, `nzc-testing-validation` |
| SDET / QA Engineer | `nzc-sample-data`, `nzc-testing-validation`, `salesforce-query` |

---

## What this doc deliberately does not do

- **Does not claim these personas are quoted from an official Salesforce article.** See the provenance note at the top — that research came back inconclusive, not confirmed, and this doc says so rather than papering over it.
- **Does not duplicate `JOURNEY_MAP.md`.** The 16-row map and 15-step sequence are authoritative; this doc layers personas on top.
- **Does not override hard-to-reverse markers.** If a step is 🔒 here, it is 🔒 everywhere. The plugin must always confirm with the user before flipping any 🔒 toggle.
- **Does not name specific demo orgs.** Org-specific data (aliases, demo seeds) belongs in local memory, not this file.
- **Does not attempt to be a runbook.** It's a map. Each persona's actual day-to-day uses the linked skills + commands.

---

## Source

> Plugin-internal persona model — see the provenance note at the top of this file. Definitions originate in `CLAUDE.md` § "Target Users"; this file adds setup journeys, module footprints, and failure modes as this plugin's own contribution.
