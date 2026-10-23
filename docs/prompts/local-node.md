---
title: "Add a local GPU node"
nav_order: 14
nav_group: prompts
permalink: /docs/prompts/local-node/
---

{% raw %}
# Prompt: Add a Local GPU Node

Puts a machine's GPU to work for Keystone. The Model Switchboard. (KTMS): an Apple Silicon Mac or a
Linux machine with an NVIDIA card runs a local model through Ollama and registers it with the
gateway. Requests then go to the node first and fall back to cloud models when it is busy, asleep or
gone. The prompt has two parts: the administrator's side (key, model, rules) and the machine's
side (one installer command).

## What You Need

- Admin access to Keystone (`KTMS_ADMIN_KEY`) for the first part.
- The machine: macOS on Apple Silicon, or Linux with systemd user services (and an NVIDIA driver
  for GPU speed), enough memory for the model, and outbound internet. Nothing needs to reach the
  machine from outside: the installer sets up a tunnel unless you give it `--endpoint`.

## Prompt

```text
Help me add a local inference node to Keystone (KTMS) 1.0 and route to it with cloud fallback.
Read first, and prefer them to memory:
- https://raw.githubusercontent.com/ai-process/ktms/v1.0.0/README.md
  (sections "Run a node", "If the node does not show up", "Choosing a model and placement")
- https://raw.githubusercontent.com/ai-process/ktms/v1.0.0/scripts/install-node.sh (run --help)

Setup (edit before sending):
- Gateway: <proxy.example.com:443>, TLS <yes|no>; admin key in $KTMS_ADMIN_KEY.
- Machine: <Mac M3 Max 64 GB | Linux, RTX 4090 24 GB>, node id <anna-mac>.
- Model: <Ollama tag, e.g. gemma4:26b-a4b-it-qat>, parallel requests <1>, context <8192>.
- Which traffic: <efforts low and medium | requests with attribute private=true only>.
- Fallback cloud models: <gpt-4o-mini, …>.

Facts:
- The node agent registers with a node key (ktms_node_…) bound to one node id: MintNodeKey
  {name, node_id}; the key is shown once.
- The model must exist as vendor "local" with id exactly equal to the Ollama tag (UpsertModel;
  efforts it may serve; capabilities ["no_thinking"] for models that reason by default, such as
  Gemma 4; queue_timeout_ms for how long a request may wait for a free slot).
  Local models need no vendor credential; every client may call them.
- Rules route to it like to any model: put the local model first in the fallback chain and cloud
  models after it. Clients can also choose placement: model "auto:nodes-first" (the default),
  "auto:nodes-only" (never leave the machine), "auto:cloud-first", "auto:cloud-only".
- On the machine, one command installs Ollama, the model and the agent as user services, keeps
  the machine awake and waits for registration:
  curl -fsSL https://raw.githubusercontent.com/ai-process/ktms/v1.0.0/scripts/install-node.sh | sh -s -- \
    --proxy <gateway> --node-id <id> --model <tag> [--max-concurrency N] [--context N] [--plaintext]
  The proxy port defaults to 443 with TLS on; --plaintext is for a gateway without TLS.
  It asks for the node key with hidden input (or --key-file PATH), re-running updates, --doctor
  explains failures, --dry-run changes nothing, --uninstall removes it. It takes over an old
  llm-proxy-node install by itself.
- The installer warns when the model does not fit in memory: weights plus about 1.5 GB plus about
  1 GB per 8192 context tokens, against about 3/4 of RAM on a Mac or the GPU's memory on Linux.

Task:
1. Check that the model fits the machine; if not, suggest the largest model that does.
2. Give me the admin commands (grpcurl, with $KTMS_ADMIN_KEY): MintNodeKey, UpsertModel for the
   local model, and a ReplaceRules set that adds the local model in front of the chains I named
   while keeping a catch-all per effort. Show the current rules (GetConfig) first, since
   ReplaceRules replaces all of them.
3. Give me the exact installer command for the machine, and what the last lines should say.
4. Give me the checks: ListNodes shows the node HEALTHY with the model; a test call with
   model "auto:nodes-only:<an effort the local model serves>" is served by it (X-KTMS-Placement, X-KTMS-Vendor: local); with the
   node stopped, a normal call falls back to the cloud.
5. Explain how to read --doctor output for the common failures.
```

## Check the Result

- The model id in `UpsertModel` is exactly the Ollama tag passed to `--model`.
- Every effort still has a catch-all rule after `ReplaceRules`, and cloud models follow the local
  one in each chain.
- `ListNodes` shows the node `HEALTHY`; `auto:nodes-only:<effort>` calls, with an effort the local
  model serves, are served locally; with the node
  off, calls still succeed through the cloud.
- The node key was typed into the installer's hidden prompt or a key file, not into the chat.
{% endraw %}
