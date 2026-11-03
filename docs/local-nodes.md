---
title: "Local GPU node pool"
nav_order: 3
permalink: /docs/local-nodes/
---

{% raw %}
# Routing to Local Models & Dynamic Node Pool (Local Inference Nodes)

**Repository:** [`ai-process/ktms`](https://github.com/ai-process/ktms) (formerly `llm-proxy`)

`KTMS` supports two modes for routing to local and self-hosted models (`vLLM`, `Ollama`, `TGI`, `llama.cpp`, `FreeToken`, and any OpenAI-compatible inference server):

1. **Static Endpoint (`vendor: ollama`):** Simple fixed binding of a single model to an explicit `endpoint` via `UpsertModel` and `SetVendorKey(vendor: "ollama")`. Suitable for a single server without auto-discovery.
2. **Dynamic Local Node Pool (`vendor: local`):** GPU worker machines self-register with the gateway using dedicated `ktms_node_...` keys (legacy `llm_node_...` recognized), advertise hosted models and hardware capacity, send periodic heartbeats, and receive traffic via **Smooth Weighted Round-Robin (WRR)** weighted by capacity, available concurrency slots, and real response speed (TTFT / TPS). The dynamic node pool requires **Redis** (`REDIS_ADDR`).

---

## Contents

- [Static Mode (`vendor: ollama`)](#static-mode-vendor-ollama)
- [Dynamic Pool Architecture (`vendor: local`)](#dynamic-pool-architecture-vendor-local)
- [Security, Authentication, and Node Lifecycle](#security-authentication-and-node-lifecycle)
- [Registration & Heartbeat Protocol](#registration--heartbeat-protocol)
- [Routing & Load Balancing Algorithm (Smooth WRR + Latency)](#routing--load-balancing-algorithm-smooth-wrr--latency)
- [Production-Grade Resilience Mechanisms](#production-grade-resilience-mechanisms)
- [Usage Collector Integration (`light-tokenmeter`)](#usage-collector-integration-light-tokenmeter)
- [Node Agent (ktms-node)](#node-agent-ktms-node)
- [Load Schedule (Capacity Levels)](#load-schedule-capacity-levels)
- [Manual Level and Control API](#manual-level-and-control-api)
- [Schedule Set by KTMS](#schedule-set-by-ktms)
- [Desktop Tray (`ktms-node-tray`)](#desktop-tray-ktms-node-tray)
- [Usage Log (`ktms-node stats`)](#usage-log-ktms-node-stats)

---

## Static Mode (`vendor: ollama`)

If you have a single dedicated inference server and do not need dynamic machine registration, configure a model with `vendor: "ollama"` and an explicit `endpoint`:

```bash
grpcurl -plaintext -H "authorization: Bearer $ADMIN_KEY" -d '{
  "model": {
    "id": "qwen2.5:14b",
    "vendor": "ollama",
    "endpoint": "http://10.0.1.25:11434/v1",
    "efforts": ["EFFORT_LOW", "EFFORT_MEDIUM"],
    "capabilities": ["no_thinking"],
    "enabled": true
  }
}' localhost:9090 ktms.v1.AdminService/UpsertModel

grpcurl -plaintext -H "authorization: Bearer $ADMIN_KEY" -d '{
  "api_key_name": "my-app",
  "vendor": "ollama",
  "plain_key": "ollama"
}' localhost:9090 ktms.v1.AdminService/SetVendorKey
```

---

## Dynamic Pool Architecture (`vendor: local`)

```
┌────────────────────────────────────────────────────────────────────────┐
│                                 KTMS                                   │
│                                                                        │
│  gRPC/HTTP ──▶ Router ──▶ Node Selector ────────┬───────────────────┐  │
│                             │ (Smooth WRR +     │                   │  │
│                             │  Latency Penalty) │                   │  │
│                             ▼                   ▼                   ▼  │
│                   ┌───────────────────┐ ┌───────────────┐ ┌─────────┐  │
│                   │ Redis Node State  │ │ Heartbeat     │ │ Usage   │  │
│                   │ (meta, state,     │ │ Manager       │ │ Events  │  │
│                   │  ZSET leases, EMA)│ │ (TTL/Sweep)   │ │ Client  │  │
│                   └───────────────────┘ └───────────────┘ └────┬────┘  │
└─────────────────────────────────▲──────────────────────────────┼───────┘
                                  │ Register / Heartbeat         ▼
                                  │ (Bearer ktms_node_…)  light-tokenmeter
                        ┌─────────┴─────────┐
                        │                   │
              ┌─────────┴────────┐ ┌────────┴────────┐
              │ Node A (2x H100) │ │ Node B (A100)   │
              │ vLLM / Ollama    │ │ vLLM / Ollama   │
              └──────────────────┘ └─────────────────┘
```

1. **Self-Registration:** Each worker machine runs an inference engine (`vLLM`, `Ollama`, `TGI`, `llama.cpp`, `FreeToken`) alongside the lightweight `ktms-node` agent. Using its dedicated `ktms_node_...` credential, the agent calls `NodeRegistryService/RegisterNode` with its `endpoint`, `engine` type, hosted models, and hardware capacity.
2. **Redis-Backed Heartbeats:** The machine sends periodic `Heartbeat` calls reporting live load metrics (`draining` flag, active requests, queue depth, free VRAM, model list, and `is_warm` status). All operational state lives in **Redis** so every `KTMS` replica shares a consistent view of the fleet.
3. **Automatic Eviction & Return:** If a machine misses heartbeats beyond `NODE_HEARTBEAT_TTL_SECONDS` (default `15`), the gateway marks it `OFFLINE`, pulls it from active balancing, and waits for the next heartbeat for automatic recovery.
4. **Client Entitlement (`vendor_key`):** Pool models are registered in `KTMS` with `vendor: "local"` (and an empty `endpoint`). Client API keys (`ktms_...` or `llm_...`) are granted access to local models via the standard `SetVendorKey(api_key_name, vendor: "local", plain_key: "local")`.

---

## Security, Authentication, and Node Lifecycle

### Node Keys (`NodeKey`) & SSRF Prevention
* Dedicated machine tokens prefixed with `ktms_node_...` (legacy `llm_node_...` supported) are minted via `ktms.v1.AdminService/MintNodeKey` and bound to a specific `node_id`.
* The `node_key` table in Postgres stores only a SHA-256 hash. A partial unique index `UNIQUE (node_id) WHERE disabled_at IS NULL` guarantees safe rotation after revoking an old key (`RevokeNodeKey`).
* Node key definitions enforce strict security boundaries:
  * `allowed_cidrs`: List of allowed CIDR/IP/hosts from which the node may advertise its `endpoint`. By default, the gateway blocks loopback (`127.0.0.0/8`, `::1`), link-local (`169.254.0.0/16`, `fe80::/10`), and cloud metadata IP ranges to prevent SSRF (`NODE_ALLOW_LOCALHOST_ENDPOINTS=true` is available for local development).
  * `allowed_models`: Whitelist of `model_id` names the node may register (empty = unconstrained).
  * `max_base_weight` and `max_concurrency`: Hard ceilings clamping self-reported weights and concurrency limits.
* The `ktms_node_...` token has an isolated `node` scope and can call only `NodeRegistryService` methods (`RegisterNode`, `Heartbeat`, `UnregisterNode`).
* Invoking `RevokeNodeKey(id)` marks the credential disabled in Postgres and immediately purges node operational state from Redis upon commit.

### Node State Machine (Evaluated in Priority Order)

| Priority | State | Transition Condition | Included in Routing |
| --- | --- | --- | --- |
| 1 | `OFFLINE` | Heartbeat missed (`now - last_hb > NODE_HEARTBEAT_TTL_SECONDS`, default `15`). Evaluated **before** `DRAINING` so a node dropped during drain does not linger indefinitely. Purged after `NODE_RETENTION_TTL_DAYS` (default `1`). | No (waits for fresh heartbeat) |
| 2 | `DRAINING` | Node reported `draining = true` in heartbeat or admin invoked `DrainNode`. Existing in-flight requests finish cleanly; no new requests assigned. | No |
| 3 | `PAUSED` | The heartbeat reports `capacity_percent = 0`: the node's load schedule is at 0%. Not an outage: do not alert on it. | No |
| 4 | `CIRCUIT_BROKEN` | Heartbeats active, but inference failed ≥ `5` consecutive times (set in `cmd/server/main.go`). Isolated for a `30s` cooldown, probing recovery via single `HALF_OPEN` trial (Redis CAS). | Only 1 trial request after cooldown |
| 5 | `SUSPECT` | Heartbeats on time, but the GPU reports a temperature ≥ `88` °C or utilisation ≥ `98`% (`internal/nodes/manager.go`). | Fallback only (if zero `HEALTHY` nodes available) |
| 6 | `HEALTHY` | Timely heartbeats, closed circuit breaker, available concurrency slots. | Yes |

---

## Registration & Heartbeat Protocol

Nodes communicate with the gateway over `ktms.v1.NodeRegistryService`:

### 1. Registration (`RegisterNode`)
The machine submits (with `node_id` validated against the calling `NodeKey`):
* `name`: Human-readable identifier (e.g. `gpu-worker-01`).
* `endpoint`: Base URL of OpenAI-compatible inference server (e.g. `http://10.0.1.25:8000/v1`).
* `engine`: Engine dialect (`ollama` | `vllm` | `tgi` | `llamacpp` | `freetoken` | `openai`), governing inference parameter adaptations (such as `no_thinking` transforms).
* `node_auth_token` (optional): Local Bearer secret for the inference engine (encrypted at rest in Redis via `crypto.Keyring` with key-version tracking and `RotateEncryption` support; never returned in `ListNodes`).
* `resources`:
  * `base_weight`: Base hardware weight (agent flag `--base-weight`, default `100`; clamped by key's `max_base_weight`).
  * `max_concurrency`: Max concurrent in-flight requests (KV cache slots) to avoid OOM.
  * `vram_total_mb`, `vram_free_mb`, `gpu_utilization_pct`.
* `models`: Hosted models (`model_id`, `remote_model_name`, `max_context_length`, `is_warm`, `capabilities`).

### 2. Heartbeat (`Heartbeat`)
Sent every `N` seconds (default `NODE_HEARTBEAT_INTERVAL_SECONDS = 5`):
* `draining` (`bool`): Graceful drain intent.
* `active_requests`, `queue_depth`, `vram_free_mb`, `gpu_utilization_pct`.
* `models`: Live model catalogue and `is_warm` load state.
* `capacity_percent` (`optional uint32`, 0–100): Current load-schedule level. Unset means 100, so agents that predate it keep full capacity; above 100 is rejected with `InvalidArgument`.
* `schedule_source` (`local` or `ktms`), `capacity_source` (`schedule`, `override`, `ktms_schedule`, `ktms_override`, `default`) and `capacity_until` (end of the override behind the level): see [Schedule Set by KTMS](#schedule-set-by-ktms). Empty from agents that predate them.

In `HeartbeatResponse`, the gateway returns:
* `re_register_required` (`bool`): `true` if node state was purged from Redis (prompts `RegisterNode`).
* `drain_requested` (`bool`): `true` if an operator triggered `DrainNode`.
* `active_proxy_requests` (`int32`): Requests still running on this node per Redis, not counting post-request cooldown holds (used by the agent to drain before `SIGTERM` exit and to unload the model during a pause).
* `capacity_applied` (`bool`): `true` from gateways that apply `capacity_percent`; an agent that sees `false` below 100% warns that the gateway is older.
* `schedule` (`NodeSchedule`: `text`, `version`, `override`): only for `schedule_source = "ktms"`; unset when the gateway could not read it.

### 3. Usage Log (`PullNodeUsage`)
The agent pulls the node's request log by cursor: `after_id` (empty = from the oldest kept record), `limit` (default 500, at most 5000). The response carries `records`, `next_id` (the next cursor), `more` (pull again now) and `gap_until`, set when the cursor is older than the log: records before that moment may be missing. Only the key's own node may pull; a key bound to no node pulls nothing. `FailedPrecondition` means the gateway keeps no log (`NODE_USAGE_RETENTION_HOURS=0`). See [Usage Log](#usage-log-ktms-node-stats).

---

## Routing & Load Balancing Algorithm (Smooth WRR + Latency)

When a `RuleSpec` selects model $M$ with `vendor: "local"`, the router evaluates nodes lazily (one per dispatch attempt):

### Step 1. Two-Tier Candidate Filtering (Pre-RPM Check!)
Node eligibility is verified **before** `AllowRPM` and `Reserve`, ensuring dead nodes do not burn client RPM allowances:
1. Filter nodes advertising model $M$ with free capacity ($\max(\text{inFlightRedis}, \text{activeReported}) < \text{MaxConcurrency}$) and sufficient context length ($\text{EstimatedInputTokens} + \text{MaxOutputTokens} \le \text{MaxContextLength}$).
2. **Health Tiering:** Prioritize `HEALTHY` nodes (plus `HALF_OPEN` trials); consider `SUSPECT` nodes only when zero `HEALTHY` nodes are found.
3. **Warm-Over-Cold Priority:** If any candidate node has loaded weights into VRAM (`is_warm = true`), load balancing evaluates **warm nodes only**. Cold nodes (`is_warm = false`) are only engaged when warm capacity is saturated or unavailable.

If zero candidates qualify (`ErrNoNodeAvailable`), the router cascades to the next model in the fallback chain (`RuleSpec.use`, e.g. cloud OpenAI/Gemini/DeepSeek).

### Step 2. Dynamic Weight Calculation
For each eligible candidate $i$, compute effective weight $W_{\text{eff}}(i, M)$:

$$W_{\text{eff}}(i, M) = W_{\text{base}}(i) \times F_{\text{load}}(i) \times F_{\text{perf}}(i, M) \quad (\text{1 if} \le 0)$$

Where:
* **$W_{\text{base}}(i)$**: Base resource weight (clamped by `max_base_weight`).
* **$F_{\text{load}}(i) = \max\left(0.1, \; 1 - \left(\frac{\text{inFlight}_i}{\text{MaxConcurrency}_i}\right)^2\right)$**: Load penalty from slot utilisation.
* **$F_{\text{perf}}(i, M)$**: Speed adjustment based on rolling EMA stored in Redis:
  $$F_{\text{perf}}(i, M) = \text{clamp}\left(0.7 \cdot \frac{\text{TPS}_{\text{ema}}(i, M)}{\text{TPS}_{\text{median}}(M)} + 0.3 \cdot \frac{\text{TTFT}_{\text{median}}(M)}{\text{TTFT}_{\text{ema}}(i, M)}, \; 0.1, \; 2.0\right)$$
  *$\text{TTFT}_{\text{ema}}$ tracks time-to-first-token normalized per 1k input tokens; $\text{TPS}_{\text{ema}}$ tracks output tokens per second.*

### Step 3. Lazy Smooth Weighted Round-Robin (Nginx Algorithm)
The selector picks one node via Smooth WRR (`current_weight[i] += W_eff[i]`, pick maximum, subtract ΣW_eff). Node adapters are invoked with `WithMaxRetries(0)` to prevent internal socket retries. Only if the selected node returns an error prior to the first chunk does the router lazily query the next node in the pool.

---

## Production-Grade Resilience Mechanisms

1. **Redis ZSET In-Flight Leases:**
   Active requests obtain an atomic lease in Redis ZSET `node:inflight:{nodeID}` (`member = reqUUID`, `score = deadline_ms`) via a Lua script (`ZREMRANGEBYSCORE` + verify `ZCARD < slots` + `ZADD`, where `slots` follows the [load schedule](#load-schedule-capacity-levels)). A cooldown hold after a request lives in the same set as `cd:{reqUUID}` and expires like a lease. Leases are refreshed during long streaming responses and expire cleanly if a gateway replica crashes. If Redis is down, node routing fails closed to prevent local GPU OOM.
2. **Circuit Breaker:**
   After `5` consecutive failures (set in `cmd/server/main.go`), the node transitions to `CIRCUIT_BROKEN` for a `30s` cooldown and then gets a single `HALF_OPEN` probe.
3. **Zero-Drop Graceful Drain:**
   On `SIGTERM`, the agent signals `DRAINING`, waits at least one replica sweep interval (`NODE_SWEEP_INTERVAL`), and monitors `active_proxy_requests == 0` before calling `UnregisterNode`.

---

## Usage Collector Integration (`light-tokenmeter`)

* `TTFT` and `TPS` are measured directly inside the `KTMS` router and updated in Redis via an atomic Lua script, so $F_{\text{perf}}$ speed-aware balancing works **even when `USAGE_COLLECTOR_HOST` is not configured**.
* Error responses, cancelled contexts, and heuristically estimated usage do not skew performance EMAs.
* When `USAGE_COLLECTOR_HOST` is active, every `UsageEvent` sent to `light-tokenmeter` includes `meta["node_id"]`, `meta["ttft_ms"]`, and `meta["tps"]`.

---

## Node Agent (`ktms-node`)

The `cmd/node-agent` (`ktms-node`) binary builds statically with `CGO_ENABLED=0`. The machine credential is supplied **exclusively** via the `NODE_KEY` environment variable or `--node-key-file` (never as a command-line flag, keeping secrets out of `ps aux` and shell history):

```bash
NODE_KEY="ktms_node_..." ktms-node \
  --proxy-addr="ktms.internal:9090" \
  --node-id="worker-rtx4090-01" \
  --engine="ollama" \
  --engine-url="http://127.0.0.1:11434" \
  --endpoint="http://10.10.0.15:11434/v1"
```

**Agent Features:**
* Supports `ollama` (`/api/tags`, `/api/ps`, effective `num_ctx` detection), `vllm` (`/v1/models`, `/metrics`), `tgi` (`/info`, `/metrics`), `llamacpp` (`/props`, `/slots`), `freetoken` (`/v1/models`, `/health`, `/v1/stats`; NVIDIA RTX 30–50 on Linux or Windows only), and `openai`.
* Queries GPUs via `nvidia-smi` CLI (no CGO/NVML) for `vram_total_mb`, `vram_free_mb`, and `gpu_utilization_pct`; `base_weight` comes from `--base-weight`.
* Handles `SIGTERM`/`SIGINT` via graceful drain and `active_proxy_requests == 0` convergence.

---

## Load Schedule (Capacity Levels)

A node on someone's own machine can follow a load schedule in the machine's local time. The schedule lives on the node (`--schedule-file`, the installer's `--schedule FILE` copies it to `~/.ktms-node/schedule`); the gateway only receives the current level in `capacity_percent`.

```
# [days] HH:MM-HH:MM level
23:00-07:00 100
07:00-10:00 50
mon-fri 10:00-23:00 0
# sat,sun 00:00-24:00 100
```

* Days: `mon`..`sun`, ranges (`mon-fri`, `fri-mon`) and lists (`sat,sun`); without days a rule applies daily. A window past midnight belongs to the day it starts on; `24:00` ends a day.
* Time no rule covers runs at 100%, and so does a node without the file. Overlapping rules are an error: the agent refuses to start, `ktms-node schedule --file F` and `doctor` name the line.
* The agent reads the file every 30 s and on a change; a broken edit keeps the schedule in force. The level follows the wall clock, so DST switches stay on time.

**What a level means.** The level is the share of time the node spends on gateway requests, not a share of slots:

* `slots = ceil(max_concurrent × level / 100)` requests may run at once;
* where that is more than the level (always with `max_concurrent = 1`), the slot stays held after each request for `cooldown = T × (slots / (max_concurrent × level / 100) − 1)`, capped at 15 minutes, where `T` is the request's duration. One slot at 50%: a 20 s request, then 20 s idle;
* `0%`: the node is `PAUSED` and gets no requests; models in the fallback chain take the traffic;
* `100%`: unchanged.

**Pause and resume.** On a level change the agent sends a heartbeat at once. At 0% its gateway answers `503` after a 5 s grace (for gateways that ignore levels and for requests already on their way), and once `active_proxy_requests` is 0 the agent unloads the served Ollama models (`keep_alive: 0`), freeing the machine's memory. The tunnel and heartbeats keep running. `--warmup` (default `5m`) before the next window with a level above 0 the agent loads the models again, so the first request does not wait. Engines other than Ollama only stop being routed to.

**Admin API.** `ListNodes` reports `capacity_percent`, `effective_slots` and the `PAUSED` state; `active_requests` counts running requests, not cooldown holds.

## Manual Level and Control API

The owner can override the schedule for a while on the machine itself, from the CLI or the [tray](#desktop-tray-ktms-node-tray):

```bash
ktms-node status                  # level, its source, requests, models, GPU, next switch
ktms-node pause 10m               # 0% for 10 minutes (default), then the schedule again
ktms-node pause --until-next      # until the schedule's next switch, at most 24 h
ktms-node pause 10m --now         # also cut running requests: their callers get an error
ktms-node level 30 --for 1h       # 30% for an hour
ktms-node resume                  # back to the schedule now
```

* A manual level (override) lasts from 1 minute to 24 hours and ends by the wall clock: a Mac that slept past the end resumes on waking. It is stored in `<state-dir>/override.json` (`--state-dir`, default `~/.ktms-node`) and survives an agent restart; an expired or broken file is ignored.
* A manual pause does not warm the models before it ends, so the memory stays free while the owner works; they load right after it, and the gateway falls back meanwhile. `--warm` keeps the schedule's behaviour. A pause that ends without a warm-up (a manual one, or a schedule window with no time for `--warmup`) loads the models at once.
* `--now` (API: `abort_inflight`) needs level 0 and the built-in gateway (`--expose cloudflared`): it closes the gate at once and cuts the engine requests running now; they are answered `503` (`request stopped by the node's owner`).
* `resume` inside a schedule pause returns 0%, and the CLI and tray say until when.

**Control socket.** The CLI and the tray talk to the running agent over a Unix socket, `--control-socket` (default `~/.ktms-node/control.sock`, empty turns it off). There is no TCP listener. The socket is `0600`, and the peer's uid is checked (`LOCAL_PEERCRED` on macOS, `SO_PEERCRED` on Linux): another user gets `403`. No answer carries the node key, the gateway access key or the engine token. Commands run on the agent's main loop; while the agent is still registering they answer `503`.

| Method | Path | What it does |
| :--- | :--- | :--- |
| `GET` | `/v1/status` | Snapshot: level (`effective`, `schedule`, `source`, `override`, `ktms`, `next`), `state` (`active`, `throttled`, `pausing`, `paused`, `draining`, `offline`), requests, models, GPU, connection, `schedule_source`, `schedule_error` |
| `GET` | `/v1/events` | Server-sent events: the same snapshot on every change and at least every 10 s |
| `POST` | `/v1/override` | `{"level":0,"for":"10m"}`, `{"level":30,"until":"…"}` or `{"level":0,"until_next_window":true}`, plus `warm`, `abort_inflight`; answers the status and the number of cut requests |
| `DELETE` | `/v1/override` | Back to the schedule |
| `GET` | `/v1/schedule` | The schedule text, its windows per day, the level now and the next five switches; read-only when KTMS sets it |
| `PUT` | `/v1/schedule` | Validates with the agent's parser (`422` with the line on an error, the file untouched), writes the file atomically and applies it at once; `409` when KTMS sets the schedule or there is no `--schedule-file` |
| `POST` | `/v1/schedule/preview` | Text → windows and next switches, nothing written |
| `GET` | `/v1/stats?from=&to=&by=hour\|day\|model` | The same report as `ktms-node stats --format json` |
| `GET`, `PUT` | `/v1/settings` | `{"schedule_source":"local"\|"ktms"}`, see [Schedule Set by KTMS](#schedule-set-by-ktms) |

`doctor` reports a manual level and whether the socket answers.

---

## Schedule Set by KTMS

A node can hand its schedule to KTMS: the tray's **Schedule set by KTMS**, `ktms-node settings --schedule-source=ktms`, or the agent flag `--schedule-source=ktms`. The saved choice (`<state-dir>/settings.json`) wins over the flag and switches without a restart. In this mode KTMS sets the node's schedule and load, and the local `--schedule-file` is ignored; it stays on disk for when the setting is turned off.

**In KTMS.** One schedule per `node_id` in Postgres (`node_schedule`): the rules as text, validated with the agent's own parser, and an optional override of 1 minute to 24 hours. Every change bumps a version.

| Where | How |
| :--- | :--- |
| Admin API | `GetNodeSchedule`, `ListNodeSchedules` (`admin:read`), `SetNodeSchedule`, `SetNodeCapacityOverride` (`level`, `until` or `clear`), `DeleteNodeSchedule` (`admin`) |
| CLI | `ktms nodes schedule show\|list\|set NODE --file F\|delete`, `ktms nodes schedule override NODE --level 0 --for 2h` / `--clear` |
| File | `node_schedules: [{node_id, schedule}]` in `ktms config` (plan, apply, prune, export); overrides are not configuration |
| Console | Nodes page, **Schedule** dialog ([ktms-admin](/docs/ktms-admin/)) |

**Delivery.** The schedule rides on the heartbeat (see [Heartbeat](#2-heartbeat-heartbeat)): a `ktms` node gets `HeartbeatResponse.schedule` (`text`, `version`, `override`); no row means version 0, the node runs at 100%. KTMS re-reads a node's schedule at most every 10 s, so a change reaches the node within about 15 s. The agent applies a new version at once and sends another heartbeat with the new level. A schedule it cannot parse is refused, the last one holds and `status` shows the error. When KTMS cannot read the schedule (database down, 1 s timeout) it sends none, and the node keeps the last.

**Without KTMS.** The agent keeps the last schedule it got in `<state-dir>/managed-schedule`, so a restart without the gateway does not fall back to the local file. Before the first one the node runs at 100%.

**Order.** The owner's own pause or level on the machine → the override from KTMS → the schedule from KTMS → 100%. The machine stays its owner's.

`ListNodes` shows `schedule_source` (`local`, `ktms`), `capacity_source` (`schedule`, `override`, `ktms_schedule`, `ktms_override`, `default`) and `capacity_until`; `ktms nodes list` has a `LEVEL` column.

---

## Desktop Tray (`ktms-node-tray`)

`install-node.sh --tray` adds a tray app next to the agent: on macOS `~/Applications/Keystone Node.app` in the menu bar (no Dock icon, LaunchAgent `com.ktms.node-tray`, started at login), on Linux `~/.ktms-node/bin/ktms-node-tray` in the tray (StatusNotifierItem, XDG autostart; GNOME needs the AppIndicator extension). A re-run without `--tray` keeps it, `--uninstall` removes it. It is a client of the [control socket](#manual-level-and-control-api): it has no level logic of its own, and quitting it leaves the node running.

| Icon and text | State |
| :--- | :--- |
| Green disc `100%`, half-filled ring `80%` | Running at that level |
| Two bars, `9:41` | Manual pause, time left |
| Two bars, `until 07:00` | Pause by the schedule |
| Amber ring with a dot, `2` | Pausing, two requests still running |
| ⚠ | The agent or KTMS does not answer |

**Menu:** the level and where it comes from, requests, loaded models, GPU; pause for 5, 10 or 30 minutes or until the next switch; limit to 50, 30 or 10% for an hour, or another level; **Stop now (cuts N requests)** while requests run; **Resume schedule** during a manual level; **Schedule set by KTMS**; Schedule…, Statistics…, Settings…; Open log; Quit tray.

**Window.** A page served on `127.0.0.1` at a random port, opened from the menu through an owner-only file holding a link that works once, within two minutes (so the link never shows in a process list; it becomes an HttpOnly cookie; the Host is checked, writes need a header a cross-site form cannot send). Sections:

* *Status:* the same controls, live over server-sent events.
* *Schedule:* a week grid of half hours painted with 0/25/50/75/100% or another level, or the text with a live preview (the error line, the next switches). Saving from the grid writes canonical rules (`mon-fri 09:00-18:00 0`); if the file has comments or switches off the half hour, the window says so and opens the text. Read-only when KTMS sets the schedule.
* *Statistics:* the usage log for 24 hours, 7 or 30 days: requests, errors, tokens, busy and paused shares, TTFT, tokens per second.
* *Settings:* Schedule set by KTMS; notifications (a pause ended, the agent stopped answering for 30 s, the schedule is invalid).

**Release.** `ktms-node-tray_<v>_darwin_universal.zip` (built on macOS, ad hoc signed until there is a Developer ID; the installer checks GitHub's asset digest) and `ktms-node-tray_<v>_linux_<arch>.tar.gz` (in `checksums.txt`). Windows is not supported.

---

## Usage Log (`ktms-node stats`)

The owner of a node can see how their machine was used: requests, tokens, busy time, the effect of the [load schedule](#load-schedule-capacity-levels). The gateway is the source: only it knows every request, its tokens and its outcome, including with `--expose none`, where the agent is not on the request path. The log is kept on the node and read with the same binary.

**On the gateway.** After each call to a node, `PoolAdapter` appends a record to the Redis stream `node:usage:{node_id}` (`XADD … MINID ~`, trimmed by age; a TTL refreshed on each write removes the log of a node that stopped getting requests). Every replica writes to the same stream. The record holds the start time, duration, TTFT (streams), model, kind (`chat`, `stream`, `judge`, `rollouts`), input, output and cache-read tokens, outcome (`ok`; `error` or `timeout` when the node failed; `rejected` when the engine refused the request itself with a 4xx other than 408/429; `cancelled` when the caller left) with `http_<status>` when known, the node's level when the request ended, and the cooldown given. **No user, key, team or text:** the owner sees how much the machine worked, never for whom. The write never delays or fails the request. The log is kept `NODE_USAGE_RETENTION_HOURS` (default `168`, `0` = off) and needs Redis 6.2 or newer. Revoking a node key deletes the node's log, so a new key for the same `node_id` cannot read the previous holder's history.

**On the node.** Every minute the agent pulls new records with `PullNodeUsage` into `requests-YYYY-MM-DD.jsonl` (the local day each request started) and moves its cursor only after the records are synced, so a crash repeats records and never loses them. Each minute it also writes its own sample from the last heartbeat to `samples-YYYY-MM-DD.jsonl`: state (`serving`, `paused`, `draining`, `offline`), level, gateway and engine load, GPU, warm models. Gaps the gateway reported go to `gaps.jsonl`. Closed days are gzipped and kept `--stats-retention` (default `90d`, `0` = forever). The directory is `--stats-dir` (the installer passes `~/.ktms-node/stats`); `--stats=false` turns it off. Against a gateway without the log the agent keeps only its samples. `doctor` checks that the log moves.

**Reading it.** `ktms-node stats` reads local files only, offline and without the node key:

```bash
ktms-node stats                                  # last 24 hours by hour
ktms-node stats --since 7d                       # by day
ktms-node stats --since 2026-10-01 --by model --format csv
ktms-node stats --tail                           # requests as they arrive
```

| Column | Meaning |
| --- | --- |
| Requests, Errors | requests that started in the period, and those the node failed (`error`, `timeout`) |
| Tokens in, Tokens out | sums |
| Busy | share of the period with at least one request running; parallel requests count once |
| Cooldown | slot time held after requests at a partial level |
| Paused | share of the agent's samples at 0% |
| No data | stretches without samples: the agent was not running |
| TTFT p50/p95, TPS | time to first token and output tokens per second |

Stretches the gateway no longer had when the agent pulled are listed as missing. `--until`, `--format json|csv` and `--dir` are also available.
{% endraw %}
