---
description: Full health check of the Net Zero Cloud org — setup, data, and validation
---

# Net Zero Cloud Health Check

Run a comprehensive health check combining org status, setup completeness, and validation rules.

## Steps

1. Run `check_nzc_setup` — CLI/org connection.
2. Run `get_org_status` — license, settings flags, PSL/permset assignment counts, record types, reference-data coverage, pipeline object counts (mirrors `/nzc:status` but folded into one report).
3. Run `audit_nzc_config` for all groups (`foundation`, `reference-data`, `data-integrity`).
4. Run `health_check` for anything else the MCP server tracks directly (e.g., last successful deploy/load timestamps if available).
5. Combine into one report with clear sections: **Connection**, **Foundation**, **Reference Data**, **Domain Data**, **Data Integrity**. Use ✅/⚠️/❌ per section.
6. If anything is red, point to the single most useful next command (`/nzc:enable-net-zero`, `/nzc:load-reference-data`, `/nzc:assign-permissions`, or `nzc-troubleshoot` skill) rather than listing everything at once.
7. If everything is green, state that plainly — don't manufacture caveats.
