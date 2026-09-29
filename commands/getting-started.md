---
description: Interactive onboarding for the Net Zero Cloud plugin
---

# Net Zero Cloud — Getting Started

Walk a new user through the plugin's capabilities and connect to an org.

## Steps

1. Greet the user and confirm their persona (Sustainability Program Manager / ESG-Sustainability Analyst or Data Architect / Administrator / Implementation Consultant / SDET-QA Engineer — see `PERSONA_JOURNEYS.md`).
2. Run `/nzc:setup-plugin` to check setup.
3. If connected, run `/nzc:status` to show the org snapshot.
4. Based on persona:
   - **Sustainability Program Manager** → showcase `/nzc:status`, `/nzc:build-annual-inventory`, `/nzc:audit`, point at `nzc-annual-inventory` skill.
   - **ESG / Sustainability Analyst or Data Architect** → showcase `/nzc:load-reference-data`, `/nzc:describe`, `/nzc:calculate-footprints`, point at `nzc-data-model` skill.
   - **Administrator** → showcase `/nzc:assign-permissions`, `/nzc:enable-net-zero`, `/nzc:configure-record-types`, point at `nzc-foundation-licensing` skill.
   - **Implementation Consultant** → showcase `/nzc:health-check`, `/nzc:audit`, point at `nzc-consultant` agent and `JOURNEY_MAP.md`.
   - **SDET / QA Engineer** → showcase `/nzc:scaffold-sample-data`, `/nzc:audit`, `/nzc:health-check`, point at `nzc-sdet` agent and `nzc-sample-data` skill.
5. Offer the user a sample task tailored to their persona.
