---
name: nzc-testing-validation
description: Validation-rule authoring and execution, audit interpretation, and fixture teardown for Net Zero Cloud. Use when the user asks to audit, validate, or diagnose Net Zero Cloud org configuration or data integrity.
---

# Net Zero Cloud Testing & Validation Expert

Owns the validation-rule library (`knowledge/validation-rules/*.yaml`) and its execution — the mechanism behind `/nzc:audit`, `/nzc:health-check`, and go-live readiness sign-off.

## Rule file shape

Multi-document YAML, one rule per `---`-separated doc (loader skips files whose basename starts with `_`, like `_schema.yaml`). Required fields: `id`, `group`, `description`, `severity` (`error`|`warning`|`info`), `check.type`. Optional: `remediation`, `docs`.

## Check types

| `check.type` | Fields | Used for |
|---|---|---|
| `sobject-exists` | `sobject` | The license-gate probe (`describe_sobject`) |
| `psl-license-assignment` | `psl`, `target` | PSL coverage across users |
| `psl-assignment` | `permissionSet`, `target` | Permission-set coverage |
| `metadata` | `object`, `hasRecordTypes` | Record-type presence on a standard object |
| `industries-setting` | `flag` | `Industries.settings` `enableSC*` flags |
| `soql` | `query`, `expect.operator`, `expect.value` | Counts, linkage/integrity checks |

Full schema + a worked example: `knowledge/validation-rules/_schema.yaml`.

## The three rule groups (v1)

- **`foundation.yaml`** — license, PSLs, permission sets, settings flags, record types. Run this first; almost everything else assumes it passed.
- **`reference-data.yaml`** — factor/UOM/scope-allocation/inflation load-completeness (count thresholds).
- **`data-integrity.yaml`** — orphan/null-link checks after sources, energy/activity use, and footprints are loaded (e.g., every footprint has a non-null `AnnualEmssnInventoryId`).

## Interpreting results

- `error` severity → blocking; downstream steps will produce wrong or missing data if not fixed.
- `warning` severity → non-blocking but worth surfacing; often means "this will look fine until reporting time."
- `info` severity → advisory.

For each failure, surface: the rule `id`, its `remediation` hint, and the `docs` pointer (usually a `SKILL.md`).

## API-name drift caveat

Every field/object name referenced inside a `soql`-type rule is the plugin's **design-time model** — confirm via `describe_sobject` against the connected org before trusting a rule failure as "real" rather than "the org's actual field name differs." See `CLAUDE.md` § "Always describe_sobject."

## Tools to use

`audit_nzc_config` · `list_validation_groups` · `diagnose_nzc_issue` · `run_soql` · `describe_sobject` · `health_check`

## See also

`knowledge/validation-rules/*.yaml` · `knowledge/troubleshooting/common-issues.md` · `nzc-sdet` agent · `nzc-sample-data` skill.
