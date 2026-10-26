---
title: "Quick start: local node"
nav_order: 4
permalink: /docs/quickstart-local-node/
---

{% raw %}
# Quick Start: Connecting a Local Inference Node

This guide provides a step-by-step walkthrough for connecting a local machine (running Ollama, vLLM, TGI, or llama.cpp) to `KTMS`.

---

## 1. Preparation on Keystone. The Model Switchboard. (KTMS)

### Step 1.1. Mint a Node Key (`NodeKey`)
Each worker machine needs a dedicated authentication key with prefix `ktms_node_...` (legacy `llm_node_...` recognized):

**Via the Web Console (`ktms-admin`):**
1. Navigate to the **Nodes** tab.
2. In the **Node Keys** section, click **Mint node key**.
3. Provide a name (e.g. `desktop-rtx4090`) and `Node ID` (e.g. `worker-1`).
4. Copy the generated `ktms_node_...` key (displayed only once).

**Or via gRPC (`grpcurl`):**
```bash
grpcurl -plaintext -H "authorization: Bearer $ADMIN_KEY" -d '{
  "name": "desktop-rtx4090",
  "node_id": "worker-1",
  "max_base_weight": 1000,
  "max_concurrency": 16
}' localhost:9090 ktms.v1.AdminService/MintNodeKey
```

### Step 1.2. Register the Model in the Registry
Register the model with vendor `local`:

```bash
grpcurl -plaintext -H "authorization: Bearer $ADMIN_KEY" -d '{
  "model": {
    "id": "qwen2.5:7b",
    "vendor": "local",
    "efforts": ["EFFORT_LOW", "EFFORT_MEDIUM"],
    "enabled": true
  }
}' localhost:9090 ktms.v1.AdminService/UpsertModel
```

### Step 1.3. Grant Client Access (`vendor: local`)
Allow a client API key to route requests to the local node pool:

```bash
grpcurl -plaintext -H "authorization: Bearer $ADMIN_KEY" -d '{
  "api_key_name": "my-app",
  "vendor": "local",
  "plain_key": "local"
}' localhost:9090 ktms.v1.AdminService/SetVendorKey
```

---

## 2. Launch the Inference Engine on the Worker

Ensure your inference engine is running and bound to a network interface:

* **Ollama:**
  ```bash
  ollama serve
  ollama pull qwen2.5:7b
  ```
* **vLLM:**
  ```bash
  vllm serve Qwen/Qwen2.5-7B-Instruct --port 8000
  ```

---

## 3. Run the Node Agent (`ktms-node`)

Build the binary or download a release asset:
```bash
make build # outputs bin/ktms-node
```

Start the agent on the machine, pointing to the `KTMS` gateway address and the engine endpoint:

```bash
export NODE_KEY="ktms_node_0123456789abcdef..."

./bin/ktms-node \
  --proxy-addr="ktms.internal:9090" \
  --node-id="worker-1" \
  --node-name="Worker RTX 4090" \
  --engine="ollama" \
  --endpoint="http://127.0.0.1:11434"
```

### Command-Line Arguments:
* `--proxy-addr`: gRPC address of the `KTMS` gateway (host:port).
* `--node-id`: Unique node identifier (defaults to hostname). Must match the `node_id` supplied when minting the key.
* `--node-name`: Human-readable label for logs and UI dashboards.
* `--engine`: Engine dialect (`ollama`, `vllm`, `tgi`, `llamacpp`).
* `--endpoint`: HTTP URL of the local inference engine (e.g. `http://127.0.0.1:11434`).
* `--node-key-file`: Alternative to `NODE_KEY` environment variable (path to file containing secret).
* `--base-weight`: Base node hardware weight (default 100.0).
* `--max-concurrent`: Max concurrent request limit (default 16).
* `--schedule-file`: Load schedule by local time, re-read on change; a missing file means 100%. See [Load Schedule](/docs/local-nodes/#load-schedule-capacity-levels).
* `--warmup`: How long before a paused window ends the model is loaded again (default 5m).
* `--stats-dir`, `--stats-retention`, `--stats`: Where the node's usage log is kept, for how long (default 90d), and whether at all (default on). Read it with `ktms-node stats`; see [Usage Log](/docs/local-nodes/#usage-log-ktms-node-stats).

---

## 4. Verification

1. In the `ktms-admin` console under the **Nodes** tab, verify that the worker appears with status **HEALTHY**, advertising available models, VRAM, and slots.
2. Send a test chat completion request to the gateway:
   ```bash
   curl -X POST http://localhost:8080/v1/chat/completions \
     -H "Authorization: Bearer ktms_client_key..." \
     -H "Content-Type: application/json" \
     -d '{
       "model": "qwen2.5:7b",
       "messages": [{"role": "user", "content": "Hello! What machine are you running on?"}]
     }'
   ```
   Response headers will include `X-KTMS-Model: qwen2.5:7b` (and legacy `X-LLM-Proxy-Model` with deprecation headers).
{% endraw %}
