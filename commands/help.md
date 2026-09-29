---
description: Search the Net Zero Cloud knowledge base for help
---

# Net Zero Cloud Help

Search the curated Net Zero Cloud knowledge base for guidance.

$ARGUMENTS

## Steps

1. If a topic/question was provided in arguments → call `search_nzc_knowledge` with it.
2. If no topic → ask what the user needs help with, or call `list_nzc_modules` to show the module index.
3. Render matched knowledge entries with their source (module README, data-model.md, setup-order.md, troubleshooting/common-issues.md) and a short excerpt.
4. If the question is about a specific concept (e.g., "what is an Annual Emissions Inventory"), prefer `explain_nzc_concept`.
5. If the question is symptom-shaped ("footprints aren't showing up"), prefer `get_nzc_troubleshooting` and/or the `nzc-troubleshoot` skill.
6. Always point to the relevant skill(s) for deeper, task-oriented guidance alongside the knowledge-base answer.
