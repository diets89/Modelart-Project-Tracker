# Modelart Tracker

A small Windows app for tracking model builds at Modelart. It replaces the hand-updated breakdown spreadsheet: everyone ticks off their own steps and the whole team sees progress live.

- **Projects** contain sections (Base, Structures, ...), groups (Precinct A, ...) and items.
- Each item moves through **steps** (Draw, Mach, Assy, Inst by default). Click a cell to go *not started → started → done*. Right-click marks a step N/A.
- **Status is automatic** from the steps. Hold, Awaiting info, Awaiting material and Awaiting delivery can be set by hand.
- **Templates** give new projects their starting layout.
- **Excel export** gives a sheet in the familiar layout, with the green cells.

No project data lives in this repository. The app reads and writes a shared folder on the network drive, chosen on first run.

## How saving works

Each change is a small operation ("Mia finished Machining on Gate House"). To save it, the app:

1. takes a short lock file next to the project,
2. re-reads the latest project from the network drive,
3. applies just that change,
4. writes a temp file and swaps it in.

Two people editing at the same time therefore never overwrite each other. Locks left behind by a crashed PC are cleared after 10 seconds. That timeout runs on each PC's own clock, because the file server's clock can be far off. Other PCs check for changes every 3 seconds.

Data folder layout: `projects/`, `templates/`, `activity/` (change log), `deleted/` (backups of anything deleted), `people.json`.

## AI agent (MCP)

The app ships an MCP server so an AI assistant (Claude Desktop, Claude Code, or any MCP client) can read projects and, if allowed, tick steps, update items, add items and create projects. Set it up in **Settings > AI agent**: *Connect* adds it to Claude Desktop, or copy the config for other apps.

- It runs the installed exe in Node mode (`ELECTRON_RUN_AS_NODE=1`) with `resources/app.asar/out/main/mcp.js`, so it updates with the app.
- It uses the data folder and name chosen in the app on that PC (override with `--data <folder>` and `--user <name>`).
- It saves through the same lock and merge path as the app. Changes are logged under the PC user's name, marked "via AI".
- **Allow changes** off (or `--read-only`) makes it read only. Nothing can be deleted through it.

Source: `src/mcp/index.ts`.

## Development

```bash
npm install
npm run dev        # run with hot reload
npm test           # unit tests (set MAT_TEST_ROOT to run them on the network drive)
npm run typecheck
```

## Releasing an update

```bash
npm run release -- patch
```

This bumps the version, builds the installer, publishes it to GitHub Releases and pushes the tag. Installed copies download it in the background and offer "Restart to update".

## Importing an old breakdown spreadsheet

```bash
powershell -File scripts/export-xls.ps1 -Xls "path\to\Breakdown.xls" -Out raw.json
node scripts/import-breakdown.mjs raw.json "<data folder>" --template "Template name"
```

The importer maps green cells to steps (Started / Draw comp / Mach start / Mach comp / Ass start / Ass comp / Install), status codes to flags, and names and initials to people from the data folder's `people.json`.
