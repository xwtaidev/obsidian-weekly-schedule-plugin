# Weekly Schedule

Plan and review your week inside Obsidian.

The plugin adds a weekly board: three days per row, three rows (3 + 3 + 1), and
four priority cells per day based on importance and urgency. Each cell holds a
task list and an **添加一个待办事项** button.

The design is deliberately flat: hierarchy comes from thin rules, spacing and a
muted colour per priority — no shadows and no nested card borders. Each day
shows its date and how many tasks are still open. Hovering a task reveals its
reorder and delete controls.

Both views size themselves from the pane they are in rather than from the window,
because an Obsidian pane is often a sidebar or half a split. The board keeps three
days per row and gives up columns on a narrow pane; the year overview fits up to
10 tiles per row the same way.

## Using the board

Open it from the ribbon calendar icon, the **Open weekly board** command, or
**Settings → Weekly Schedule → Open board**. The year overview has its own ribbon
icon (a date range), a button in the board's toolbar, a settings button, and the
**Open year overview** command.

- **添加一个待办事项** appends an empty task and puts the cursor in it. Type and
  press `Enter` to commit, or `Esc` to discard. A task left empty is never
  written to the file.
- Click a checkbox to mark a task done. Tasks completed while **隐藏已完成** is
  active stay in the file and reappear when completed tasks are shown again.
- Hover a task for its `↑` `↓` and delete controls; right-click it for the same
  actions as a menu.
- The toolbar moves between weeks, returns to **本周**, toggles completed tasks,
  and opens the week's Markdown file.

### Files written before year folders

Files used to sit directly in the schedule folder (`weekly-schedule/2026-W12.md`).
The plugin still *reads* them from there, so an existing vault does not look empty
after updating. To move them into year folders, run the **Move week files into
year folders** command. It only touches files in the schedule folder whose names
look like `YYYY-Www.md`, so notes you keep there are left alone, and it reports
what it moved.

## Jumping to a week

Stepping with `‹` `›` is fine for a week or two, but not for reaching a distant
one. **Open year overview** (`weekly-schedule:open-year-overview`) shows the whole
year: one tile per ISO week, 13 per row, each with its week number, date range and
completion rate.

- Select a tile to open that week in the board.
- `←` `→` `↑` `↓` move between tiles, `Enter` opens the selected one.
- `‹` `›` in that view change the ISO year, so weeks on either side of new year
  stay with the year they belong to.
- Fill depth shows the completion rate, in six steps. Finished weeks are filled;
  weeks still to come are not, since they have no completion to show, and weeks
  with no tasks show a dash. A tile with an accent border is the week the board
  is showing; an accent week number marks the current week.
- The column count follows the pane: 10 across a wide pane and fewer in a narrow
  one, but never below 5, so the date range on a tile is never clipped and a year
  never turns into a long scroll.

The year view is a separate pane, so it can sit beside the board and stay open
while you work.

## How tasks are stored

One Markdown file per week, in the folder set in settings (default
`weekly-schedule/`), grouped into a folder per ISO year:

```
weekly-schedule/
  2025/
    2025-W52.md
  2026/
    2026-W01.md
    2026-W12.md
```

Grouping by year keeps a growing archive navigable by hand. The year folder is the
week's **ISO** year, not its calendar year, so the week of 2025-12-29 — which is
week 1 of 2026 — lives in `2026/`, matching how the year overview presents it.

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

```bash
npm run build
npm run deploy -- "<Vault>"
```

`deploy` copies `main.js`, `manifest.json` and `styles.css` into
`<Vault>/.obsidian/plugins/<plugin-id>/` and then verifies every copied file byte
for byte, and that the stylesheet still carries the current design's markers. A
half-finished copy is a real failure mode here: an old `styles.css` next to a new
`main.js` renders the previous design with no error anywhere.

Then enable **Weekly Schedule** in **Settings → Community plugins**, and reload
the plugin (disable and re-enable it, or restart Obsidian) after any change —
Obsidian reads `main.js` only when a plugin loads.

## Releasing

1. Bump `version` in `manifest.json` (SemVer) — or run `npm version patch|minor|major`.
2. Add the matching entry to `versions.json` (`"<plugin-version>": "<min-app-version>"`).
3. Create a GitHub release whose tag exactly matches the manifest version (no leading `v`).
4. Attach `main.js`, `manifest.json`, and `styles.css` as release assets.

## Releasing

The repository already carries the standard workflows, so publishing a version is
tag-driven:

```bash
# 1. Bump the version. This rewrites manifest.json and versions.json for you.
npm version 0.1.1 --no-git-tag-version
git add manifest.json versions.json package.json
git commit -m "release: 0.1.1"

# 2. Tag with the exact manifest version, no leading "v".
git tag 0.1.1
git push origin main --follow-tags
```

Pushing the tag runs `.github/workflows/release.yml`, which builds the plugin and
creates a **draft** release with `main.js`, `manifest.json` and `styles.css`
attached. Review the draft, then publish it — the tag and `manifest.json`'s
`version` must match exactly, and `versions.json` must map that version to
`minAppVersion`.

## Getting listed in the community catalog

The plugin is installable by URL before this step; the catalog is what makes it
searchable inside Obsidian.

1. Release at least one version (above) and confirm the three release assets exist.
2. Confirm `id`, `name`, `description` and `author` in `manifest.json` are what you
   want shown publicly — the catalog entry is built from them, plus `repo`.
3. Open a pull request against
   [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
   that adds one entry to `community-plugins.json`, keeping the array's existing
   ordering convention:
   ```json
   {
       "id": "weekly-schedule",
       "name": "Weekly Schedule",
       "author": "xwtaidev",
       "description": "Plan and review your week inside Obsidian.",
       "repo": "xwtaidev/obsidian-weekly-schedule-plugin"
   }
   ```
4. Keep `id` stable forever: it is the key Obsidian uses to update installed
   plugins. Changing it later breaks every existing installation.

### Before submitting

- `LICENSE` and a `README.md` are present (both are required).
- No network calls, no telemetry — this plugin reads and writes only its own files
  in the vault.
- `minAppVersion` is honest. It is currently `1.13.0` because the settings tab uses
  the declarative settings API and the views use APIs added in 1.5.7.
- Install it into a **clean vault** from the built files and check that enabling,
  disabling and reloading the plugin leave nothing broken.
- Review the [developer policies](https://docs.obsidian.md/Developer+policies) and
  [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines).
- Keep `description` short: the catalog shows a truncated line, so lead with what
  the plugin does.

## API documentation

See https://docs.obsidian.md
