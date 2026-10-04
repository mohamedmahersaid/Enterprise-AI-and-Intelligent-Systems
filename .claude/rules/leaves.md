---
paths:
  - "docs/**/*.md"
  - "data/catalog.json"
  - "data/live/*.json"
---

# Leaf rules (summary of CONTRIBUTING.md; it wins on any conflict)

- New leaf: `npm run new-leaf -- --id ai-x --title "..." --level <L> --tree "<T>" --branch "<B>"`
  (no args lists valid values). Replace every `TODO:`; validation fails while any remain.
- Ten sections: Explanation, Architecture and flow (mermaid), Commands, Automation
  scripts, Lab (with `### Validation` stating evidence), Operational automation,
  Troubleshooting (five `### Scenario N:` each with `**Likely cause:**` and
  `**Resolution:**`), Interview questions (four `###`), Certification alignment,
  References.
- Each `### Command N` owns exactly one ```` ```text ```` fence. Shell lines calling
  `az`, `kubectl`/`helm`, `nvidia-smi`/`vllm`, Slurm or `ollama` require the matching
  `needs` entry.
- Python blocks: every third-party import needs a `pip install` in the same leaf;
  run bare in an empty dir, a block must finish or stop with its own message.
- Certification lines: `- **Label** - Official domain: ...` with the label copied
  exactly from `data/certifications.json` and the line opening with a registered
  domain. OWASP IDs carry the edition year (`LLM04:2026 Supply Chain`), on one line.
- References: `- [Publisher: Title](https://...) - what this leaf uses it for.`
  Most specific primary page; no blogs or mirrors; no repeated URL.
- Readiness: catalog, frontmatter and the `**Readiness:**` line must agree. Every
  leaf starts `lab`; `validated` only via `/record-live-run`.
- Fictional names, sanitized examples, versions and rollback stated. No credential
  formats anywhere, even in prose.
- Length is not gated (about 2,600-3,500 words); write to the level, never pad.
- After any change: `npm run regen`, then `npm run validate`.
