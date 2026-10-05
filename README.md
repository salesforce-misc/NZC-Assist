# claude-for-net-zero

A Claude Code plugin for **Salesforce Net Zero Cloud** — knowledge, skills, slash commands, agents, and a functional Salesforce org MCP server for carbon-accounting and sustainability implementations.

## Overview

NZC-Assist is an AI-powered assistant that helps implementation teams configure Salesforce Net Zero Cloud faster and with fewer mistakes. It provides:

- **Expert guidance** on the full Net Zero Cloud journey — licensing, settings, record types, reference/emission-factor data, stationary assets, vehicles, waste, water, Scope 3 procurement and travel, footprint calculation, and annual emissions inventories
- **Automated health checks and audits** to catch missing licenses/permissions, misconfigured settings, missing factor data, or footprints not linked to an inventory
- **Hybrid sample-data scaffolding** — committed reference/emission-factor seed data plus runtime-generated transactional energy-use, activity, and footprint records, with reverse-order teardown
- **Persona-driven agents** that adapt to your role — consultant, admin, data architect, or SDET
- **Direct org integration** via SOQL, metadata describe/deploy, permission set/PSL assignment, and bulk data load, driven through the `sf` CLI

Net Zero Cloud v1 scope for this plugin is **data & config only**: licensing, permission sets, Industries/Sustainability settings, record types + `*Config` metadata, and the emissions data model + sample data. It deliberately excludes LWCs, FlexiPages, CRM Analytics dashboards, the custom app, and any navigation-item framework.

For a full walkthrough of capabilities, installation steps, and available commands, see the **[User Guide](docs/USER_GUIDE.md)**.

## Quick start

```bash
npm install
npm run build
claude --plugin-dir /path/to/NZC-Assist
```

Then in Claude Code:

```
/nzc:setup-plugin
```

## What's inside

- **Skills** — Auto-invoked guidance for each Net Zero Cloud domain (data model, licensing, reference data, stationary/buildings, vehicles/fleet, waste, water, Scope 3, footprint calc, annual inventory, sample data, testing)
- **Commands** — `/nzc:enable-net-zero`, `/nzc:assign-permissions`, `/nzc:configure-*`, `/nzc:load-reference-data`, `/nzc:scaffold-sample-data`, `/nzc:calculate-footprints`, `/nzc:audit`, `/nzc:health-check`, and more
- **Agents** — `nzc-sdet`, `nzc-consultant`, `nzc-admin`, `nzc-data-architect`, `nzc-journey-architect`
- **MCP server** — Salesforce CLI wrappers, SOQL/describe/CRUD/bulk/metadata deploy tools, permission set + PSL assignment, NZC-specific setup and sample-data tools, and an audit framework

## Reference

- [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) — complete user guide with installation, capabilities, and key concepts
- `JOURNEY_MAP.md` — the canonical journey + setup-sequence blueprint that drives every skill and command
- `PERSONA_JOURNEYS.md` — per-persona setup + daily-loop journeys
- `CLAUDE.md` — repo-level constitution for AI agents working in this plugin
- `knowledge/data-model.md` / `knowledge/setup-order.md` — the reference → source → energy use → footprint → inventory pipeline, in prose
- `documentation/` — curated links into the official Net Zero Cloud Developer Guide (source of truth; no PDFs, no personal paths)

## Disclosure & Compliance Hub (DCH)

`/nzc:setup-dch` installs and configures DCH on a Net Zero Cloud org: the OmniStudio + DocGen foundation, then the GRI, ESRS, CDP and SASB framework packages with their Word report templates. Use a scratch org built with `create_scratch_org` and `definitionFile: "dch"`. The optional DocGen sample packs need the `vlocity` CLI (`npm install -g vlocity`); without it that step is skipped. Content is derived from an internal DCH setup project — see `metadata/dch/NOTICE.md`.

## Status

`v0.2.0` — adds Disclosure & Compliance Hub (DCH) setup: `/nzc:setup-dch`, `/nzc:dch-status`, and `create_scratch_org` with `definitionFile: "dch"`. Scaffold otherwise in progress. See `JOURNEY_MAP.md` for the implementation phasing.

## Open Source Governance

- License: Apache 2.0 (`LICENSE.txt`)
- Contribution guide: `CONTRIBUTING.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- Security policy: `SECURITY.md`
