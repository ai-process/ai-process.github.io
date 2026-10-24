---
title: "Skills & Claude Code plugin"
nav_order: 9
nav_group: tools
permalink: /docs/skills/
---

{% raw %}
# Skills and the Claude Code Plugin

The `ktms` plugin turns the [prompts](/docs/prompts/) into skills: Claude Code picks one by
itself when a task fits, follows its steps with the [command-line tools](/docs/cli/) and the
[MCP servers](/docs/mcp/), and checks the result. The plugin lives in the `plugin/` folder of the
`ktms` repository, which is also its marketplace.

## Installation

```bash
claude plugin marketplace add ai-process/ktms && claude plugin install ktms@ai-process
```

This adds the skills and both MCP servers (`ktms mcp`, `tokenmeter mcp`, read-only). The `ktms` and
`tokenmeter` binaries must be on `PATH` (see [Installation](/docs/cli/#installation)), and they find
Keystone. The Model Switchboard. (KTMS) and light-tokenmeter as the CLIs do: the current context,
or `KTMS_CONTEXT`, `KTMS_ADDR`, `KTMS_ADMIN_KEY`, `TOKENMETER_ADDR`, `TOKENMETER_TOKEN` in the
environment Claude Code runs in. To let the assistant change Keystone, add your own entry with
`"args": ["mcp", "--allow-write"]` to the project's `.mcp.json`.

## Skills

| Skill | For |
| --- | --- |
| `/ktms:integrate` | Moving a service's LLM calls onto Keystone: one client module, an effort per call site, attribution, the error policy, tests |
| `/ktms:configure` | Routing, keys, limits and teams as a ktms config file, planned and applied, then checked with `route explain` |
| `/ktms:deploy` | Compose or Helm for Keystone, light-tokenmeter and ktms-admin, and the first-start runbook |
| `/ktms:node` | A local GPU node with cloud fallback |
| `/ktms:migrate` | Moving from LiteLLM or vendor SDKs: inventory, mapping, configuration, cut-over |
| `/ktms:usage-reports` | Spend questions, reports and alerts from light-tokenmeter |
| `/ktms:production-review` | Checking a deployment, findings by severity with fixes |

The slash command starts a skill by name; usually the assistant picks it from the task.

## Other assistants

The skills are plain Agent Skills, a folder with a `SKILL.md` that carries a `name` and a
`description`. Copy `plugin/skills/*` into the skills directory of Codex, Cursor or another agent
that reads them, and add the two MCP servers to its configuration ([Connecting](/docs/mcp/#connecting)).
Assistants without skills can use the [prompts](/docs/prompts/), which cover the same tasks.

## Versions

The plugin's version is Keystone's release, and the release fails when they differ. CI checks every
skill: each command, flag, MCP tool and README section it names must exist in the CLIs, the MCP
servers and the READMEs, so a skill cannot send an assistant to something that is gone.
{% endraw %}
