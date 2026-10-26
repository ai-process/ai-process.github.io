---
title: "Production review"
nav_order: 17
nav_group: prompts
permalink: /docs/prompts/production-review/
---

{% raw %}
# Prompt: Production Review

Audits a running deployment of Keystone. The Model Switchboard. (KTMS), light-tokenmeter and
ktms-admin against the production checklist: exposure, secrets, limits, backups, monitoring,
sizing. The assistant reads your deployment files and, if you let it, the live configuration,
and returns findings ordered by risk with the fix for each. Run it before go-live and after big
changes.

## What You Need

- The deployment files (Compose, Helm values, manifests, Terraform) in the repository.
- Optionally read-only access to the live system: an admin key for `GetConfig` and `ListAPIKeys`,
  the Prometheus that scrapes `:9091`.
- With Keystone 1.2 or later, connect the read-only `ktms mcp` and `tokenmeter mcp` servers so the
  assistant reads the live state itself; the `/ktms:production-review` skill runs the review. See
  [MCP servers](/docs/mcp/).

## Prompt

```text
Review this deployment of Keystone (KTMS) 1.0, light-tokenmeter 1.0 and ktms-admin 1.0 for
production. Read first, and prefer them to memory:
- https://raw.githubusercontent.com/ai-process/ktms/v1.3.4/README.md
  (sections "Production checklist", "Operations", "Backups and the encryption keyring",
  "When a dependency fails", "Metrics and alerts", "Sizing")
- https://raw.githubusercontent.com/ai-process/light-tokenmeter/v1.1.0/README.md
  (sections "Security", "Operations")
- https://raw.githubusercontent.com/ai-process/ktms-admin/v1.1.0/README.md (section "Security model")

Check at least:
- Exposure: only the gateway API (gRPC :9090, HTTP :8080) and the console are reachable from
  outside, behind TLS; :9091 metrics, /readyz details, Postgres, Redis and light-tokenmeter are not.
- Secrets: KTMS_ENCRYPTION_KEYS, DATABASE_URL, admin and collector tokens come from a secret
  store; BOOTSTRAP_ADMIN_KEY is unset; the keyring is backed up apart from the database.
- Keys: services hold generate-scope keys, one per client; admin keys only for the console and
  operators; key policies (allowed_models, rpm_limit, tpm_limit) where a client must be contained.
- Money: Redis is configured (without it no limit is enforced); spend limits exist per client key;
  SPEND_LIMITS_FAIL_MODE is chosen on purpose; model prices, including cache prices, match the
  vendors' lists.
- Resilience: at least two Keystone replicas; Postgres connections (replicas × DB_MAX_CONNS) fit
  max_connections; requests and limits follow "Sizing"; light-tokenmeter's collector token has
  only the write scope; the console's token only read.
- Observability: the alerts from "Metrics and alerts" exist, at least dependency errors, dropped
  usage events, open circuit breakers, upstream error rate and time to first token.
- Versions: images pinned to a release, not latest; the three versions are compatible
  (README "Compatibility with ktms-admin and light-tokenmeter").
- Backups: Postgres dumps are taken and a restore has been tested; the restore procedure flushes
  the gateway's Redis keys.

Task:
1. Read every deployment file; if I gave you live access, compare it with GetConfig, ListAPIKeys
   and the Prometheus targets and rules.
2. Report findings as a table: severity (critical, high, medium, low), what is wrong, where
   (file:line or live object), the fix. Critical means money or data at risk now.
3. Give the fixes as patches to the files, and the Prometheus rules that are missing.
4. List what you could not verify and what I should check by hand.
Change nothing in the live system.
```

## Check the Result

- Every item of the README's production checklist appears in the report, as passed or as a finding.
- Each finding points to a file line or a live object, with a concrete fix.
- The assistant made no change to the running system.
{% endraw %}
