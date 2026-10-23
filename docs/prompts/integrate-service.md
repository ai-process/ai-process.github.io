---
title: "Integrate a service"
nav_order: 11
nav_group: prompts
permalink: /docs/prompts/integrate-service/
---

{% raw %}
# Prompt: Integrate a Service with Keystone. The Model Switchboard. (KTMS)

Moves a service's LLM calls onto Keystone. The service stops naming vendor models and holding vendor
keys: it asks for an effort level, says who the call is for, and handles KTMS's errors in one
place. Use it in the repository of the service.

## What You Need

- A KTMS client key with the `generate` scope (`ktms_…`), from your administrator or the
  [routing prompt](/docs/prompts/configure-routing/). Put it in the environment, not in the chat.
- The gateway address: HTTP (default port 8080) for OpenAI-compatible SDKs, or gRPC (port 9090).

## Prompt

```text
You are moving this service's LLM calls onto Keystone (KTMS) 1.0, a self-hosted LLM gateway.
Read these sources first and prefer them to anything you remember about LLM gateways:
- https://raw.githubusercontent.com/ai-process/ktms/v1.0.0/README.md
  (sections "OpenAI-compatible HTTP API", "Calling Keystone", "Error contract")
- https://raw.githubusercontent.com/ai-process/ktms/v1.0.0/proto/ktms/v1/gateway.proto (gRPC only)

Facts:
- HTTP is the OpenAI wire format at <KTMS_HTTP_URL>/v1: /chat/completions (SSE streaming, tools,
  response_format json_schema), /embeddings, /audio/speech, /images/generations, /models.
  OpenAI SDKs work by changing base URL and key.
- gRPC is ktms.v1.GatewayService on port 9090 with metadata "authorization: Bearer <key>":
  GenerateText, GenerateTextStream, GetEmbeddings, Judge, SubmitBatch. Go stubs:
  github.com/ai-process/ktms/gen/ktms/v1; other languages generate from proto/ktms/v1.
- The client key (ktms_…, scope generate) comes from the environment variable KTMS_API_KEY.
- Do not name vendor models. Use model "auto" (a judge picks the effort), "auto:low|medium|high"
  to pin the effort, or "auto:<placement>:<effort>" with placement nodes-first, nodes-only,
  cloud-first or cloud-only. In gRPC set effort EFFORT_LOW|EFFORT_MEDIUM|EFFORT_HIGH.
  An exact model id bypasses the rules: use it only where one specific model is required.
  Embeddings are the exception: they need an exact embedding model id, "auto" is refused.
- Attribution: HTTP "user" becomes attributes.user_id (per-user limits and reports), "metadata"
  is passed as routing attributes and metadata.action_id labels the call in usage reports.
  gRPC has attributes and action_id fields.
- Always set max_tokens (HTTP) or max_output_tokens (gRPC).
- Errors (HTTP: {"error":{"message","type","param","code"}}; gRPC: status + message):
  429 throttled:* and insufficient_quota carry Retry-After: wait, then retry or degrade;
  503 vendors_unavailable, auth_unavailable, storage_unavailable, throttled:spend_unavailable:
  retry with backoff (Retry-After only when present);
  502 vendor_error: the vendor failed terminally; retry once later at most, then fail;
  400 output_truncated: raise the token ceiling, do not retry as is;
  400 no_capable_model, no_vendor_key, not_configured, request_too_large and
  403 "not allowed for key|team": configuration problems, never retry.
  Turn off the SDK's own retries (max_retries=0) and implement this policy once.
- Response headers X-KTMS-Vendor, X-KTMS-Rule, X-KTMS-Placement and X-KTMS-Route-Mode (gRPC:
  resolved_model, resolved_vendor, matched_rule) say what served the call; log them at debug level.

Task:
1. List every place this codebase calls an LLM vendor (SDKs or raw HTTP) with file:line, before
   changing anything.
2. Route them through Keystone over <HTTP with the OpenAI SDK | gRPC>, through one small client
   module that owns the base URL, key, timeouts, retry policy and attribution.
3. Give each call site an effort: low for classification, extraction and short answers, medium
   for ordinary generation, high for reasoning and long documents. Justify each in one line.
4. Pass the end user's id and an action id per call site, named "<service>.<feature>".
5. Keep structured output: response_format json_schema (HTTP) or response_schema (gRPC) wherever
   the code parses JSON from the model.
6. Configuration comes from KTMS_BASE_URL (or KTMS_GRPC_ADDR) and KTMS_API_KEY; add both to the
   project's example env file and deployment config.
7. Add tests against a fake Keystone covering success, a 429 with Retry-After, a 503 and a 502.

Do not change business logic, and keep vendor SDK dependencies that other code still uses.
End with the changed files, the effort chosen per call site, and the variables to set.
```

## Check the Result

- No vendor API key and no vendor model name is left in the service's code or configuration,
  except where a specific model is required on purpose.
- Every call sets a token ceiling, an effort (or `auto`), the user id and an action id.
- The SDK's built-in retries are off, and `throttled:*`, `output_truncated` and configuration
  errors are handled as the prompt says.
- A test call shows `X-KTMS-Rule` (or `matched_rule`) naming the rule you expected.
{% endraw %}
