---
description: Open the connected Net Zero Cloud org in the browser
---

# Open Org

Open the connected Net Zero Cloud Salesforce org in the browser.

$ARGUMENTS

## Steps

1. If a path was provided in arguments → call `open_org` with that path.
2. If no path → open to the default home page.
3. Safe, always-correct paths:
   - `/lightning/setup/SetupOneHome/home` — Setup home
   - `/lightning/setup/IndustriesSettings/home` — Industries/Sustainability settings (path may vary by release — confirm in Setup search if this 404s)
4. **Don't guess a Net Zero Cloud Lightning app/nav-item API name** — unlike some other Salesforce Industries clouds, this plugin has not verified a specific NZC app URL. If the user wants the NZC app itself, open Setup home and point them at the App Launcher, or ask `describe_sobject` / `list_nzc_modules` for the confirmed path first.
