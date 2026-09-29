---
description: Create or verify an Annual Emissions Inventory container in Net Zero Cloud
---

# Build Annual Emissions Inventory

Create (or verify) the `AnnualEmssnInventory` container that every carbon footprint must link back to.

$ARGUMENTS

## Steps

1. Ask which fiscal year/period this inventory covers, or infer from arguments.
2. Use `run_soql` to check whether an `AnnualEmssnInventory` already exists for that year — don't create a duplicate. A record existing for the wrong year is easy to miss and will silently orphan-link footprints later, so confirm the year field value explicitly, not just record existence.
3. If none exists, use `describe_sobject AnnualEmssnInventory` to confirm current fields, then `create_record`.
4. This must happen **before** sources and footprints are created for that period — if the user is running this mid-setup, warn them if sources/footprints already exist without an inventory link.
5. Report the created/confirmed record ID and year.
6. Suggest next step: domain `configure-*` commands, then `/nzc:calculate-footprints`.
