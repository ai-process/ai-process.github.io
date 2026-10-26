---
title: "Configure routing"
nav_order: 13
nav_group: prompts
permalink: /docs/prompts/configure-routing/
---

{% raw %}
# Prompt: Configure Routing in Keystone. The Model Switchboard. (KTMS)

Turns a plain description of your vendors, models, clients and budgets into a script that
configures Keystone through its Admin API: models with prices, vendor credentials, rules per
effort, client keys with policies, spend limits, and optionally organizations and teams. The
script can be re-run, so the configuration lives in your repository instead of in someone's
terminal history.

## What You Need

- An admin key (`ktms_…` with the `admin` scope, or `BOOTSTRAP_ADMIN_KEY` on a fresh install)
  in the environment variable `KTMS_ADMIN_KEY`.
- [`grpcurl`](https://github.com/fullstorydev/grpcurl), or a language the assistant should write
  the script in.
- Vendor API keys in environment variables or a secret manager, never in the chat.
- With Keystone 1.2 or later, skip the script: the `ktms` CLI keeps this configuration as a file
  (`ktms config plan`, `ktms config apply`), and the `/ktms:configure` skill does the whole task.
  See [Command-line tools](/docs/cli/#configuration-as-a-file).

## Prompt

```text
Write a re-runnable script that configures Keystone (KTMS) 1.0 through its Admin API.
Read first, and prefer them to memory:
- https://raw.githubusercontent.com/ai-process/ktms/v1.3.6/README.md
  (section "Setting it up: keys, models, rules" and its subsections, "Speech, image and judgment rules")
- https://raw.githubusercontent.com/ai-process/ktms/v1.3.6/proto/ktms/v1/admin.proto

Requirements (edit before sending):
- Gateway: <host:9090>, TLS <yes|no>; admin key in $KTMS_ADMIN_KEY.
- Vendors and models: <e.g. openai gpt-4o-mini ($0.15/$0.60 per Mtok, cached input $0.075),
  anthropic claude-sonnet-… , a local model gemma…>
- Tiers: low = <models, cheapest first>, medium = <…>, high = <…>; special cases <e.g. requests
  with attribute language=es at high effort go to …>.
- Clients: <name: what it does, its vendor credentials from $ENV_VAR, allowed models,
  requests/tokens per minute, daily/monthly USD cap>.
- Teams (optional): <organization, team, monthly budget, allowed models, members' keys>.

Facts:
- Admin calls are ktms.v1.AdminService methods with metadata "authorization: Bearer <admin key>".
- UpsertModel creates or replaces one model: id (sent to the vendor as the model name), vendor
  (openai, anthropic, google, deepseek, groq, mistral, azure, bedrock, ollama, local, typesafe),
  endpoint (required for azure and ollama, optional base-URL override otherwise),
  efforts, capabilities, rpm, price_in_per_mtok / price_out_per_mtok, optional batch, peak and
  price_cache_read_per_mtok / price_cache_write_per_mtok (0 = vendor default), enabled.
  Prices are USD per million tokens and drive spend limits, so take them from the vendor's
  current price list and say where each came from.
- SetVendorKey assigns a vendor credential to one client key (api_key_name, vendor, plain_key).
  A client can only use models of vendors it holds a credential for; local models need none.
- ReplaceRules replaces the whole rule set atomically. Each rule: unique name and priority (the
  highest matching priority wins), optional effort and attribute predicates, use = ordered
  fallback chain, optional weights, enabled. Validation needs a catch-all rule (no attributes)
  for every effort.
- MintAPIKey (name, scopes ["generate"] for services, org_id/team_id, policy) returns the key
  once. It is not idempotent: check ListAPIKeys first and mint only missing keys. Print a new key
  once, to stderr, and never write it to a file the script commits.
- SetAPIKeyPolicy sets allowed_models, rpm_limit and tpm_limit on an existing key.
- SetSpendLimit takes spend_limit {subject_type key|user, subject_id (key name, user id, or * for
  every subject of that type), period day|month, limit_nanousd (USD × 1e9)}. It refuses teams.
- CreateOrganization {name} returns the organization's id; CreateTeam {org_id, name,
  monthly_budget_usd, allowed_models} groups keys. A team's cap is its monthly_budget_usd, set
  with CreateTeam or UpdateTeam, monthly only. A team's allowed models and budget apply on top of
  each key's own. Names are unique (organizations, and teams within an organization), so look
  them up with ListOrganizations / ListTeams first and create only missing ones.

Task:
1. Write the script (<bash with grpcurl | Python | Go>). It reads secrets only from the
   environment, fails on the first error, and running it twice changes nothing the second time.
2. Before applying, print the plan: models, the rule table (effort × attributes → chain), keys
   to mint, limits.
3. After applying, call GetConfig, ListAPIKeys and ListSpendLimits and check that every model,
   rule, key policy and limit is there.
4. Add a short README next to the script: variables to set, how to run, how to change a price
   or a rule.
Ask me about anything in the requirements that is ambiguous instead of guessing.
```

## Check the Result

- Every effort has a catch-all rule, and each chain is ordered cheapest first.
- Prices match the vendors' current price lists; cache prices are set for OpenAI, Gemini and
  DeepSeek models whose discount you want counted.
- No secret is in the script or its output, except a freshly minted key printed once.
- A second run reports no changes, and `GetConfig` shows the expected models and rules.
{% endraw %}
