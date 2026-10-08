# OmniRoute Task Summary

## Canonical Project
- Project: OmniRoute (canonical/base). Branch: release/v3.8.52. HEAD: 5c7d3f07 (parent a2ed0704).
- Mandate: FlagshipRouter code/roadmap/architecture not used. OmniRoute local-only. Workflow: Inspect → Implement → Test → Browser QA → Fix → Build → Verify → Commit locally → Next task. No GitHub push, no Render/deploy, no production credentials/DB.

## Completed
- Ranking page: `src/app/(dashboard)/dashboard/ranking/page.tsx` reads `/api/free-provider-rankings` with `?withUsage=1&usageRange=24h&limit=100`, filters by category/type + configured/available, renders model leaderboard and provider leaderboard from `ranking.topModel`. i18n namespace `rankingPage` added in `src/i18n/messages/en.json`.
- Models upgrade: enrichment columns in the catalog.
  - `models/modelCatalogUtils.ts`: `CatalogModelRow` extended with `rpm`, `tpm`, `quotaTokens`, `enabled`, `reliability`, `avgLatencyMs`, `intelligence`, `eloRaw`. `CatalogSortField` expanded with the new numeric fields; comparator keeps unknown values last in both directions (absence is not zero).
  - `models/ModelCatalogTable.tsx`: `formatNullableCount`, `formatLatency`, `formatScore`, `scoreTone`, `reliabilityTone`, `formatReliability` helpers; 6 optional labels; 6 new sortable headings (RPM / TPM / Quota / Reliability / Latency / Intelligence); Enabled/Disabled badges via `Badge` variants `info` / `warning`; table width `min-w-[1560px]`.
  - `models/page.tsx`: best-effort parallel enrichment from `/api/provider-metrics`, `/api/free-provider-rankings?limit=200`, `/api/radar/catalog`; index maps keyed by provider and `provider:modelId`; each source merges conditionally so radar-off (404) or empty traffic does not break the table.
- Sidebar: ranking entry wired in `sidebarVisibility/types.ts`, `sections.ts`, `sidebarVisibility.ts` (icon `military_tech`, accent `#FACC15`, included in preset).
- Commit: `5c7d3f07 feat(dashboard): add ranking page and enrich model catalog` — local only, no push, no deploy.

## Verification
- Direct `npx tsc --pretty false --noEmit -p tsconfig.typecheck-dashboard.json`: no errors in `ranking`, `dashboard/models`, `modelCatalogUtils`, `ModelCatalogTable`, `sidebarVisibility`. Remaining errors are pre-existing baseline noise (`agent-skills` `Cannot find namespace 'JSX'`, `combos/page.tsx`, `open-sse/utils/cursorImages.ts`).
- ESLint blocked by broken toolchain, not by our code: `node_modules/eslint/lib/shared/ajv.js` sets `ajv._opts.defaultMeta`, but installed ajv is 8.20.0 where `_opts` is undefined, so every eslint invocation dies with `TypeError: Cannot set properties of undefined (setting 'defaultMeta')`. Affects eslint 8.57.1 (via `npx`) and eslint 10.10.0 (local bin) equally. `npm run lint` also passes `--suppressions-location`, unsupported under flat config.
- `npm run check:dashboard-typecheck` unusable in this shell: `Error: spawnSync npx.cmd EINVAL` in `scripts/check/check-dashboard-typecheck.mjs`.

## Pending
- Repair ESLint toolchain (align eslint/ajv versions, drop `--suppressions-location` from the `lint` script or move suppressions into flat config) before lint is a usable gate.
- Browser QA of `/dashboard/ranking` and `/dashboard/models` against a running dev server.