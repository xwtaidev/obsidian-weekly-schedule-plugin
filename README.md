# Weekly Schedule

Plan and review your week inside Obsidian.

> Status: freshly initialized project. The plugin currently only wires up its lifecycle and an empty settings tab — features are yet to be built.

## Layout

```
src/
  main.ts       # Plugin entry point: lifecycle only (onload, settings loading)
  settings.ts   # Settings interface, defaults, and the settings tab
```

`src/main.ts` stays small on purpose: add features as separate modules under `src/` (for example `src/commands/`, `src/ui/`, `src/utils/`) and register them from `onload`.

## Development

Requires Node.js 18+ (LTS recommended).

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
