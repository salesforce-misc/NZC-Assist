---
description: Check Net Zero Cloud plugin setup status and connect to a Salesforce org
---

# Net Zero Cloud Setup Check

Check the current setup status for the Net Zero Cloud plugin and guide through connecting to a Salesforce org.

## Steps

1. Use `check_nzc_setup` to verify:
   - Salesforce CLI installation status
   - Authenticated orgs
   - Current target org

2. If SF CLI is not installed:
   - Offer to install with `install_sf_cli`
   - Or provide manual install: `npm install -g @salesforce/cli`

3. If no orgs authenticated:
   - Provide: `sf org login web --alias my-nzc-org`
   - For sandbox: `sf org login web --alias my-sandbox --instance-url https://test.salesforce.com`

4. If multiple orgs exist:
   - List with `list_sf_orgs`
   - Help pick with `set_target_org`

5. Once connected:
   - Confirm the target org
   - Call `describe_sobject StnryAssetEnvrSrc` to confirm Net Zero Cloud is actually licensed in this org — if it fails, say so plainly before showing capabilities
   - Show available `/nzc:*` commands and capabilities

Present results in a clear, actionable format.
