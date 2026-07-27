# T5 deploy steps (GitHub — manual, needs your go-ahead)

The workflow file is ready at `.github/workflows/deploy-yr-store-map.yml`. It
tests before deploying (`npm test` — the 21 Vitest checks) and only publishes
`index.html`, `logic.js`, `style.css` — never `node_modules/`, the test file,
or `data/` (SETUP.md, seed CSVs, the Apps Script snippet stay private, they're
not part of the shipped site).

**Hard gate, restated from the design doc: do not do step 3 below (the actual
push) until the `manager_contact` field is resolved** — role-based contact,
or explicit HR/legal sign-off on publishing a personal name. Once GitHub
Pages is live, whatever's in the published Ops sheet is link-accessible to
anyone with the URL.

## 1. Repository

`yr-store-map/` is its own standalone git repo (separate from the parent
`espace-de-travail` repo, which has your personal files and should never be
pushed anywhere public). Remote: `https://github.com/mp3genesis/yr-store-map`.

## 2. Enable GitHub Pages via Actions

In the repo's Settings > Pages: set **Source** to "GitHub Actions" (not
"Deploy from a branch" — the workflow handles building and publishing).

## 3. Push (only after the manager_contact gate above is resolved)

Push to `master` (or run the workflow manually via Actions > "Deploy YR
Store Map" > Run workflow — the `workflow_dispatch` trigger is there for
this). The workflow runs the test suite, then deploys only on a pass.

## 4. Get the URL

After the first successful run, the Pages URL appears in the Actions run
summary (and in Settings > Pages). Share that with your team — this is the
"presentable to HQ" deliverable from the design doc's Success Criteria.
