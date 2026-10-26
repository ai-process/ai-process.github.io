---
title: "Deploy the stack"
nav_order: 13
nav_group: prompts
permalink: /docs/prompts/deploy-stack/
---

{% raw %}
# Prompt: Deploy the Stack (Infrastructure Configs)

Writes the deployment files for Keystone. The Model Switchboard. (KTMS), light-tokenmeter and
ktms-admin: Docker Compose for one machine, or Kubernetes with Keystone's Helm chart. Secrets come
from your secret store, TLS ends at your proxy or ingress, and the metrics port stays inside. Use it
in your infrastructure repository or an empty folder.

## What You Need

- Where it runs: one Docker host, or a Kubernetes cluster with an ingress controller.
- Postgres (managed or in-cluster) and Redis. Without Redis, rate, token and spend limits are
  not enforced.
- How the console's users sign in: password, Google, another OpenID Connect provider, GitHub, or
  an access proxy (oauth2-proxy, Authelia, Cloudflare Access…).
- With light-tokenmeter 1.1 or later, `tokenmeter token new --name ktms --scope write` makes a token
  and its `TOKENMETER_TOKENS` entry without `openssl`; the `/ktms:deploy` skill does the whole task.
  See [Skills](/docs/skills/).

## Prompt

```text
Write deployment configuration for Keystone (KTMS) 1.0, light-tokenmeter 1.0 and ktms-admin 1.0.
Read first, and prefer them to memory:
- https://raw.githubusercontent.com/ai-process/ktms/v1.3.3/README.md
  (sections "Installation", "Configuration reference", "Production checklist", "Operations")
- https://raw.githubusercontent.com/ai-process/ktms/v1.3.3/deploy/helm/ktms/values.yaml
- https://raw.githubusercontent.com/ai-process/light-tokenmeter/v1.1.0/README.md
  (sections "Configuration", "Authentication", "Metrics")
- https://raw.githubusercontent.com/ai-process/ktms-admin/v1.1.0/README.md
  (sections "Configuration reference", "Who may sign in", the sign-in section you use, "Deployment")
- https://raw.githubusercontent.com/ai-process/ktms-admin/v1.1.0/examples/compose.yaml
  (a working Compose file for the whole stack)

Target (edit before sending):
- Platform: <Docker Compose on one host | Kubernetes with Helm, ingress <nginx|…>, cert-manager <yes|no>>
- Postgres: <managed at …, or in-cluster>; Redis: <managed | in-cluster>
- Secrets: <Kubernetes Secrets | External Secrets from … | SOPS | .env for Compose>
- Public hostnames: gateway HTTP <api.example.com>, gateway gRPC <grpc.example.com> (clients and
  node agents), console <admin.example.com>
- Console sign-in: <password | Google | OIDC issuer … | GitHub | access proxy …>, admins <e-mails>
- Monitoring: <Prometheus Operator | plain Prometheus | none>

Facts:
- Images (pin the version, never latest): coyl/ktms:1.0.0 (-slim without ffmpeg, -audio with
  ffmpeg for Gemini speech), coyl/light-tokenmeter:1.1.0, coyl/ktms-admin:1.0.0.
- Keystone: gRPC :9090, HTTP :8080 (/v1 API, /healthz, /readyz), metrics :9091. Needs
  DATABASE_URL, KTMS_ENCRYPTION_KEYS ("1:" + base64 of 32 random bytes; keep it in a secret
  store and back it up apart from the database), REDIS_ADDR (and REDIS_PASSWORD),
  USAGE_COLLECTOR_HOST=<light-tokenmeter>:9090 with USAGE_COLLECTOR_TOKEN, and on first start
  only BOOTSTRAP_ADMIN_KEY to mint real admin keys; remove it afterwards.
- Helm: helm install ktms oci://ghcr.io/ai-process/charts/ktms --version 1.3.3. Secrets via
  secrets.existingSecret holding DATABASE_URL, KTMS_ENCRYPTION_KEYS and optionally
  BOOTSTRAP_ADMIN_KEY, REDIS_PASSWORD, USAGE_COLLECTOR_TOKEN. Settings under config.* (redisAddr,
  usageCollectorHost, spendLimitsFailMode, …), ingress.* with a separate ingress.grpc for gRPC,
  metrics.serviceMonitor, autoscaling, podDisruptionBudget. The gRPC ingress is a separate Ingress
  with the gRPC backend protocol: give it its own host, not the HTTP one with path /. light-tokenmeter and ktms-admin have
  no chart: write plain Deployments, Services and Ingress for them.
- light-tokenmeter: HTTP :8080, gRPC :9090, metrics :9091, its own Postgres database in
  DATABASE_URL. Authentication: TOKENMETER_TOKENS="name:scope:sha256hex,…" holds only hashes;
  Keystone gets a write token (USAGE_COLLECTOR_TOKEN), the console a read token (TOKENMETER_TOKEN).
- ktms-admin: listens on :8080; PUBLIC_URL (its https address), SESSION_SECRET (32+ characters,
  the same on every replica), a sign-in method from its README, ALLOWED_EMAILS / VIEWER_EMAILS /
  TEAM_MEMBERSHIPS, KTMS_ADDR (gateway gRPC host:port), KTMS_TLS, KTMS_ADMIN_KEY (an admin-scope
  Keystone key), TOKENMETER_URL (http://<light-tokenmeter>:8080), TOKENMETER_TOKEN.
- Keystone and light-tokenmeter speak plaintext: terminate TLS at the ingress or proxy, keep
  Postgres on sslmode=require, keep :9091 and the database and Redis off the public network.
  /healthz and /readyz share :8080 with the API and /readyz reports database state: block both
  paths at the public ingress and probe them inside the cluster.

Task:
1. Write the files for the chosen platform, every secret as a reference to the secret store, with
   resource requests from README "Sizing", readiness probes on /readyz, and at least two Keystone
   replicas on Kubernetes.
2. Write a bootstrap runbook: generate the keyring and tokens (commands, not values), first start
   with BOOTSTRAP_ADMIN_KEY, mint the console's admin key, put it in the secret store, remove the
   bootstrap key, restart.
3. Add NetworkPolicies (Kubernetes) or a firewall note (Compose): who may reach which port.
4. Add the Prometheus alert rules suggested in README "Metrics and alerts" if monitoring is on.
5. List every secret to create and how to rotate it.
Do not invent environment variables: use only those in the sources. Ask when a requirement is unclear.
```

## Check the Result

- Images are pinned to `1.0.0`; no secret value is in any file.
- `BOOTSTRAP_ADMIN_KEY` appears only in the first-run step of the runbook.
- Only the gateway's API ports and the console are public; `:9091`, Postgres and Redis are not.
- `KTMS_ENCRYPTION_KEYS` is backed up apart from the database dumps.
- `/healthz` and `/readyz` are blocked on the public ingress; from inside, `/readyz` answers `ready`
  after the first start, and the console shows both backends as reachable.
- HTTP and gRPC of the gateway have separate hosts (or separate ingress rules that do not clash).
{% endraw %}
