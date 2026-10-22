---
title: "KTMS gateway"
nav_order: 2
permalink: /docs/ktms/
---

{% raw %}
# KTMS (Keystone: The Model Switchboard)

Repository: [`ai-process/ktms`](https://github.com/ai-process/ktms) (formerly `llm-proxy`)  
Docker Hub: [`coyl/ktms`](https://hub.docker.com/r/coyl/ktms)

A high-performance self-hosted LLM gateway. Your services talk to one gRPC endpoint `ktms.v1.GatewayService` (or the OpenAI-compatible HTTP API); the gateway safely holds vendor API keys, decides which model answers each request based on declarative routing rules, immediately falls back when a vendor is down, enforces rate and spend limits, and records usage telemetry.

- **One place for vendor keys.** OpenAI, Anthropic, Google Gemini, DeepSeek, Groq, Mistral, Azure OpenAI, AWS Bedrock, Ollama, and TypeSafe credentials live encrypted in Postgres (AES-256-GCM). Client services never see them.
- **Routing by rules, not code.** Clients send an *effort* (`LOW` / `MEDIUM` / `HIGH`) and free-form *attributes*; an ordered rule list maps them to a model chain with fallbacks. Rules are changed at runtime over an admin RPC or the web console, with no redeploy.
- **Throttling.** Per-model requests-per-minute and daily token budgets, per API key and per end user, backed by Redis.
- **More than text.** Multimodal inputs (vision, audio, and PDF documents in chat messages), text generation with structured (JSON-schema) output, server-streaming text generation (`GenerateTextStream`), tool calling (`tools`), asynchronous batch generation at a 50% discount, speech synthesis, image generation, and typed judgments (`Judge`).
- **OpenAI-compatible HTTP API.** Point any OpenAI SDK or tool at `http://host:8080/v1` and get routing, fallbacks, and limits for free. Supports `X-KTMS-*` headers with seamless backwards compatibility for `X-LLM-Proxy-*`.
- **Usage reporting.** Optionally forwards one event per call to a gRPC usage sink such as [light-tokenmeter](/docs/light-tokenmeter/).
- **Web console.** [ktms-admin](/docs/ktms-admin/) (formerly `llm-proxy-admin`) manages models, rules, and keys in the browser.

## Contents

- [How it works](#how-it-works)
- [Quick start (Docker Compose)](#quick-start-docker-compose)
- [Installation](#installation)
  - [Docker image](#docker-image)
  - [Building from source](#building-from-source)
  - [Production checklist](#production-checklist)
- [Configuration reference](#configuration-reference)
- [Setting it up: keys, models, rules](#setting-it-up-keys-models-rules)
  - [1. API keys](#1-api-keys)
  - [2. Vendor keys (per client)](#2-vendor-keys-per-client)
  - [3. Models](#3-models)
  - [4. Rules](#4-rules)
  - [Speech, image, and judgment rules](#speech-image-and-judgment-rules)
  - [Rotating the encryption key](#rotating-the-encryption-key)
- [Calling the proxy (gRPC)](#calling-the-proxy-grpc)
  - [GenerateText](#generatetext)
  - [GenerateTextStream](#generatetextstream)
  - [Batch text generation (`SubmitBatch`, `GetBatch`, `ListBatchResults`, `CancelBatch`)](#batch-text-generation-submitbatch-getbatch-listbatchresults-cancelbatch)
  - [SynthesizeSpeech, GenerateImage, Judge, ListModels](#synthesizespeech-generateimage-judge-listmodels)
- [OpenAI-compatible HTTP API](#openai-compatible-http-api)
  - [Choosing a model in HTTP API](#choosing-a-model-in-http-api)
- [Concepts](#concepts)
- [Error contract](#error-contract)
  - [RPC status codes](#rpc-status-codes)
  - [Batch item error reasons](#batch-item-error-reasons)
- [Operations & Development](#operations--development)

## How it works

![KTMS Architecture](/assets/diagrams/ktms-light.png)

*Interactive diagram: [`diagrams/ktms.html`](/assets/diagrams/ktms.html) | Dark theme: [`diagrams/ktms-dark.png`](/assets/diagrams/ktms-dark.png)*

```
 your services ──gRPC (Bearer ktms_…)──▶ KTMS ──▶ OpenAI / Anthropic / Gemini / DeepSeek / Ollama / TypeSafe
                                          │  │
                                 Postgres ┘  └ Redis (limits)      └─▶ usage sink (optional)
                                 config, keys, encrypted vendor keys
```

Two gRPC services share port `9090`:

| Service | Purpose | Needed scope |
| --- | --- | --- |
| `ktms.v1.GatewayService` | `GenerateText`, `GenerateTextStream`, `SubmitBatch`, `GetBatch`, `ListBatchResults`, `CancelBatch`, `SynthesizeSpeech`, `GenerateImage`, `Judge`, `ListModels` | `generate` |
| `ktms.v1.AdminService` | models, rules, vendor keys, API keys, key rotation | `admin` |

Port `8080` serves the health probes (`/healthz`, `/readyz`) and the [OpenAI-compatible HTTP API](#openai-compatible-http-api) under `/v1`. gRPC server reflection is on, so `grpcurl` works without the `.proto` files.

## Quick start (Docker Compose)

Requirements: Docker with the Compose plugin, and [`grpcurl`](https://github.com/fullstorydev/grpcurl).

```bash
git clone https://github.com/ai-process/ktms.git
cd ktms
docker compose up --build -d
curl -s localhost:8080/readyz     # {"status":"ready"}
```

This brings up KTMS, Postgres 16, and Redis 7. The `compose.yaml` has a hardcoded, **dev-only** encryption keyring and a `dev-bootstrap` admin key (never use them in production). The database schema is migrated automatically on boot.

Mint a client key, attach your vendor credential, register a model, and add a default catch-all rule:

```bash
export ADMIN="authorization: Bearer dev-bootstrap"
G="grpcurl -plaintext -H"

# 1. Mint a client API key (plaintext returned once).
$G "$ADMIN" -d '{"name":"my-app","scopes":["generate"]}' \
  localhost:9090 ktms.v1.AdminService/MintAPIKey

# 2. Attach your OpenAI key to that client key.
$G "$ADMIN" -d '{"api_key_name":"my-app","vendor":"openai","plain_key":"sk-..."}' \
  localhost:9090 ktms.v1.AdminService/SetVendorKey

# 3. Register a model and 4. rules (catch-all required for each effort).
$G "$ADMIN" -d '{"model":{"id":"gpt-4o-mini","vendor":"openai",
  "efforts":["EFFORT_LOW","EFFORT_MEDIUM","EFFORT_HIGH"],
  "price_in_per_mtok":0.15,"price_out_per_mtok":0.60,"enabled":true}}' \
  localhost:9090 ktms.v1.AdminService/UpsertModel

$G "$ADMIN" -d '{"rules":[
  {"name":"default","priority":1,"use":["gpt-4o-mini"],"enabled":true}]}' \
  localhost:9090 ktms.v1.AdminService/ReplaceRules

# 5. Test request using key from step 1 (ktms_... prefix, legacy llm_... supported).
$G "authorization: Bearer ktms_<your_key>" -d '{
  "effort":"EFFORT_LOW",
  "messages":[{"role":"MESSAGE_ROLE_USER","text":"Say hi in three words."}]}' \
  localhost:9090 ktms.v1.GatewayService/GenerateText
```

Response includes `resolved_model` and `matched_rule`. Unset `BOOTSTRAP_ADMIN_KEY` once real keys exist.

## Installation

### Docker image

Multi-arch images are published to Docker Hub for `linux/amd64` and `linux/arm64` in two variants:

- **`coyl/ktms:latest`** (also tagged **`:slim`** or pinned `:<version>` / `:<version>-slim`): base lightweight image (~67 MB uncompressed, ~21 MB download for linux/amd64). Pure Alpine container without `ffmpeg`, optimized for text generation, chat, reasoning, embeddings, and OpenAI TTS.
- **`coyl/ktms:audio`** (or pinned `:<version>-audio`): extended image (~195 MB uncompressed, ~69 MB download for linux/amd64) bundling `ffmpeg` for Gemini speech synthesis (raw PCM to OGG/Opus transcode).

```bash
docker pull coyl/ktms:latest      # base lightweight image (~67 MB)
docker pull coyl/ktms:audio       # with ffmpeg for Gemini speech synthesis
```

If a Gemini speech request arrives without ffmpeg available (such as on the standard `slim` image), the gateway returns gRPC `Codes.Unimplemented` / HTTP 501 Not Implemented: `ffmpeg_missing: ffmpeg is required for Gemini speech synthesis: install ffmpeg or use the 'coyl/ktms:audio' container image`. OpenAI speech synthesis outputs native Opus directly and works in both image variants without ffmpeg.

The image runs as a non-root user (`appuser`, UID 10001), exposes ports `8080` (HTTP) and `9090` (gRPC), and is configured entirely through environment variables.

```bash
# generate your encryption keyring once and back it up
export KTMS_ENCRYPTION_KEYS="1:$(head -c 32 /dev/urandom | base64)"
export BOOTSTRAP_ADMIN_KEY="$(head -c 24 /dev/urandom | base64 | tr -d '/+=')"

docker run -d --name ktms \
  -p 9090:9090 -p 8080:8080 \
  -e DATABASE_URL='postgres://user:pass@db-host:5432/ktms?sslmode=require' \
  -e KTMS_ENCRYPTION_KEYS \
  -e BOOTSTRAP_ADMIN_KEY \
  -e REDIS_ADDR=redis-host:6379 \
  coyl/ktms:latest
```

In Kubernetes, point your liveness probe at `GET :8080/healthz` and readiness probe at `GET :8080/readyz` (checks DB ping). Run as many replicas as you like; they share Postgres and Redis and poll for configuration changes every `ROUTING_RELOAD_SECONDS`.

### Building from source

Requires Go 1.26+ (and `ffmpeg` on `PATH` if using Gemini speech synthesis).

```bash
make build                       # → bin/ktms-server and bin/ktms-node
export DATABASE_URL=postgres://ktms:ktms@localhost:5432/ktms?sslmode=disable
export KTMS_ENCRYPTION_KEYS="1:$(head -c 32 /dev/urandom | base64)"
./bin/ktms-server
```

### Production checklist

- **TLS.** The server speaks plaintext gRPC. Terminate TLS in front (Envoy, nginx with `grpc_pass`, service mesh, cloud load balancer) or run inside a private network.
- **Back up the encryption keyring.** Without `KTMS_ENCRYPTION_KEYS` (or legacy `LLMPROXY_ENCRYPTION_KEYS`), vendor keys stored in Postgres are unrecoverable. Treat it like a root secret.
- **Mint real admin keys and drop `BOOTSTRAP_ADMIN_KEY`.** It acts as an implicit admin key.
- **Run Redis if you want throttling.** With `REDIS_ADDR` empty, RPM and daily budgets are **not enforced** (the proxy fails open by design, including during Redis outages).
- **Mint one API key per client** (and give each client their own vendor credentials) so spend accounting, model access, and revocation are isolated.
- **Tune Postgres connections.** Each replica holds up to `DB_MAX_CONNS` (default 25).
- **Back up Postgres.** That is where all your configuration lives.

## Configuration reference

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | – | **Required.** Postgres connection string. |
| `KTMS_ENCRYPTION_KEYS` | – | **Required.** Versioned key ring `1:<base64-32-bytes>[,2:…]`. Highest version encrypts; all versions decrypt. (Fallback: `LLMPROXY_ENCRYPTION_KEYS`). |
| `GRPC_ADDR` / `KTMS_PORT` | `:9090` | gRPC server address (data plane + admin plane). |
| `GRPC_MAX_RECV_MSG_SIZE` | `16777216` | Max gRPC message receive size in bytes (16 MB for multimodal payloads). |
| `HTTP_ADDR` / `KTMS_HTTP_ADDR` | `:8080` | HTTP server address (health probes + OpenAI-compatible API). |
| `HTTP_API_ENABLED` | `true` | Enable `/v1` API on `HTTP_ADDR`; `false` leaves only health probes. |
| `HTTP_API_TIMEOUT` | `5m` | Read/write timeout for a single HTTP call. |
| `METRICS_ADDR` | `:9091` | Internal HTTP address for Prometheus `/metrics` and `/healthz`. If empty, metrics server is disabled. |
| `LOG_LEVEL` | `info` | Zerolog level. |
| `SHUTDOWN_TIMEOUT` | `30s` | Time to wait for in-flight requests on SIGTERM. |
| `DB_MAX_CONNS` / `DB_MIN_CONNS` | `25` / `5` | Postgres connection pool bounds per replica. |
| `ROUTING_RELOAD_SECONDS` | `60` | How often replicas poll Postgres for config changes. |
| `AUTO_MIGRATE` | `true` | Run migrations on startup (safe with multiple replicas via advisory locks). |
| `MIGRATE_TIMEOUT` | `3m` | Timeout for migration execution. |
| `REDIS_ADDR` | empty | Redis address for throttling. If empty, throttling is disabled. |
| `REDIS_PASSWORD` / `REDIS_DB` | empty / `0` | Redis credentials. |
| `REDIS_KEY_PREFIX` | empty | Prefix for Redis keys when sharing an instance (compose uses `dev`). |
| `BATCH_POLL_SECONDS` | `60` | Background poll interval for pending batch jobs (in seconds). |
| `BATCH_MAX_ITEMS` | `10000` | Max items allowed in a single `SubmitBatch` request. |
| `RESULTS_RETENTION_DAYS` | `7` | Retention period for completed batch results (days or Go duration string). |
| `CACHE_ENABLED` | `false` | Enable exact-match response caching in Redis. |
| `CACHE_TTL` | `1h` | TTL for cached responses in Redis. |
| `CACHE_MAX_BYTES` | `1048576` | Max response size for caching in bytes (default 1 MB). |
| `GUARDRAILS_ENABLED` | `false` | Enable security inspection: PII redaction and prompt injection detection. |
| `GUARDRAILS_PII_ACTION` | `block` | PII action (`block` or `redact`). In `redact` mode, sensitive data is replaced with session tokens before reaching vendors. |
| `GUARDRAILS_PROMPT_INJECTION_ACTION` | `block` | Injection action (`block` or `log`). |
| `BOOTSTRAP_ADMIN_KEY` | empty | Ephemeral admin key for first-time provisioning. Drop once an admin key is minted. |
| `USAGE_COLLECTOR_HOST` | empty | `host:port` of a gRPC `usage.v1.UsageService` collector (e.g. `light-tokenmeter:9090`). If empty, usage recording is disabled. |
| `USAGE_PROJECT_ID` | `ktms` | Default project name in usage events (fallback: `llm-proxy`). |
| `SENTRY_DSN` | empty | Sentry error tracking DSN. |
| `SENTRY_ENVIRONMENT` / `SENTRY_RELEASE` | `development` / empty | Sentry metadata. |
| `SENTRY_ENABLE_TRACING` | `false` | Sentry performance tracing. |
| `OTEL_SERVICE_NAME` | `ktms` | Service name in OpenTelemetry traces (fallback: `llm-proxy`). |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | empty | OTLP gRPC endpoint (`host:port`) for distributed traces. If empty, export is disabled. |

## Setting it up: keys, models, rules

All mutations go through `ktms.v1.AdminService` with an `admin`-scoped key (or via [ktms-admin](/docs/ktms-admin/)). Mutations are validated in a database transaction alongside existing config, so invalid state never activates.

### 1. API keys

```bash
grpcurl -plaintext -H "authorization: Bearer $ADMIN_KEY" \
  -d '{"name":"billing-service","scopes":["generate"]}' \
  localhost:9090 ktms.v1.AdminService/MintAPIKey
```

Keys look like `ktms_<hex>` (legacy `llm_<hex>` keys are fully recognized). Postgres only stores a cryptographic hash; the plaintext key is returned once. Scopes: `generate` (data plane) and `admin` (full mutations). Use `ListAPIKeys` and `RevokeAPIKey` to manage keys.

### 2. Vendor keys (per client)

A vendor key is bound to **one** client API key and encrypted at rest. A client can only invoke models whose vendors they have credentials for; `ListModels` reflects this.

```bash
grpcurl -plaintext -H "authorization: Bearer $ADMIN_KEY" \
  -d '{"api_key_name":"billing-service","vendor":"google","plain_key":"AIza..."}' \
  localhost:9090 ktms.v1.AdminService/SetVendorKey
```

Supported vendors:
- `openai`
- `anthropic` (native SDK adapter with streaming and `tools` support)
- `google`
- `deepseek` (OpenAI-compatible, default endpoint `https://api.deepseek.com`)
- `groq` (OpenAI-compatible, default endpoint `https://api.groq.com/openai/v1`)
- `mistral` (OpenAI-compatible, default endpoint `https://api.mistral.ai/v1`)
- `azure` (Azure OpenAI Service; model must specify `endpoint`, e.g. `https://<resource>.openai.azure.com` with optional `?api-version=...`; model `id` maps to deployment name; content filter errors automatically trigger fallback chains)
- `bedrock` (Amazon Bedrock Converse/ConverseStream API; key format: `<access_key_id>:<secret_access_key>[:<region>[:<session_token>]]`, default region `us-east-1`; model `id` maps to foundation model or inference profile ARN/ID; optional `endpoint` overrides base URL; content filter and guardrail errors trigger transparent fallback)
- `ollama` (any self-hosted OpenAI-compatible server such as Ollama or llama.cpp; model must specify `endpoint`, e.g. `https://host/v1`)
- `typesafe` (`Judge` calls only)

Use `DeleteVendorKey` to remove a credential.

### 3. Models

```json
{ "model": {
    "id": "gemini-2.5-flash",
    "vendor": "google",
    "endpoint": "",
    "efforts": ["EFFORT_LOW", "EFFORT_MEDIUM"],
    "capabilities": ["google_search", "batch"],
    "rpm": 600,
    "price_in_per_mtok": 0.30,
    "price_out_per_mtok": 2.50,
    "daily_tokens_per_key": 50000000,
    "daily_tokens_per_user": 5000000,
    "enabled": true
  }
}
```

```bash
grpcurl -plaintext -H "authorization: Bearer $ADMIN_KEY" \
  -d @ model.json localhost:9090 ktms.v1.AdminService/UpsertModel
```

- `price_in_per_mtok` and `price_out_per_mtok` are USD per million tokens.
- Set `"enabled": false` to take a model out of service.
- Use `DeleteModel` to delete (blocked if referenced by any rule).

### 4. Rules

```bash
grpcurl -plaintext -H "authorization: Bearer $ADMIN_KEY" -d '{"rules":[
  {"name":"spanish-high",  "priority":30, "effort":"EFFORT_HIGH",
    "attributes":{"language":"es"}, "use":["gemini-2.5-pro","gpt-4o"], "enabled":true},
  {"name":"low-default",   "priority":20, "effort":"EFFORT_LOW",
    "use":["deepseek-chat","gpt-4o-mini"], "enabled":true},
  {"name":"anything-else", "priority":1,
    "use":["gpt-4o-mini"], "enabled":true}
]}' localhost:9090 ktms.v1.AdminService/ReplaceRules
```

- Highest `priority` matching rule wins; priorities and names must be unique.
- A rule matches if its `effort` matches the request (or rule effort is unspecified) **and** every attribute on the rule equals the attribute in the request.
- `use` defines the **fallback chain** in order (convention: cheaper first). If the first model is rate-limited or fails, the next is tried automatically.
- `weights` (optional) enables **weighted traffic splitting (Canary / A-B testing)**. When set, it must contain strictly positive integer weights corresponding to each model in `use` (e.g., `[90, 10]`). The primary candidate is chosen randomly by weight, while remaining models are retained in order as fallback options. If omitted, routing is deterministic (100% to `use[0]`).
- A **catch-all rule** (no attribute constraints) is required for every `effort`, guaranteeing that every request matches.
- `ReplaceRules` replaces the entire ruleset atomically; check active state with `GetConfig`.

### Speech, image, and judgment rules

These modalities do not have an effort level. The gateway routes them with `EFFORT_LOW` and a reserved `attributes["modality"]` set to `tts`, `image`, or `judge`. Only rules matching that modality can fire, and only models advertising the matching capability:

```json
{"name":"speech", "priority":100, "attributes":{"modality":"tts"},
 "use":["gemini-2.5-flash-preview-tts"], "enabled":true}
```

### Rotating the encryption key

Add a higher version key to your keyring (`1:…,2:…`), restart, invoke `RotateEncryption` RPC to re-encrypt stored vendor keys under the new version, then remove the old version from the keyring.

## Calling the proxy (gRPC)

Every call requires metadata header `authorization: Bearer ktms_…` (or legacy `Bearer llm_…`).

### GenerateText

```json
{
  "effort": "EFFORT_MEDIUM",
  "attributes": {"language": "es", "user_id": "u-42", "task": "summary"},
  "base_system_instruction": "You are a concise assistant.",
  "request_instruction": "Answer in one paragraph.",
  "messages": [{"role": "MESSAGE_ROLE_USER", "text": "Summarize …"}],
  "response_schema": {"type": "object",
    "properties": {"summary": {"type": "string"}}, "required": ["summary"]},
  "max_output_tokens": 800,
  "action_id": "app.summarize"
}
```

| Field | Notes |
| --- | --- |
| `effort` | Routing effort level. |
| `attributes` | Arbitrary key/value pairs matched by rules and forwarded to usage events. Special: `user_id` burns daily user budget (falls back to `svc:<key_name>`), `usage_project` overrides the event project. |
| `base_system_instruction`, `request_instruction` | System instructions; never passed in the messages array. |
| `response_schema` | Omit for free text. Set for structured JSON schema; verified by the gateway for vendors without native support. |
| `tools`, `tool_choice` | Function definitions with JSON Schema parameters. `tool_choice` supports `auto`, `required`, `none`, or named function. |
| `messages` | History array. Roles: `MESSAGE_ROLE_USER`, `MESSAGE_ROLE_ASSISTANT`, `MESSAGE_ROLE_TOOL` (with `tool_call_id`). User messages support multimodal `parts` (`ContentPart`: `text`, `image`, `audio`, `document`). Assistant messages can contain `tool_calls`. |
| `max_output_tokens` | Ceiling on generated tokens (`0` = uncapped). Recommended: always set a ceiling because output tokens are most expensive. |
| `enable_google_search` | Grounding; only honored by Google models with `google_search` capability. |
| `action_id` | Optional action tag for usage analytics. |
| `model_override` | Exact model ID from registry; bypasses routing rules, but still enforces rate/budget limits. |
| `enable_cache` | Enable exact-match response cache. Returns `cached: true` on cache hits. In HTTP API, passed via `X-KTMS-Cache` (or fallback `X-LLM-Proxy-Cache`). |

### GenerateTextStream

Server-streaming `rpc GenerateTextStream(GenerateTextStreamRequest) returns (stream GenerateTextChunk)`.

- Yields incremental `GenerateTextChunk` containing `delta` text, `tool_call_chunks`, `resolved_model`, `resolved_vendor`, and final `finish_reason` with token `usage`.
- **Fallback guarantee:** If an upstream vendor fails before the first chunk is sent to the client, the router transparently switches to the next model in the rule chain. Once the first chunk is sent, the stream locks to that model to preserve response coherence.
- Usage events and token budgets are recorded upon stream completion.

### Batch text generation (`SubmitBatch`, `GetBatch`, `ListBatchResults`, `CancelBatch`)

For background workloads where cost matters more than latency, batch generation processes thousands of items asynchronously via upstream vendor Batch APIs (e.g. Google Gemini Batch API) at a **50% discount** compared to interactive calls. Jobs typically complete within 24 hours (vendor timeout: 48 hours).

- **Route resolution:** Resolved once upon submission. The first model in the rule chain with `batch` capability, valid client vendor credentials, and available budget is chosen.
- **Privacy:** Prompts are sent directly to the vendor Batch API and are never stored in the gateway database.
- **Throttling & budget:** RPM limits do not apply to batches. Daily token budgets are checked at submission, while token spend is finalized upon result polling. Results are retained for `RESULTS_RETENTION_DAYS` (default: 7 days).
- **Cancellation:** `CancelBatch` requests vendor-side cancellation. The batch stays in `RUNNING` until poll confirmation: finished items retain output, while uncompleted items are marked with error reason `batch_cancelled`.

### SynthesizeSpeech, GenerateImage, Judge, ListModels

- `SynthesizeSpeech`: accepts `text` and optional `language`, returns `audio` bytes as OGG/Opus.
- `GenerateImage`: accepts `prompt`, returns `image` bytes with `mime_type`.
- `Judge`: evaluates multiple typed questions (`JUDGE_TYPE_NOUL`, `JUDGE_TYPE_CHOICE`, `JUDGE_TYPE_SCORE`) in parallel against `state_json`, returning calibrated probabilities. Supported vendors: TypeSafe (`jev-latest`) and OpenAI (`gpt-6-luna`).
- `ListModels`: returns models for which the caller has configured vendor credentials.

## OpenAI-compatible HTTP API

Runs on `HTTP_ADDR` (default `:8080`) and shares keys, credentials, rules, fallbacks, throttling, and usage reporting with gRPC.

| Endpoint | Maps to RPC | Notes |
| --- | --- | --- |
| `POST /v1/chat/completions` | `GenerateText` / `GenerateTextStream` | Text, structured output, tool calls, and incremental SSE streaming. |
| `POST /v1/audio/speech` | `SynthesizeSpeech` | Returns audio in OGG/Opus format. |
| `POST /v1/images/generations` | `GenerateImage` | Returns image in `b64_json` format. |
| `POST /v1/decisions` | `Judge` | OpenAI Decisions API format (`predicate`, `choice`, `score`). |
| `POST /v1/judge` | `Judge` | Protobuf JSON for `JudgeRequest` / `JudgeResponse`. |
| `GET /v1/models`, `GET /v1/models/{id}` | `ListModels` | Returns models accessible to the caller's key. |

Diagnostic response headers:
- `X-KTMS-Model`, `X-KTMS-Vendor`, `X-KTMS-Rule`, `X-KTMS-Attempts`, `X-KTMS-Cache`
- For backwards compatibility, legacy `X-LLM-Proxy-*` headers are dual-emitted alongside standard RFC 8594 deprecation headers: `Deprecation: true`, `Sunset`, and `Warning: 299 - "X-LLM-Proxy-* headers are deprecated; migrate to X-KTMS-*"`.
- Incoming headers `X-KTMS-Placement` and `X-KTMS-Cache` take precedence, transparently falling back to `X-LLM-Proxy-Placement` and `X-LLM-Proxy-Cache`.

### Choosing a model in HTTP API

| `model` field | Behavior |
| --- | --- |
| `auto` (or empty) | Routing by rules. Effort inferred from `reasoning_effort` (`low` / `medium` / `high`), default `medium`. |
| `auto:low`, `auto:medium`, `auto:high` | Routing by rules for the specified effort. |
| any other value | Exact registry model ID (`model_override`): bypasses rules, still enforces limits. |

## Concepts

- **Effort** is the only built-in routing dimension; everything else belongs in free-form `attributes`.
- **Throttling** operates on two levels: a fixed 1-minute window (`rpm` per API key) and UTC-calendar-day token budgets (`daily_tokens_per_key`, `daily_tokens_per_user`).
- **Exact-Match Response Caching.** When enabled via `CACHE_ENABLED=true` and requested with `enable_cache=true` (or HTTP header `X-KTMS-Cache: true` / legacy `X-LLM-Proxy-Cache: true`), responses are cached in Redis encrypted (AES-256-GCM). Keys are strictly isolated by tenant `APIKeyID` and invalidated on routing config changes. Cache hits check RPM limits to prevent flooding, consume zero daily token budget, and report an event with `meta["cache"] = "hit"`. Streaming requests (`GenerateTextStream`) cache on completion and replay chunks with `cached: true`.
- **Security & Guardrails (PII Redaction & Prompt Injection Defense)**: When `GUARDRAILS_ENABLED=true`, incoming user prompts and state JSON are inspected before reaching external vendors. Injection attacks (jailbreaks, "ignore previous instructions") are flagged by heuristic analysis and either blocked or logged. The PII detector flags emails, phone numbers, SSNs, IPv4 addresses, and credit cards (validated via Luhn algorithm). In `block` mode, violations return `INVALID_ARGUMENT: guardrail_violation`. In `redact` mode, sensitive data is replaced with session tokens (e.g. `[EMAIL_1]`) before forwarding to the vendor, and model outputs, tool arguments, and stream deltas are de-sanitized before returning to the client.
- **Usage reporting.** When `USAGE_COLLECTOR_HOST` is set, every call sends an event to a gRPC service implementing `usage.v1.UsageService` (such as [light-tokenmeter](/docs/light-tokenmeter/)). Events bind to `attributes["usage_project"]` or fall back to client API key name (`svc:<key_name>`).

## Error contract

### RPC status codes

| gRPC Status | Reason | What to do |
| --- | --- | --- |
| `NOT_FOUND` | – | Unknown `batch_id`. |
| `INVALID_ARGUMENT` | `guardrail_violation` | Request blocked by guardrail (prompt injection or PII). Sanitize input before retrying. |
| `INVALID_ARGUMENT` | `bad_request: <message>` | Empty batch, duplicate `custom_id`, exceeded item limits (> `BATCH_MAX_ITEMS`), or invalid params. |
| `UNAVAILABLE` | `vendors_unavailable` | Entire model chain failed. **The only error that should be retried.** |
| `RESOURCE_EXHAUSTED` | `throttled:rpm`, `throttled:budget_key`, `throttled:budget_user` | Rate or daily budget exceeded; back off and wait. |
| `FAILED_PRECONDITION` | `output_truncated` | Response hit output ceiling; raise `max_output_tokens` and do not retry with identical params. |
| `FAILED_PRECONDITION` | `no_capable_model` | No model in rule chain can serve requested modality or capability (`batch`). |
| `FAILED_PRECONDITION` | `no_vendor_key` | Client key has no credentials for vendors in rule chain. |
| `FAILED_PRECONDITION` | `not_configured` | Models or rules not yet configured. |
| `FAILED_PRECONDITION` | `batch not configured` | Batch processing subsystem not enabled on gateway (missing batch store). |
| `UNIMPLEMENTED` | `ffmpeg_missing` | Gemini speech synthesis called without ffmpeg or on slim container. Install ffmpeg or use `:audio` image. |
| `INTERNAL` | `vendor_error` | Fatal error from external vendor. |
| `UNAUTHENTICATED` / `PERMISSION_DENIED` | – | Missing/invalid key or insufficient scope. |

### Batch item error reasons

| Reason | When it happens | What to do |
| --- | --- | --- |
| `output_truncated` | Item exceeded `max_output_tokens` or model generation ceiling. | Resubmit item with higher `max_output_tokens`. |
| `vendor_error` | Upstream vendor error or structured schema validation failure. | Retry synchronously or resubmit in another batch. |
| `batch_expired` | Vendor-side 48h batch deadline expired before completion. | Resubmit item. |
| `batch_cancelled` | Batch was cancelled before processing finished. | Resubmit item if needed. |

## Operations & Development

```bash
make test       # go test -race ./...
make build      # binaries in bin/ (ktms-server, ktms-node)
make proto      # regenerate gen/ after editing proto/ (requires buf)
make clients    # regenerate usage collector stubs from usage-proto/
```
{% endraw %}
