# Weekly Schedule

Plan and review your week inside Obsidian.

The plugin adds a weekly board: three days per row, three rows (3 + 3 + 1), and
four priority cells per day based on importance and urgency. Each cell holds a
task list and an **添加一个待办事项** button.

The design is deliberately flat: hierarchy comes from thin rules, spacing and a
muted colour per priority — no shadows and no nested card borders. Each day
shows its date and how many tasks are still open. Hovering a task reveals its
reorder and delete controls.

## Using the board

Open it from the ribbon calendar icon, the **Open weekly board** command, or
**Settings → Weekly Schedule → Open board**.

- **添加一个待办事项** appends an empty task and puts the cursor in it. Type and
  press `Enter` to commit, or `Esc` to discard. A task left empty is never
  written to the file.
- Click a checkbox to mark a task done. Tasks completed while **隐藏已完成** is
  active stay in the file and reappear when completed tasks are shown again.
- Hover a task for its `↑` `↓` and delete controls; right-click it for the same
  actions as a menu.
- The toolbar moves between weeks, returns to **本周**, toggles completed tasks,
  and opens the week's Markdown file.

## Jumping to a week

Stepping with `‹` `›` is fine for a week or two, but not for reaching a distant
one. **Open year overview** (`weekly-schedule:open-year-overview`) shows the whole
year: one tile per ISO week, 13 per row, each with its week number, date range and
completion rate.

- Select a tile to open that week in the board.
- `←` `→` `↑` `↓` move between tiles, `Enter` opens the selected one.
- `‹` `›` in that view change the ISO year, so weeks on either side of new year
  stay with the year they belong to.
- A tile with an accent border is the week the board is showing; the one with an
  accent week number is the current week. Completed weeks carry the accent bar,
  weeks still to come stay neutral, and empty weeks show a dash.
- The column count follows the pane: 13 across a wide pane, fewer in a narrow
  one, so the date range on a tile is never clipped.

The year view is a separate pane, so it can sit beside the board and stay open
while you work.

## How tasks are stored

One Markdown file per week, in the folder set in settings (default
`weekly-schedule/`), named after its ISO week:

```
weekly-schedule/2026-W12.md
```

```markdown
# 2026-W12

## 周一

### 重要 · 紧急
- [ ] 交周报
- [x] 修线上 bug

### 不重要 · 不紧急
- [ ] 整理书签
```

Cells without tasks are omitted, so the file stays short. Standard checkbox
syntax means these tasks are ordinary Markdown: they are searchable, work with
task-oriented plugins, and can be edited by hand.

Editing the file outside the board works too — the board reloads when the file
changes on disk. Save the file and the board follows. When the board itself has
an edit that has not been written yet, the board's version wins and is written
out, so typing in the board is never discarded.

## Layout

```
src/
  main.ts                 # Lifecycle, view registration, commands, vault events
  settings.ts             # Settings interface, defaults, settings tab
  store.ts                # Reading/writing weekly files, caching, debounced saves
  markdown.ts             # Markdown <-> board conversion
  constants.ts            # View type, quadrants, days, defaults
  types.ts                # Data model
  ui/
    weekly-schedule-view.ts       # The board view
    weekly-schedule-year-view.ts  # Year overview, one tile per ISO week
    inline-editor.ts              # Inline plain-text editing for task rows
  utils/
    date.ts               # Week arithmetic and file naming
    helpers.ts            # Small shared helpers
```

## Development

Requires Node.js 18+ (LTS recommended). `minAppVersion` is 1.13.0, because the
settings tab uses Obsidian's declarative settings API so the options appear in
settings search.

```bash
npm install        # install dependencies
npm run dev        # rebuild main.js on every change (watch mode)
npm run build      # type check + production build
npm run lint       # ESLint with Obsidian-specific rules
```

After changing code, reload Obsidian (or use a hot-reload plugin) and confirm the plugin is enabled in **Settings → Community plugins**.

## Installing into a vault

Copy `main.js`, `manifest.json`, and `styles.css` into:

```
<Vault>/.obsidian/plugins/weekly-schedule/
```

Then enable **Weekly Schedule** in **Settings → Community plugins**. For local development you can also symlink this repository folder to that path.

## Releasing

1. Bump `version` in `manifest.json` (SemVer) — or run `npm version patch|minor|major`.
2. Add the matching entry to `versions.json` (`"<plugin-version>": "<min-app-version>"`).
3. Create a GitHub release whose tag exactly matches the manifest version (no leading `v`).
4. Attach `main.js`, `manifest.json`, and `styles.css` as release assets.

## Before publishing

- Fill in `author` (and optionally `authorUrl`, `fundingUrl`) in `manifest.json`.
- Add a `LICENSE` file with the license you intend to ship.
- Confirm `id` in `manifest.json` matches the plugin folder name used for local development; never change it after release.
- Review the [developer policies](https://docs.obsidian.md/Developer+policies) and [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines).

## API documentation

See https://docs.obsidian.md
