---
title: "Assess your system"
nav_order: 11
nav_group: prompts
permalink: /docs/prompts/assess-system/
---

{% raw %}
# Prompt: Assess Your System

Shows how Keystone. The Model Switchboard. (KTMS) fits the system you already have, before you
change anything. The assistant reads your repositories and deployment files, finds every LLM call
and whatever gateway sits in front of the vendors today, and explains where Keystone, Postgres,
Redis, light-tokenmeter and ktms-admin would run, what each service changes, what Keystone brings
and costs here, and in which order to do it. Start here when you are not sure KTMS is worth it.

## What You Need

- The assistant opened in the repository, or in a folder that holds your services and your
  infrastructure repository side by side.
- Optionally, read-only access to a Keystone that already runs: an `admin:read` key in a `ktms`
  context, or the `ktms mcp` server (see [MCP servers](/docs/mcp/)).
- With Keystone 1.3.6 or later, the `/ktms:assess` skill does this in Claude Code; see
  [Skills](/docs/skills/).

## Prompt

```text
Assess how Keystone (KTMS) 1.x, a self-hosted LLM gateway, would fit this system. Read first, and
prefer them to memory:
- https://raw.githubusercontent.com/ai-process/ktms/v1.3.5/README.md
  (sections "How it works", "Concepts", "OpenAI-compatible HTTP API", "Endpoints",
  "Resource footprint", "Sizing", "Production checklist")
- https://raw.githubusercontent.com/ai-process/light-tokenmeter/v1.1.0/README.md (introduction)
- https://raw.githubusercontent.com/ai-process/ktms-admin/v1.1.1/README.md (introduction)

Facts to keep:
- Clients send an effort (model "auto", "auto:low|medium|high"), not a vendor model; rules pick
  the chain. Embeddings need an exact model id.
- HTTP /v1 is OpenAI-compatible (chat completions, embeddings, speech, images); gRPC on :9090 adds
  batches and judgments. Other OpenAI endpoints (Responses, Assistants, Files, Realtime,
  transcription) have no equivalent. On /v1, n must be 1 and temperature, top_p, stop and seed
  are ignored.
- Keystone needs Postgres; without Redis it enforces no limit. Usage events go to
  light-tokenmeter when spend per project, user or call site matters.

Task, without changing anything:
1. List every service: language, every LLM call site (file:line, vendor, model, streaming, tools,
   structured output, embeddings, speech, images), how it is deployed.
2. Find what sits between the services and the vendors today (LiteLLM Proxy, OpenRouter, Portkey,
   Helicone, a home-grown wrapper), with its aliases, fallbacks, keys, budgets and limits; the
   Postgres and Redis already there; how secrets, ingress, TLS and monitoring are done; GPUs or a
   local model server on this machine.
3. Propose one topology for this system as a text diagram: where Keystone runs, which Postgres and
   Redis it uses, whether light-tokenmeter and ktms-admin are worth adding, what is exposed, and
   sizing.
4. For each service, the smallest path to Keystone (base URL, key and model value on an
   OpenAI-compatible client, or gRPC), how much code it touches, an effort per group of call
   sites, and the attribution (user, metadata.action_id). List what does not map.
5. What Keystone brings and costs in this system. Say plainly if it is not worth it.
6. An ordered plan, then what you could not see and what the answer would change.
Never print secret values: name the variable or file that holds one.
```

## Check the Result

- Every LLM call in the repository appears in the list, with file and line.
- The topology names concrete places for Postgres, Redis and Keystone in your deployment, not
  generic advice.
- Each service has a path, effort proposals and what does not map.
- The plan starts with a step you can take today, and the assistant changed no file.
{% endraw %}
