# NZC-Assist — User Guide

## What Is NZC-Assist?

NZC-Assist (also known as **claude-for-net-zero**) is an AI-powered assistant plugin for **Salesforce Net Zero Cloud**. It gives implementation teams — consultants, admins, data architects, and testers — on-demand expert guidance, automated configuration checks, and sample-data scaffolding so they can stand up Net Zero Cloud orgs faster and with fewer mistakes.

Think of it as a knowledgeable team member who has read the Net Zero Cloud Developer Guide and knows the exact order to license, configure, and populate an org — and which steps are one-way.

---

## Who Is This For?

| Role | How You'll Use It |
|------|-------------------|
| **Sustainability Program Manager** | Get step-by-step rollout sequencing across licensing, settings, and every emissions domain |
| **ESG / Sustainability Analyst or Data Architect** | Work with the emission-factor data model, source-to-footprint traceability, and annual inventory construction |
| **Salesforce Admin** | Run health checks, assign PSLs/permission sets, deploy settings and record types |
| **Implementation Consultant** | Validate prerequisites and go-live readiness across the full data model |
| **SDET / QA** | Scaffold and tear down realistic sample data, validate counts and integrity, run audits |

---

## How to Install

### Prerequisites

- **Node.js** v18 or later
- **Claude Code** (Claude's CLI-based AI coding assistant)
- The **Salesforce CLI** (`sf`)
- A **Salesforce org** with Net Zero Cloud (and Data Processing Engine) licenses provisioned, for live org interactions

### Steps

1. **Clone the repository**

```bash
git clone https://github.com/salesforce-misc/NZC-Assist.git
cd NZC-Assist
```

2. **Install dependencies**

```bash
npm install
```

3. **Build the plugin**

```bash
npm run build
```

4. **Register the plugin with Claude Code**

```bash
claude --plugin-dir /path/to/NZC-Assist
```

5. **Activate inside Claude Code**

Once Claude Code is running, type the following command to initialize the plugin and confirm it's working:

```
/nzc:setup-plugin
```

You should see a confirmation that the Net Zero Cloud skills, commands, and agents are loaded and ready, plus which org (if any) is connected.

---

## Capabilities

### Skills (Auto-Invoked Guidance)

Skills are topic-specific knowledge modules that activate automatically when you ask about a related area. They provide implementation guidance, dependency warnings, and the exact object/field names to verify.

| Skill Area | What It Covers |
|------------|----------------|
| **Data Model** | The reference → source → energy use → footprint → annual inventory pipeline and how every domain follows it |
| **Foundation & Licensing** | NZC/DPE/TCRM permission set licenses and permission sets — the mandatory foundation |
| **Reference Data** | Emission factor sets/items, scope allocation, inflation rates, UOM conversions, fuel types |
| **Stationary Assets & Buildings** | Building/data-center sources, building size category, building energy intensity |
| **Vehicles & Fleet** | Vehicle/fleet emission sources and periodic vehicle energy use |
| **Waste** | Waste generation sources, disposal-method emission factors, waste footprints |
| **Water** | Stationary asset water activity and water footprints |
| **Scope 3 — Procurement** | Supplier-based procurement sources, spend-based factors, inflation normalization |
| **Scope 3 — Business Travel** | Air, hotel, rental car, and ground travel energy use |
| **Carbon Footprint Calculation** | Rolling up energy/activity use against emission factors into footprints linked to the annual inventory |
| **Annual Inventory** | The per-fiscal-year container every footprint must reference |
| **Sample Data** | Orchestrating the hybrid seed + runtime-generation sample-data build, and its teardown |
| **Testing & Validation** | Validation-rule authoring/execution, audit interpretation |

### Commands (On-Demand Actions)

Commands are explicit actions you invoke by typing a slash command in Claude Code.

| Command | What It Does |
|---------|--------------|
| `/nzc:setup-plugin` | Initialize the plugin and verify your environment/org connection |
| `/nzc:health-check` | Scan your org for missing licenses, permissions, or incomplete setup steps |
| `/nzc:audit` | Run the validation-rule library against the connected org |
| `/nzc:describe` | Describe any Net Zero Cloud object — fields, relationships, record types |
| `/nzc:soql-query` | Run SOQL queries against your connected org |
| `/nzc:enable-net-zero` | Verify licensing, then deploy Industries/Sustainability settings |
| `/nzc:assign-permissions` | Assign PSLs and permission sets |
| `/nzc:configure-record-types` | Deploy record types + `*Config` custom metadata |
| `/nzc:load-reference-data` | Load committed emission-factor / reference seed data in dependency order |
| `/nzc:configure-*` | Step-by-step configuration wizards for each domain (stationary assets, vehicles, waste, water, Scope 3 procurement, Scope 3 travel) |
| `/nzc:scaffold-sample-data` | Generate and load a full sample-data graph to target counts, with teardown support |
| `/nzc:build-annual-inventory` | Create/verify the Annual Emissions Inventory container for a fiscal year |
| `/nzc:calculate-footprints` | Calculate/load carbon footprints linked to the annual inventory |
| `/nzc:docs` | Quick-access links to official Net Zero Cloud documentation |

**Disclosure & Compliance Hub:** `/nzc:setup-dch` sets up DCH (OmniStudio/DocGen foundation plus GRI, ESRS, CDP, SASB), `/nzc:setup-dch-framework` sets up one framework, and `/nzc:dch-status` reports what is installed. Build a suitable scratch org with `create_scratch_org` and `definitionFile: "dch"`. Package installs are hard to reverse — use a non-production org.

### Agents (Persona-Driven Assistants)

Agents combine skills and commands into persona-focused workflows. Each agent understands the typical tasks, priorities, and concerns of a specific role.

| Agent | Focus Area |
|-------|-----------|
| **nzc-consultant** | Full rollout lifecycle — sequencing, prerequisite validation, go-live readiness |
| **nzc-admin** | Day-to-day org management — licensing checks, permissions, settings, record types |
| **nzc-data-architect** | Data model depth — factor wiring, sample-data graph design, footprint↔inventory integrity |
| **nzc-sdet** | Test strategy — sample-data fixtures, teardown, count/integrity validation, audits |
| **nzc-journey-architect** | Cross-domain orchestration — routes a request onto the right skill/command/agent via `JOURNEY_MAP.md` |

### MCP Server (Salesforce Org Tools)

The plugin includes a local MCP (Model Context Protocol) server that provides direct integration with your Salesforce org via the `sf` CLI:

- **SOQL queries** — run ad-hoc queries without leaving Claude Code
- **Metadata describe/deploy/retrieve** — inspect objects and deploy settings/record-type metadata
- **Bulk + tree data load** — commit reference seed data and generate transactional sample data
- **Permission set + PSL assignment** — including an anonymous-Apex fallback for PSL assignment
- **Disclosure & Compliance Hub setup** — `setup_dch`, `setup_dch_foundation`, `setup_dch_framework`, `install_dch_package`, `load_dch_templates`, read-only `dch_status`
- **Audit framework** — automated checks against the validation-rule library

---

## Key Concepts

### The Reference → Source → Footprint → Inventory Pipeline

Net Zero Cloud is organized around one repeating pipeline, applied to each domain (stationary, vehicle, waste, water, Scope 3): published emission factors are loaded first, then sources are configured, then periodic energy/activity use is recorded against those sources, and finally carbon footprints roll everything up, always linked to an Annual Emissions Inventory. The plugin follows this exact blueprint — see `JOURNEY_MAP.md` — to ensure you never calculate a footprint before its inputs exist.

### Hard Prerequisites and One-Way Settings

Some steps cannot be skipped or, once done, undone:

- **NZC / Data Processing Engine / TCRM-for-Sustainability licenses** — provisioned by Salesforce; nothing else works without them
- **Industries/Sustainability settings flags** (`enableSC*`) — most are one-way once turned on
- **Record types** — once referenced by live data, changing them requires manual reassignment

### Setup Sequence

The plugin enforces a 15-step dependency-ordered setup sequence (see `JOURNEY_MAP.md` Part 2). You never have to guess "what comes next?" — it handles the ordering for you and refuses to skip ahead.

### Production-Write Safety

Any write operation (settings deploy, permission assignment, sample-data load, teardown) refuses by default against a production-type org and requires explicit confirmation before proceeding.

---

## Getting Help

- Type `/nzc:help` in Claude Code for a list of all available commands
- Type `/nzc:docs` to get links to official Net Zero Cloud documentation
- Check the `JOURNEY_MAP.md` file for the full setup blueprint
- Check the `PERSONA_JOURNEYS.md` file for role-specific workflows
