---
title: "Usage and spend reports"
nav_order: 16
nav_group: prompts
permalink: /docs/prompts/usage-reports/
---

{% raw %}
# Prompt: Usage and Spend Reports

Builds spend reports and alerts on top of light-tokenmeter, where Keystone. The Model Switchboard.
(KTMS) records every call with its tokens, cost, model, rule and your attributes. Typical asks:
spend per team or customer per month, the most expensive features, models that a cheaper one could
replace, users near their cap, the cost of one batch job. Use it in the repository where the
report or job should live (a script, a cron job, a dashboard backend).

## What You Need

- light-tokenmeter's HTTP address (default port 8080) and, with authentication on, a token with
  the `read` scope in `TOKENMETER_TOKEN`.
- For current caps and what is left of them: a Keystone admin key in `KTMS_ADMIN_KEY`.
- With light-tokenmeter 1.1 or later, `tokenmeter usage …` and the `tokenmeter mcp` tools answer
  these questions directly, and the `/ktms:usage-reports` skill builds the report. See [MCP
  servers](/docs/mcp/#light-tokenmeter-tools).

## Prompt

```text
Build <a weekly spend report | a script | an alert job> on light-tokenmeter 1.0 usage data from
Keystone (KTMS) 1.0. Read first, and prefer them to memory:
- https://raw.githubusercontent.com/ai-process/light-tokenmeter/v1.1.0/README.md
  (sections "Sending events", "Finding the greedy and the worthy", "API reference", "Authentication")
- https://raw.githubusercontent.com/ai-process/ktms/v1.3.5/README.md
  (sections "Spend limits (optional)", "Concepts": usage reporting)

What I want (edit before sending): <spend per project and model for last month, top 10 action ids
by cost per request, users above 80% of their daily cap, cost of job <id>, …>, delivered as
<CSV | Markdown in Slack | Prometheus metric | JSON for a dashboard>.

Facts:
- GET /v1/usage/summary with from (inclusive) and to (exclusive) in RFC 3339; filters project_id,
  user_id, vendor, model, action_id, status (success|error|cancelled|timeout); groupings
  group_by_project_id|user_id|vendor|model|action_id|status=true. One row per day and group, with
  tokens_input, tokens_output, tokens_total, request_count, sum_duration_ms, cost_nanousd (USD × 1e9)
  and cache_read_tokens / cache_write_tokens. Fields not grouped by are left out. More than 10,000
  rows come back capped with truncated: true: narrow the window or the grouping then.
- Authentication: Authorization: Bearer <read token>.
- From Keystone, project_id is the client key's name unless the call set the usage_project
  attribute; user_id is the caller's user; action_id is the call's action label; the rule name and
  the call's attributes are in each event's metadata.
- Per-job totals: gRPC usage.v1.UsageService/GetUsageByMeta {meta_key, meta_value, group_by_meta_key}
  (reflection is on, so grpcurl needs no proto files).
- Caps and what is left: Keystone's admin RPC GetSpend {subject_type key|user|team, subject_id}
  returns per period spent_nanousd, limit_nanousd, remaining_nanousd and resets_at.
- Services that call LLMs without Keystone can send their own events: POST /v1/usage/events (one)
  or /v1/usage/events:batch (up to 500), with a unique event_id each; a write token is needed.

Task:
1. Write the <script | job> with the endpoint, token and time zone from the environment; days are
   UTC in light-tokenmeter, so convert only for display.
2. Compute the derived numbers (USD, cost per request, average latency, error share) and say
   which query each comes from.
3. Handle truncated: true by splitting the window, and an empty result as "no traffic", not an error.
4. Add a test with recorded sample responses.
5. Explain how to schedule it and where its output goes.
```

## Check the Result

- Amounts are converted from nano-USD (`/ 1e9`) exactly once.
- Windows are half-open (`from` inclusive, `to` exclusive) and in UTC.
- A truncated response is never reported as a total.
- The token used has the `read` scope only.
{% endraw %}
