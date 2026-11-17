# Modelart Tracker

Windows desktop app (Electron + React + TypeScript) for tracking model builds at Modelart.
The README covers the features; this file is what a new chat needs to work here.

## Two kinds of request

- **Changing the app** (features, fixes, releases): work in this repo, see below.
- **Working with the live data** (post a notice, make a project from a quote or emails, "where
  are we on a project?"): use the `/modelart-tracker` skill. It has a helper script and the
  house rules for breakdowns and notices. The live data is NOT in this repo.

## Live data

- Shared folder: `Z:\Data\Shared Files\Modelart Tracker` (`projects/`, `templates/`,
  `timesheets/`, `notices/`, `jobs.json`, `people.json`, `activity/`, `deleted/`, `avatars/`).
- People ids: diets (the owner), garth, josias, mark, carl, conrad, mia, mogale, elsabe, yvonne.
- Job folders: `Z:\Data\2026\<nn> <Job name>\` -> job number `P<nn>/26`.
- Never delete or rewrite files there by hand; anything written must keep the shapes in
  `src/shared/types.ts`. Don't tick steps for the team unless asked.

## Code map

- `src/main/` Electron main: `storage.ts` (lock + re-read + apply + atomic write on the
  share), `index.ts` (IPC, polling every 3 s, updater, dev screenshot hook), `exporter.ts` (Excel).
- `src/renderer/src/` React UI: `pages/` (Projects, MyTasks, Timesheet, Noticeboard,
  Templates, Settings...), `board/` (project board, item panel), `styles.css` (theme tokens,
  red accent `#d72a33`, Geist fonts), `store.ts` (zustand).
- `src/shared/` types, steps/status, timesheet rules, path checks. `src/mcp/` MCP server.
- `scripts/` release, xls import, `shoot.sh` (screenshots).

## Commands

```bash
npm run dev          # hot reload
npm test             # vitest (MAT_TEST_ROOT=<folder> to run storage tests on the share)
npm run typecheck
npm run release -- patch   # bump, build installer, publish GitHub release, push tag
```

After a release, also copy the installer to the `Installer` folder in the data folder and
update its "How to install.txt" (done for every release so far).

## Checking UI changes

`scripts/shoot.sh <dataDir> <light|dark> "<a.png,b.png>" "<js1|||js2>"` builds, opens the app
on a data folder and saves one screenshot per JS step. Set `MAT_USER=<person id>`.

- Point it at a copy or demo folder, not the live share, when the steps click things.
- Each step runs in the same page: wrap code in an arrow function/IIFE; a top-level
  `const` repeated across steps throws.
- Navigate with e.g. `[...document.querySelectorAll('nav button')].find(b=>b.textContent.includes('Timesheet'))?.click()`.

## Rules

- No client data in the repo or in anything shared outside the studio: screenshots for
  marketing use made-up projects and people (a demo seed was used for the product sheet).
- Keep the user's wording style in UI copy: plain, short, active ("Send a notice about this").
- Ask before committing, pushing or releasing.
