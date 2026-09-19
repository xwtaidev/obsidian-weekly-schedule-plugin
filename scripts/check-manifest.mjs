#!/usr/bin/env node
/**
 * Checks manifest.json and the repository against the requirements Obsidian's
 * directory enforces. The automated review rejects a submission over these, and a
 * rejection can only be fixed by publishing another release, so they are worth
 * catching before the tag is pushed.
 *
 * Usage: npm run check:manifest
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => JSON.parse(readFileSync(join(ROOT, file), 'utf8'));

const manifest = read('manifest.json');
const versions = read('versions.json');

const failures = [];
const check = (label, passed, detail = '') => {
	console.log(`  ${passed ? 'ok  ' : 'FAIL'}  ${label}${detail ? `   ${detail}` : ''}`);
	if (!passed) failures.push(label);
};

console.log('Submission requirements (manifest.json)');

// The description shows in the directory listing, where "Obsidian" is redundant.
// This is the check the directory rejected a submission over.
check(
	'description does not contain "Obsidian"',
	!/obsidian/i.test(manifest.description),
	`"${manifest.description}"`,
);
check('description is at most 250 characters', manifest.description.length <= 250, `${manifest.description.length}`);
check('description ends with a period', manifest.description.endsWith('.'));
// Em dashes, colons and quotes all count as special characters under the rules.
check('description avoids special characters', !/[—–:;"'’“”]/.test(manifest.description));
check('description has no emoji', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(manifest.description));

check('id is present', typeof manifest.id === 'string' && manifest.id.length > 0, manifest.id);
check('id does not contain "obsidian"', !/obsidian/i.test(manifest.id ?? ''));
check('version is SemVer x.y.z', /^\d+\.\d+\.\d+$/.test(manifest.version), manifest.version);
check('minAppVersion is a version', /^\d+\.\d+\.\d+$/.test(manifest.minAppVersion), manifest.minAppVersion);
check('author is set', typeof manifest.author === 'string' && manifest.author.trim().length > 0, manifest.author);
check('isDesktopOnly is a boolean', typeof manifest.isDesktopOnly === 'boolean');
// The directory rejects fundingUrl unless it points at a donation service.
check('fundingUrl is absent or a URL', manifest.fundingUrl === undefined || typeof manifest.fundingUrl === 'string');

console.log('\nFiles and versions');
check('README.md exists', existsSync(join(ROOT, 'README.md')));
check('LICENSE exists', existsSync(join(ROOT, 'LICENSE')));
check(
	'versions.json maps this version to minAppVersion',
	versions[manifest.version] === manifest.minAppVersion,
	`${manifest.version} -> ${versions[manifest.version]}`,
);
check(
	'package.json version matches manifest',
	read('package.json').version === manifest.version,
);

// The directory reads manifest.json from the default branch, so what is committed
// is what gets reviewed — not what is in the working tree.
console.log('\nRelease artifacts');
for (const file of ['main.js', 'manifest.json', 'styles.css']) {
	check(`${file} present in repository root`, existsSync(join(ROOT, file)));
}

console.log();
if (failures.length > 0) {
	console.log(`${failures.length} check(s) failed. The directory will reject the submission until these are fixed.`);
	process.exit(1);
}
console.log('All submission requirements satisfied.');
