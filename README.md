# ai-process.dev

Landing page and documentation for the [ai-process](https://github.com/ai-process) projects:
KTMS, light-tokenmeter and ktms-admin. Served by GitHub Pages at <https://ai-process.dev>;
the blog lives at <https://blog.ai-process.dev> ([ai-process/blog](https://github.com/ai-process/blog)).

## Layout

- `index.html` — the landing page.
- `docs/` — documentation pages. Generated from the English service docs; do not edit by hand.
- `_layouts/`, `_includes/`, `assets/` — templates, styles, scripts and images.

## Updating the docs

The pages under `docs/` are copied from the documentation repository with link rewriting:

```bash
python3 scripts/sync-docs.py ../docs
```

Only the service guides listed in `scripts/sync-docs.py` are published.

## Local preview

```bash
docker run --rm -p 4000:4000 -v "$PWD":/srv/jekyll jekyll/jekyll:pages jekyll serve --host 0.0.0.0
```

Pushes to `main` deploy through `.github/workflows/deploy.yml`.

## License

MIT
