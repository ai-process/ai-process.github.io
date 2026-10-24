---
title: "Command-line tools"
nav_order: 7
nav_group: tools
permalink: /docs/cli/
---

{% raw %}
# Command-Line Tools: ktms and tokenmeter

Two command-line tools replace `grpcurl`, hand-built `curl` queries and `openssl` one-liners:
`ktms` administers Keystone. The Model Switchboard. (KTMS), and `tokenmeter` reads and writes
light-tokenmeter. Both keep keys out of the command line and print a new key only once, and both
come with an [MCP server](/docs/mcp/) for AI assistants.

> [!NOTE]
> The CLIs ship with Keystone 1.2 and light-tokenmeter 1.1. Until those releases, build them from
> `main` (see [Installation](#installation)). Their commands, flags and output are Experimental
> until the next minor release.

## Installation

| Way | ktms | tokenmeter |
| --- | --- | --- |
| Release archive (darwin/linux, amd64/arm64, signed `checksums.txt`) | `ktms_<v>_<os>_<arch>.tar.gz` | `tokenmeter_<v>_<os>_<arch>.tar.gz` |
| Go | `go install github.com/ai-process/ktms/cmd/ktms@latest` | `go install github.com/ai-process/light-tokenmeter/cmd/tokenmeter@latest` |
| Docker | `coyl/ktms-cli:<v>` | `coyl/tokenmeter-cli:<v>` |
| Homebrew (once the tap is published) | `brew install ai-process/tap/ktms` | `brew install ai-process/tap/tokenmeter` |

Completion: `ktms completion zsh > "${fpath[1]}/_ktms"`, likewise `bash` and `fish`, and the
same for `tokenmeter`.

## Contexts and keys

A context names a service and where its key lives, so a command needs no flags:

```bash
ktms context set prod --addr ktms.example.com:443 --tls --http https://ktms.example.com
ktms context store-key prod             # the admin key, read without echo, into the keychain
ktms context store-key prod --client    # a generate key for ktms chat
ktms context use prod

tokenmeter context set prod --addr tm.example.com:443 --tls --token keychain
tokenmeter context store-token prod
```

| | ktms | tokenmeter |
| --- | --- | --- |
| Contexts file | `~/.config/ktms/config.yaml` (`KTMS_CONFIG`) | `~/.config/tokenmeter/config.yaml` (`TOKENMETER_CONFIG`) |
| Address | `--addr` / `KTMS_ADDR` (gRPC, default `localhost:9090`) | `--addr` / `TOKENMETER_ADDR` (gRPC, default `localhost:9090`) |
| HTTP API | `--http` / `KTMS_HTTP` (default port 8080 of the same host) | `--http` / `TOKENMETER_HTTP` |
| TLS | `--tls` / `KTMS_TLS` | `--tls` / `TOKENMETER_TLS` |
| Key | `--key-file` / `KTMS_ADMIN_KEY`; `KTMS_API_KEY` for `chat` | `--token-file` / `TOKENMETER_TOKEN` |
| Context | `--context` / `KTMS_CONTEXT` | `--context` / `TOKENMETER_CONTEXT` |

A key source is `env:VAR`, `file:PATH` or `keychain` (macOS Keychain, or the secret service through
`secret-tool` on Linux); `store-key --file` and `store-token --file` keep the key in a `0600` file
instead. Flags win over the environment, which wins over the current context; a context named with
`--context` or `*_CONTEXT` wins over the environment, so its key never goes to an address left in
the shell. A key is never accepted as a flag value, and the CLI warns before sending one to a remote
address without TLS.

Use the least key that does the job: `admin:read` for everything in `ktms` that only reads,
`admin` for changes; a `read` token for `tokenmeter` reports, `write` for `event send`.

## ktms

| Command | Does |
| --- | --- |
| `ktms config validate\|plan\|apply\|export\|schema` | The configuration as a file, see [below](#configuration-as-a-file) |
| `ktms models list`, `ktms rules list` | The registry and the routing rules |
| `ktms keys list\|mint\|revoke`, `ktms keys policy set` | Client keys and their own limits |
| `ktms vendor-keys list\|set\|delete` | Vendor credentials per client key (`set` reads the key from stdin) |
| `ktms orgs list`, `ktms teams list` | Tenants |
| `ktms spend get key\|user\|team ID` | Spend against the caps |
| `ktms limits list\|set\|delete` | Spend limits per key or user, per UTC day or month |
| `ktms route explain KEY` | Where a request with this key would go, and why each model is kept or dropped |
| `ktms nodes list\|drain`, `ktms node-keys list\|mint\|revoke` | Inference nodes and their keys |
| `ktms rotate-encryption` | Re-encrypt secrets with the active keyring version |
| `ktms chat PROMPT` | A test call through `/v1`, then the rule, model and vendor that served it |
| `ktms health` | `/healthz`, `/readyz` and the server's version |
| `ktms mcp` | The [MCP server](/docs/mcp/) |

```bash
ktms keys mint billing --team acme/search --rpm 120
echo "$OPENAI_KEY" | ktms vendor-keys set billing openai
ktms route explain billing --effort high --attr tier=pro
ktms chat --effort low "Say hi"
ktms limits set key billing day 5
ktms spend get key billing
```

`ktms route explain` runs Keystone's own routing (`AdminService/ExplainRoute`): the matched rule,
every model of its chain kept or dropped with the reason (`no_vendor_key`, `key_policy`,
`team_policy`, `capability`, `placement`, `circuit_open`, `vendor_paused`, `node_unavailable`, …),
and what a call would try. It calls no vendor or judge and spends nothing.

Tables are the default; `-o json` and `-o yaml` keep the API's field names for scripts. Revokes
ask on a terminal and need `--yes` elsewhere.

### Configuration as a file

```bash
ktms config export -o ktms.yaml      # start from what is running
ktms config plan -f ktms.yaml        # what would change; --detailed-exitcode exits 3 on drift
ktms config apply -f ktms.yaml       # asks first; --yes for scripts
```

Models, rules, organizations and teams, client keys with policies, vendor keys (from environment
variables named in `plain_key_env`), spend limits and user rate limits. Only the sections in the
file are managed, and `--prune` deletes what a managed section does not list, except `admin` and
`admin:read` keys. The format is in [Configuration as a file](/docs/ktms/#configuration-as-a-file) and
its JSON Schema comes from `ktms config schema`.

## tokenmeter

| Command | Does |
| --- | --- |
| `tokenmeter usage summary` | Requests, tokens and cost over a window, `--group-by` any dimension, `--daily` per day |
| `tokenmeter usage top` | Rankings `--by cost\|tokens\|requests` over a `--dimension` |
| `tokenmeter usage by-meta` | What the events tagged `meta` key=value used, e.g. a job |
| `tokenmeter usage export` | Daily rows as CSV or JSON for a sheet or a script |
| `tokenmeter token new\|hash` | Tokens and their `TOKENMETER_TOKENS` entries |
| `tokenmeter event send` | One event, to check that writing works |
| `tokenmeter health` | `/healthz`, `/readyz` and the version |
| `tokenmeter mcp` | The [MCP server](/docs/mcp/) |

```bash
tokenmeter usage summary --last 7d --group-by project
tokenmeter usage top --by cost --dimension action --limit 5
tokenmeter usage by-meta --key job_id --value job-42 --group-by task_id
tokenmeter usage export --last 30d --format csv --out usage.csv
tokenmeter token new --name ktms --scope write
```

Windows are `--last` (`24h`, `7d`, `4w`) or `--from`/`--to` in RFC 3339 or `YYYY-MM-DD`, in UTC. A
window the server caps at 10,000 rows is fetched in smaller parts and added up, so totals are
complete. Amounts are USD in tables, exact dollars in `-o csv`, and `cost_nanousd` in `-o json`.
`pkg/client` is the Go client underneath.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Done |
| 1 | Failed |
| 2 | Bad usage: flags, arguments, a missing subcommand |
| 3 | `ktms config plan --detailed-exitcode`: the plan has changes |
| 4 | Not authenticated or not allowed: no key, a wrong key, a key without the scope |
| 5 | Not found |
| 6 | Rejected as invalid; retrying will not help |
| 7 | Unavailable, throttled or timed out: retry later |
{% endraw %}
