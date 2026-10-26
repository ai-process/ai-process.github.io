---
title: "Overview"
nav_order: 10
nav_group: prompts
permalink: /docs/prompts/
---

{% raw %}
# Prompts for AI Assistants

Keystone. The Model Switchboard. (KTMS), light-tokenmeter and ktms-admin are set up through code,
gRPC calls, environment variables and deployment files: work a coding assistant (Claude Code,
Cursor, GitHub Copilot, …) does well once it knows the exact contracts. Each prompt here gives it
those contracts: the version-pinned sources to read first, the facts that matter, the task, and the
limits. Each page ends with a list to check the result against.

## How to Use Them

1. Open the assistant in the repository it should change: your service, your infrastructure
   repository, or a new folder.
2. Copy the prompt, replace the `<…>` placeholders, and send it.
3. Check the result against the page's list before you merge or apply anything.

- The prompts pin the current releases: Keystone `v1.3.4`, light-tokenmeter `v1.1.0` and ktms-admin
  `v1.1.0` in the URLs. For a later release, replace the tag.
- From Keystone 1.2 and light-tokenmeter 1.1, the [command-line tools](/docs/cli/), the
  [MCP servers](/docs/mcp/) and the [skills](/docs/skills/) do these tasks directly; each prompt says
  how. The prompts remain for assistants without MCP or skills.
- Never paste real API keys, vendor keys or passwords into the chat. The prompts ask for
  environment variables and secret references, and so should you.
- An assistant that cannot open URLs needs the files instead: download the sources listed below
  into the repository and point it at them.

## Prompts

| Prompt | What you get |
| --- | --- |
| [Integrate a service](/docs/prompts/integrate-service/) | Your service calls Keystone over the OpenAI-compatible HTTP API or gRPC, with effort, attribution and errors handled in one client module. |
| [Configure routing](/docs/prompts/configure-routing/) | Models, vendor credentials, rules, client keys, key policies and spend limits as a repeatable script. |
| [Deploy the stack](/docs/prompts/deploy-stack/) | Docker Compose or Kubernetes (Helm) configuration for KTMS, light-tokenmeter and ktms-admin, with secrets, TLS and monitoring. |
| [Add a local GPU node](/docs/prompts/local-node/) | A Mac or Linux machine serving a local model to Keystone, with cloud fallback. |
| [Migrate from LiteLLM or vendor SDKs](/docs/prompts/migrate/) | A move from LiteLLM Proxy or direct vendor SDK calls, with a mapping of models, keys and limits. |
| [Usage and spend reports](/docs/prompts/usage-reports/) | Reports and alerts on spend per project, user, model and job from light-tokenmeter. |
| [Production review](/docs/prompts/production-review/) | An audit of a running deployment against the production checklist, with alert rules. |

## Sources the Prompts Use

| Source | Pinned URL |
| --- | --- |
| Keystone (KTMS) README | `https://raw.githubusercontent.com/ai-process/ktms/v1.3.4/README.md` |
| Gateway API (`ktms.v1`) | `https://raw.githubusercontent.com/ai-process/ktms/v1.3.4/proto/ktms/v1/gateway.proto` |
| Admin API (`ktms.v1`) | `https://raw.githubusercontent.com/ai-process/ktms/v1.3.4/proto/ktms/v1/admin.proto` |
| Helm chart values | `https://raw.githubusercontent.com/ai-process/ktms/v1.3.4/deploy/helm/ktms/values.yaml` |
| Node installer | `https://raw.githubusercontent.com/ai-process/ktms/v1.3.4/scripts/install-node.sh` |
| light-tokenmeter README | `https://raw.githubusercontent.com/ai-process/light-tokenmeter/v1.1.0/README.md` |
| ktms-admin README | `https://raw.githubusercontent.com/ai-process/ktms-admin/v1.1.0/README.md` |
| Full-stack Compose file | `https://raw.githubusercontent.com/ai-process/ktms-admin/v1.1.0/examples/compose.yaml` |
{% endraw %}
