#!/usr/bin/env python3
"""Copy the public service docs from ai-process/docs (en/) into docs/ with Jekyll front matter.

Usage: python3 scripts/sync-docs.py [path-to-docs-repo]   (default: ../docs)
Only the pages listed in PAGES are published; internal reports (benchmark, competitors,
marketing) stay in the private repo, and links to them point at public READMEs instead.
"""
import pathlib
import posixpath
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT.parent / "docs").resolve()

# source file (relative to en/) -> (slug, nav title, order); prompts/ and the tools pages form
# their own nav groups
PAGES = {
    "architecture.md": ("architecture", "Architecture & deployment", 1),
    "ktms.md": ("ktms", "Keystone (KTMS) gateway", 2),
    "local-nodes.md": ("local-nodes", "Local GPU node pool", 3),
    "quickstart-local-node.md": ("quickstart-local-node", "Quick start: local node", 4),
    "light-tokenmeter.md": ("light-tokenmeter", "light-tokenmeter", 5),
    "ktms-admin.md": ("ktms-admin", "ktms-admin console", 6),
    "cli.md": ("cli", "Command-line tools", 7),
    "mcp.md": ("mcp", "MCP servers", 8),
    "skills.md": ("skills", "Skills & Claude Code plugin", 9),
    "prompts/index.md": ("prompts", "Overview", 10),
    "prompts/assess-system.md": ("prompts/assess-system", "Assess your system", 11),
    "prompts/integrate-service.md": ("prompts/integrate-service", "Integrate a service", 12),
    "prompts/configure-routing.md": ("prompts/configure-routing", "Configure routing", 13),
    "prompts/deploy-stack.md": ("prompts/deploy-stack", "Deploy the stack", 14),
    "prompts/local-node.md": ("prompts/local-node", "Add a local GPU node", 15),
    "prompts/migrate.md": ("prompts/migrate", "Migrate from LiteLLM or SDKs", 16),
    "prompts/usage-reports.md": ("prompts/usage-reports", "Usage and spend reports", 17),
    "prompts/production-review.md": ("prompts/production-review", "Production review", 18),
    "roadmap.md": ("roadmap", "Roadmap", 19),
}
TOOLS = {"cli.md", "mcp.md", "skills.md"}
BENCH = "https://github.com/ai-process/ktms#resource-footprint"
EXTERNAL = {
    "ktms-benchmark.md": BENCH,
    "competitors/index.md": BENCH,
    "llm-proxy.md": "/docs/ktms/",
    "llm-proxy-admin.md": "/docs/ktms-admin/",
}


def rewrite_link(target: str, page: str) -> str:
    path, _, anchor = target.partition("#")
    if path and "://" not in path and not path.startswith("/"):
        # Links are relative to the page's own folder in en/.
        path = posixpath.normpath(posixpath.join(posixpath.dirname(page), path))
    if path.startswith("../diagrams/"):
        return "/assets/diagrams/" + path.removeprefix("../diagrams/")
    if path in EXTERNAL:
        return EXTERNAL[path]
    if path in PAGES:
        return f"/docs/{PAGES[path][0]}/" + (f"#{anchor}" if anchor else "")
    return target


def convert(text: str, page: str) -> str:
    text = re.sub(r"\]\(([^)\s]+)\)", lambda m: "](" + rewrite_link(m.group(1), page) + ")", text)
    # Private tracker links mean nothing to public readers: keep the text, drop the link.
    text = re.sub(r"\[([^\]]+)\]\(https://github\.com/ai-process/docs/[^)]*\)", r"\1", text)
    text = re.sub(r" \| \*\*Epic:\*\* `ai-process/docs#\d+`", "", text)
    # kramdown has no inline TeX on GitHub Pages.
    text = text.replace("$\\ge$", "≥").replace("$\\le$", "≤")
    text = re.sub(r"\$\\sum W_\{\\text\{eff\}\}\$", "ΣW_eff", text)
    return text


def main() -> None:
    out = ROOT / "docs"
    for name, (slug, title, order) in PAGES.items():
        body = convert((SRC / "en" / name).read_text(), name)
        group = "nav_group: prompts\n" if name.startswith("prompts/") else ""
        if name in TOOLS:
            group = "nav_group: tools\n"
        front = f"---\ntitle: \"{title}\"\nnav_order: {order}\n{group}permalink: /docs/{slug}/\n---\n\n"
        dest = out / f"{slug}.md"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(front + "{% raw %}\n" + body.rstrip() + "\n{% endraw %}\n")
    diagrams = ROOT / "assets" / "diagrams"
    diagrams.mkdir(parents=True, exist_ok=True)
    # Diagrams renamed or removed in the docs repo must not linger here.
    for f in diagrams.iterdir():
        if f.suffix in {".png", ".html", ".json"} and not (SRC / "diagrams" / f.name).exists():
            f.unlink()
    for f in (SRC / "diagrams").iterdir():
        if f.suffix in {".png", ".html", ".json"}:
            shutil.copy2(f, diagrams / f.name)
    print(f"synced {len(PAGES)} pages from {SRC}")


if __name__ == "__main__":
    main()
