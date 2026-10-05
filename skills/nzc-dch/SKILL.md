---
name: nzc-dch
description: Setting up Disclosure & Compliance Hub (DCH) on a Net Zero Cloud org — OmniStudio + DocGen foundation, and the GRI, ESRS, CDP and SASB disclosure frameworks with their Word report templates. Use when the user asks about DCH, Disclosure and Compliance Hub, ESG disclosure frameworks, GRI/ESRS/CDP/SASB reporting, OmniStudio DocGen for disclosures, or wants to replicate a DCH demo/dev org.
---

# Disclosure & Compliance Hub Setup Expert

DCH layers ESG disclosure reporting on top of a licensed Net Zero Cloud org: OmniStudio + DocGen as the engine, one managed package per framework (GRI, ESRS, CDP, SASB), and a Word report template linked to each framework's OmniProcess. This skill drives the `setup_dch*` tools (`src/dch/`). Content is derived from an internal DCH setup project — see `metadata/dch/NOTICE.md`.

## Prerequisites

- **Net Zero Cloud is licensed** — every tool runs the `describe_sobject StnryAssetEnvrSrc` gate first and stops on failure.
- **A non-production org.** Package installs are hard to reverse. `create_scratch_org` with `definitionFile: "dch"` builds a scratch org with the features DCH needs (`config/dch-scratch-def.json`: OmniStudioDesigner/Runtime, DocGenInd, ClauseManagement, DisclosureFramework, Assessments, …). Production-type orgs are refused unless `confirmProductionWrite: true`.
- **`vlocity` CLI (optional)** — only for the DocGen sample packs. `npm install -g vlocity`. Without it that one step is skipped with guidance; everything else still runs.

## Order (never reorder)

1. **Foundation** — `setup_dch_foundation`: PSLs/permission sets → OmniStudio package → OmniStudio remote site settings → Industries settings → `UserPermissionsSFContentUser` → DocGen permission set (Apex) → DocGen settings → DocGen fonts (Apex) → OmniInteractionConfig → second permission pass → DocGen sample packs (vlocity).
2. **Frameworks** — `setup_dch_framework` per framework: package → OmniStudio resources (+ SASB action flows) → OmniProcess page layout → templates uploaded and linked → Disclosure layout (GRI, ESRS).
3. `setup_dch` runs 1 then GRI → ESRS → CDP → SASB and stops at the first failing stage.

All of these are idempotent: installed packages, assigned permissions and linked templates are skipped on a re-run. Every tool needs `confirm: true`. Each returns a per-step report of `ok` / `skipped` / `failed` — surface it to the user as-is.

## Package versions

Defaults are the versions the source project pinned: `omnistudio` 250.7, `NZCDCHGRI` 244.1, `NZCDCHESRS` 244.0, `NZCDCHCDP` 244.0, `NZCDCHSASB` 244.1. These may be stale — pass `omnistudioVersion` / `packageVersion` / `version` to override. Installs go through an `InstalledPackage` metadata deploy by namespace + version (no 04t ID), and retry while a new version is still propagating.

## PSL / permission-set names

The permission list comes from the source project, and **names vary by org** (see `nzc-foundation-licensing`). The foundation step checks each name against the org and reports absent ones under `notPresent` instead of failing — notably the `TCRMforSustainability*` names are absent on scratch orgs. OmniStudio/DocGen permission sets only exist after the package installs, so the foundation runs a second permission pass afterward. `ManufacturingAdvancedAccountForecastPsl` is a PSL (the source project listed it as a permission set by mistake).

## Common failure modes

| Symptom | Likely cause |
|---|---|
| `template:… No active OmniProcess named "GRI2023"` | The framework's OmniStudio resources didn't deploy, or the OmniProcess isn't active. Re-run `setup_dch_framework`; check Setup → OmniStudio. |
| Install step: "not yet available" after retries | The package version isn't published to this org's release yet. Pass a different `version`. |
| Apex step fails with `omnistudio.DocgenPostInstallClass` not found | OmniStudio install didn't complete — re-run `setup_dch_foundation`. |
| `deploy-docgen-packs` skipped | `vlocity` CLI not installed — `npm install -g vlocity`, then re-run the foundation. |
| Resources deploy fails on OmniStudio types | OmniStudio runtime feature missing from the org — use the `dch` scratch definition. |

## Tools

`setup_dch` · `setup_dch_foundation` · `setup_dch_framework` · `install_dch_package` · `load_dch_templates` · `dch_status` (read-only) · `create_scratch_org`.

## See also

`metadata/dch/NOTICE.md` · `nzc-scratch-org` · `nzc-foundation-licensing` · `JOURNEY_MAP.md` row 15.
