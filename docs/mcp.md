---
title: "MCP servers"
nav_order: 8
nav_group: tools
permalink: /docs/mcp/
---

{% raw %}
# MCP Servers for AI Assistants

`ktms mcp` and `tokenmeter mcp` give Claude Code, Claude Desktop, Cursor and other
[Model Context Protocol](https://modelcontextprotocol.io) clients the tools of Keystone. The Model
Switchboard. (KTMS) and light-tokenmeter. An assistant then reads the configuration, explains a
route, plans a change or answers a spend question itself, instead of writing `grpcurl` scripts.
Both servers are subcommands of the [command-line tools](/docs/cli/) and use their contexts and keys.

> [!NOTE]
> The MCP servers ship with Keystone 1.2 and light-tokenmeter 1.1; their tools are Experimental
> until the next minor release.

## Connecting

Claude Code (`.mcp.json` in a repository, or `claude mcp add ktms -- ktms mcp`), Claude Desktop
(`claude_desktop_config.json`) and Cursor (`.cursor/mcp.json`) take the same entries:

```json
{
  "mcpServers": {
    "ktms": { "command": "ktms", "args": ["mcp"], "env": { "KTMS_CONTEXT": "prod" } },
    "tokenmeter": { "command": "tokenmeter", "args": ["mcp"], "env": { "TOKENMETER_CONTEXT": "prod" } }
  }
}
```

The [Claude Code plugin](/docs/skills/) adds both servers together with the skills.

## Keystone tools

| Tool | Does |
| --- | --- |
| `get_config` | The live configuration as a ktms config file (YAML), without secrets |
| `list_models`, `list_rules` | The registry and the rules, first match first |
| `list_keys`, `list_vendor_keys` | Client keys and policies; vendor credentials by fingerprint |
| `list_teams`, `list_spend_limits`, `get_spend` | Tenants, caps and spend against them |
| `list_nodes`, `list_node_keys` | Inference nodes and their keys |
| `explain_route` | Where a request with a client key would go, on Keystone's own routing code |
| `health` | `/healthz`, `/readyz` and the version |

With `--allow-write`, and only then, the server also offers:

| Tool | Does |
| --- | --- |
| `config_plan` | A ktms config file in, the plan and a `plan_id` out; nothing changes |
| `config_apply` | Applies a shown plan once, in the session that planned it, if Keystone has not changed since |
| `mint_key` | A client key, returned once and marked for the user |
| `revoke_key`, `set_key_policy` | Key changes |
| `set_spend_limit`, `delete_spend_limit` | Spend caps |
| `drain_node` | Stop sending new work to a node |

Resources: `ktms://config` (the live configuration) and `ktms://schema` (the file's JSON Schema).
Prompts: `configure_routing`, `integrate_service`, `local_node`, `production_review`.

## light-tokenmeter tools

All of them read:

| Tool | Does |
| --- | --- |
| `usage_summary` | Requests, tokens and cost by the dimensions grouped by, totals or per day |
| `top_spenders` | Who or what used the most, with shares |
| `cost_per_action` | Cost and tokens per request, latency and the failed share per `action_id` |
| `usage_by_meta` | What a job tagged in `meta` cost |
| `health` | `/healthz`, `/readyz` and the version |

Amounts come as exact `cost_usd` and as `cost_nanousd`; windows are UTC; a result the server
truncated is marked as not a total. Prompt: `usage_report`. Together with Keystone's `get_spend`
an assistant can say what was spent and how much of a cap is left.

## Read and write

- **Read-only by default.** `ktms mcp` offers write tools only with `--allow-write`, and an
  `admin:read` key keeps even those refused. `tokenmeter mcp` has no write tools and refuses a
  token that can write events.
- **Plan, show, apply.** Every configuration change goes through `config_plan`; the assistant
  shows the plan and calls `config_apply` with its `plan_id` after the user agrees. A plan applies
  once, only in its session, and is refused when the live configuration changed in between.
- **Secrets stay out of the chat.** Vendor keys in a plan come from the MCP server's environment,
  only from variables named `KTMS_VENDOR_KEY_*`, so an assistant cannot point `plain_key_env` at the
  admin key or another secret. A new client key is returned once, marked for the user.

## Over the network

```bash
KTMS_MCP_TOKEN=$(openssl rand -hex 32) ktms mcp --listen 127.0.0.1:8765
TOKENMETER_MCP_TOKEN=$(openssl rand -hex 32) tokenmeter mcp --listen 127.0.0.1:8766
```

Streamable HTTP at `/mcp`; every request needs `Authorization: Bearer <token>` (16+ characters).
The SDK's DNS-rebinding protection and cross-origin protection are on. The servers speak plain
HTTP: keep them on localhost, or put a TLS proxy in front. A client entry:

```json
{ "mcpServers": { "ktms": { "type": "http", "url": "http://127.0.0.1:8765/mcp",
                            "headers": { "Authorization": "Bearer ${KTMS_MCP_TOKEN}" } } } }
```

## Security

- The servers hold the keys; tool results never contain them, except a new client key once.
- Names, attributes and other values come from configuration other people write. The tools say so,
  and an assistant should treat them as data, never as instructions.
- Give a shared or remote server an `admin:read` key and a `read` token, and add `--allow-write`
  only where an assistant should change Keystone, ideally on a separate, local entry.
{% endraw %}
