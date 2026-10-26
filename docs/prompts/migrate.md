---
title: "Migrate from LiteLLM or SDKs"
nav_order: 16
nav_group: prompts
permalink: /docs/prompts/migrate/
---

{% raw %}
# Prompt: Migrate from LiteLLM or Vendor SDKs

Moves an existing setup to Keystone. The Model Switchboard. (KTMS): a LiteLLM Proxy configuration
with its virtual keys, budgets and fallbacks, or services that call vendor SDKs directly. The
result is a mapping you can review, the Keystone configuration that implements it, and a cut-over
plan that runs both side by side first. Use it in the repository that holds the LiteLLM config or
the services.

## What You Need

- The current configuration: LiteLLM's `config.yaml` (and the list of virtual keys, teams and
  budgets from its database or UI), or the services' code.
- A Keystone instance to configure (see [Deploy the stack](/docs/prompts/deploy-stack/)).
- With Keystone 1.2 or later, ask for a ktms config file instead of a script and apply it with `ktms
  config plan` and `ktms config apply`; the `/ktms:migrate` skill does the whole task. See
  [Command-line tools](/docs/cli/#configuration-as-a-file).

## Prompt

```text
Plan and prepare a migration to Keystone (KTMS) 1.0 from <LiteLLM Proxy | direct vendor SDK calls>.
Read first, and prefer them to memory:
- https://raw.githubusercontent.com/ai-process/ktms/v1.3.6/README.md
  (sections "How it works", "Setting it up: keys, models, rules", "OpenAI-compatible HTTP API",
  "Concepts", "Error contract")
- https://raw.githubusercontent.com/ai-process/ktms/v1.3.6/proto/ktms/v1/admin.proto

Facts that differ from LiteLLM:
- Clients do not pick deployments by alias. They send an effort ("auto", "auto:low|medium|high")
  and attributes; rules map (effort, attributes) to an ordered fallback chain of models. An exact
  registry model id still works and bypasses the rules.
- A LiteLLM model_list entry becomes a Keystone model (UpsertModel: id = the vendor's model name,
  vendor, efforts, prices per million tokens). Several deployments of one model become a rule
  chain or weighted entries (weights) in one rule.
- Fallbacks become the order of a rule's "use" chain; Keystone also skips models whose circuit
  breaker is open or that a vendor paused with Retry-After.
- Virtual keys become client keys (MintAPIKey, scope generate). Vendor credentials belong to each
  client key (SetVendorKey), so clients can use separate vendor accounts.
- Budgets become spend limits (SetSpendLimit per key or user, per UTC day or month, in nano-USD);
  rpm/tpm limits per key become a key policy (rpm_limit, tpm_limit, allowed_models); teams become
  organizations and teams whose budget is monthly only (monthly_budget_usd), so a daily team budget
  has no equivalent: flag it.
- Spend logging becomes usage events sent to light-tokenmeter (USAGE_COLLECTOR_HOST), with the
  rule, attributes and cost on each event.
- On the OpenAI-compatible API, temperature, top_p, stop, seed and penalties are accepted and
  ignored, and n must be 1. Flag every client that depends on them.

Task:
1. Inventory: list every model, deployment, alias, fallback, key, team, budget and limit (or,
   for SDK users, every call site with its model and parameters).
2. Write the mapping table: old item → Keystone item, and mark what has no equivalent and how to
   handle it.
3. Produce the Keystone configuration as a re-runnable script (Admin API via grpcurl or <language>),
   secrets only from environment variables.
4. List the client changes: base URL, key, model value per call site (effort instead of alias),
   user and metadata.action_id for attribution.
5. Write a cut-over plan: run Keystone next to the old setup, send a share of traffic or one
   service first, compare errors, latency and spend for a few days, then switch and keep the old
   setup ready to roll back for a week.
Ask me about anything you cannot map with confidence.
```

## Check the Result

- Every old model, key, budget and limit appears in the mapping, with nothing silently dropped.
- Every effort has a catch-all rule, and chains keep the old fallback order.
- Clients that rely on sampling parameters (`temperature`, `seed`, …) are listed.
- The plan has a side-by-side phase and a rollback path.
{% endraw %}
