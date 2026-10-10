<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Collaborative development

- Treat each feature branch as an independent workstream. Keep feature work
  self-contained and avoid introducing dependencies on other in-progress
  branches or unmerged features.
- Before changing shared foundations, APIs, schemas, or cross-feature code,
  verify that the change is necessary for the current feature. Prefer a
  feature-local solution when it preserves the existing architecture.
- Preserve unrelated work in the tree. Report the files changed and any
  integration assumptions or follow-up work needed when handing off a change.

These collaboration rules are expected to grow over time; add future durable
workflow instructions to this section.
