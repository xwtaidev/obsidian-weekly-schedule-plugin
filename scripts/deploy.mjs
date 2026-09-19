#!/usr/bin/env node
/**
 * Copies the built plugin into a vault, then checks that the vault really holds
 * the current files. A stale styles.css in the vault has already caused a bug
 * report once: main.js was current but the stylesheet was not, so the view
 * rendered with the previous design.
 *
 * Usage:
 *   node scripts/deploy.mjs <vault-path> [plugin-folder-name]
 *   npm run deploy -- <vault-path>
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['main.js', 'manifest.json', 'styles.css'];

const vault = process.argv[2];
if (!vault) {
	console.error('Usage: node scripts/deploy.mjs <vault-path> [plugin-folder-name]');
	console.error('Example: node scripts/deploy.mjs ~/Documents/MyVault weekly-schedule');
	process.exit(2);
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const folder = process.argv[3] ?? manifest.id;
const target = join(resolve(vault), '.obsidian', 'plugins', folder);

if (!existsSync(join(resolve(vault), '.obsidian'))) {
	console.error(`Not an Obsidian vault (no .obsidian directory): ${resolve(vault)}`);
	process.exit(1);
}

// Refuse to ship a stale build: main.js is what Obsidian loads.
if (!existsSync(join(ROOT, 'main.js'))) {
	console.error('main.js is missing. Run `npm run build` first.');
	process.exit(1);
}

mkdirSync(target, { recursive: true });

const copied = [];
for (const file of FILES) {
	const source = join(ROOT, file);
	if (!existsSync(source)) {
		console.error(`Missing ${file} — run \`npm run build\` first.`);
		process.exit(1);
	}
	copyFileSync(source, join(target, file));
	copied.push({
		file,
		sourceBytes: statSync(source).size,
		targetBytes: statSync(join(target, file)).size,
	});
}

console.log(`Deployed ${manifest.name} ${manifest.version} to:\n  ${target}\n`);

// Byte-for-byte comparison is the check that actually catches a half-done copy.
let identical = true;
for (const entry of copied) {
	const same = entry.sourceBytes === entry.targetBytes
		&& readFileSync(join(ROOT, entry.file)).equals(readFileSync(join(target, entry.file)));
	if (!same) {
		identical = false;
	}
	console.log(`  ${same ? 'ok  ' : 'DIFF'}  ${entry.file.padEnd(14)} ${entry.targetBytes} bytes`);
}

// The stylesheet must carry the current design's marker, so a stale copy is
// obvious rather than a silent visual regression.
const styles = readFileSync(join(target, 'styles.css'), 'utf8');
const markers = ['--ws-heat-0', 'aspect-ratio'];
const missing = markers.filter((marker) => !styles.includes(marker));
if (missing.length > 0) {
	console.log(`\n  WARNING  styles.css is missing: ${missing.join(', ')}`);
	identical = false;
}

console.log(`\n${identical ? 'All files match the build.' : 'SOME FILES DO NOT MATCH — deployment is incomplete.'}`);
console.log('\nNext: reload Obsidian (disable and re-enable the plugin, or restart the app).');
console.log('Obsidian only reads main.js when the plugin loads.');
