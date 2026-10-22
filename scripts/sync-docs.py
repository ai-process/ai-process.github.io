#!/usr/bin/env python3
"""Copy the public service docs from ai-process/docs (en/) into docs/ with Jekyll front matter.

Usage: python3 scripts/sync-docs.py [path-to-docs-repo]   (default: ../docs)
Only the pages listed in PAGES are published; internal reports (benchmark, competitors,
marketing) stay in the private repo, and links to them point at public READMEs instead.
"""
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT.parent / "docs").resolve()

# source file -> (slug, nav title, order)
PAGES = {
    "architecture.md": ("architecture", "Architecture & deployment", 1),
    "ktms.md": ("ktms", "KTMS gateway", 2),
    "local-nodes.md": ("local-nodes", "Local GPU node pool", 3),
    "quickstart-local-node.md": ("quickstart-local-node", "Quick start: local node", 4),
    "light-tokenmeter.md": ("light-tokenmeter", "light-tokenmeter", 5),
    "llm-proxy-admin.md": ("ktms-admin", "ktms-admin console", 6),
}
BENCH = "https://github.com/ai-process/ktms#resource-footprint"
EXTERNAL = {
    "ktms-benchmark.md": BENCH,
    "competitors/index.md": BENCH,
    "llm-proxy.md": "/docs/ktms/",
}


def rewrite_link(target: str) -> str:
    path, _, anchor = target.partition("#")
    if path.startswith("../diagrams/"):
        return "/assets/diagrams/" + path.removeprefix("../diagrams/")
    if path in EXTERNAL:
        return EXTERNAL[path]
    if path in PAGES:
        return f"/docs/{PAGES[path][0]}/" + (f"#{anchor}" if anchor else "")
    return target


def convert(text: str) -> str:
    text = re.sub(r"\]\(([^)\s]+)\)", lambda m: "](" + rewrite_link(m.group(1)) + ")", text)
    # Private tracker links mean nothing to public readers: keep the text, drop the link.
    text = re.sub(r"\[([^\]]+)\]\(https://github\.com/ai-process/docs/[^)]*\)", r"\1", text)
    text = re.sub(r" \| \*\*Epic:\*\* `ai-process/docs#\d+`", "", text)
    text = text.replace("ai-process/llm-proxy-admin", "ai-process/ktms-admin")
    text = re.sub(r"^# llm-proxy-admin$", "# ktms-admin", text, flags=re.M)
    # kramdown has no inline TeX on GitHub Pages.
    text = text.replace("$\\ge$", "≥").replace("$\\le$", "≤")
    text = re.sub(r"\$\\sum W_\{\\text\{eff\}\}\$", "ΣW_eff", text)
    return text


def main() -> None:
    out = ROOT / "docs"
    for name, (slug, title, order) in PAGES.items():
        body = convert((SRC / "en" / name).read_text())
        front = f"---\ntitle: \"{title}\"\nnav_order: {order}\npermalink: /docs/{slug}/\n---\n\n"
        (out / f"{slug}.md").write_text(front + "{% raw %}\n" + body.rstrip() + "\n{% endraw %}\n")
    diagrams = ROOT / "assets" / "diagrams"
    diagrams.mkdir(parents=True, exist_ok=True)
    for f in (SRC / "diagrams").iterdir():
        if f.suffix in {".png", ".html", ".json"}:
            shutil.copy2(f, diagrams / f.name)
    print(f"synced {len(PAGES)} pages from {SRC}")


if __name__ == "__main__":
    main()
