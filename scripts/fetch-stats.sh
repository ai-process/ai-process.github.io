#!/bin/sh
# Writes _data/stats.json: Docker Hub pulls and the latest Keystone release, for the adoption strip.
# Keeps the committed file when an API does not answer, so a build never shows zeros.
set -eu
cd "$(dirname "$0")/.."
pulls() { curl -fsS "https://hub.docker.com/v2/repositories/coyl/$1/" | sed -n 's/.*"pull_count": *\([0-9]*\).*/\1/p'; }
total=0
for r in ktms light-tokenmeter ktms-admin llm-proxy-admin ktms-cli; do
	n=$(pulls "$r" 2>/dev/null || true)
	total=$((total + ${n:-0}))
done
rel=$(curl -fsS https://api.github.com/repos/ai-process/ktms/releases/latest 2>/dev/null || true)
tag=$(printf '%s' "$rel" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n 1)
date=$(printf '%s' "$rel" | sed -n 's/.*"published_at": *"\([0-9-]*\)T.*/\1/p' | head -n 1)
count=$(curl -fsS "https://api.github.com/repos/ai-process/ktms/releases?per_page=100" 2>/dev/null | grep -c '"tag_name"' || true)
if [ "$total" -eq 0 ] || [ -z "$tag" ]; then
	echo "stats: an API did not answer; keeping _data/stats.json" >&2
	exit 0
fi
cat >_data/stats.json <<JSON
{"docker_pulls": $total, "latest_release": "$tag", "latest_release_date": "$date", "releases": ${count:-0}, "measured": "$(date -u +%Y-%m-%d)"}
JSON
cat _data/stats.json
