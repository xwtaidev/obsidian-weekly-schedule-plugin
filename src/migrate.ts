import { Notice, TFile, TFolder, normalizePath } from 'obsidian';
import { t, tp } from './i18n';
import { parseSchedule, rewriteSlotHeadings } from './markdown';
import { folderOf, parseWeekFileStem, weekFileName } from './utils/date';
import { normalizeFolder } from './utils/helpers';
import type { Vault } from 'obsidian';
import type { SlotLayout } from './slots';

export interface WeekMigration {
	from: string;
	to: string;
}

/**
 * Weeks whose files sit directly in the schedule folder rather than in a year
 * folder. Only files named like `2026-W12.md` are considered, and only in that
 * folder — anything else the user keeps there is left alone.
 */
export function planYearFolders(vault: Vault, folderSetting: string): WeekMigration[] {
	const folder = normalizeFolder(folderSetting);
	const directory = folder.length > 0 ? vault.getAbstractFileByPath(normalizePath(folder)) : vault.getRoot();
	if (!(directory instanceof TFolder)) {
		return [];
	}

	const moves: WeekMigration[] = [];
	for (const child of directory.children) {
		if (!(child instanceof TFile) || child.extension !== 'md') {
			continue;
		}
		const parsed = parseWeekFileStem(child.basename);
		if (parsed === null) {
			continue;
		}
		// Name the destination canonically, so a one-digit week is normalised as
		// it moves rather than staying as the user typed it.
		const name = weekFileName(parsed.isoYear, parsed.week);
		const to = `${folder.length > 0 ? `${folder}/` : ''}${parsed.isoYear}/${name}`;
		moves.push({ from: child.path, to });
	}

	return moves.sort((a, b) => a.from.localeCompare(b.from));
}

/**
 * Moves each planned week into its year folder, creating the folder when needed.
 * Returns the moves that succeeded and the ones that failed.
 */
export async function applyYearFolders(
	vault: Vault,
	moves: WeekMigration[],
): Promise<{ moved: WeekMigration[]; failed: WeekMigration[] }> {
	const moved: WeekMigration[] = [];
	const failed: WeekMigration[] = [];

	for (const move of moves) {
		const file = vault.getFileByPath(move.from);
		if (!(file instanceof TFile)) {
			failed.push(move);
			continue;
		}
		try {
			const yearFolder = folderOf(move.to);
			if (yearFolder.length > 0 && vault.getAbstractFileByPath(yearFolder) === null) {
				await vault.createFolder(yearFolder);
			}
			await vault.rename(file, move.to);
			moved.push(move);
		} catch (error) {
			console.error(`Weekly schedule: could not move ${move.from}`, error);
			failed.push(move);
		}
	}

	return { moved, failed };
}

export function describeYearFolderMove(moves: WeekMigration[], applied: boolean): string {
	if (moves.length === 0) {
		return t('migrate.alreadyGrouped');
	}
	const years = [...new Set(moves.map((move) => folderOf(move.to).split('/').pop() ?? ''))].sort();
	return tp(applied ? 'migrate.movedFiles' : 'migrate.pendingFiles', moves.length, {
		years: years.join(t('list.separator')),
	});
}

export function notifyYearFolderResult(moved: number, failed: number): void {
	if (failed === 0) {
		new Notice(tp('migrate.result', moved));
		return;
	}
	new Notice(t('migrate.resultPartial', { moved, failed }));
}

/** One week whose cell headings are not the ones the layout writes today. */
export interface SlotAlignment {
	/** Vault path of the week. */
	path: string;
	/** How many of its headings would change. */
	changed: number;
}

/**
 * The week a file holds, as the layout reader wants it.
 *
 * Nothing needs it. What the reader is being asked for is the *language* the
 * headings are written in, and that is worked out from the headings themselves,
 * so the week is left blank rather than parsed a second time out of the path.
 */
const WEEK_NOT_NEEDED = '';

/**
 * A week's file with its cell headings brought up to date.
 *
 * The language to write in is the one the file is already written in, taken from
 * the reader rather than decided again here — the same answer the board gets
 * when it saves the week, so an alignment cannot translate a vault.
 */
function alignedWeek(
	content: string,
	path: string,
	layout: SlotLayout,
): { text: string; changed: number } {
	const { locale } = parseSchedule(content, WEEK_NOT_NEEDED, path, layout);
	return rewriteSlotHeadings(content, layout, locale);
}

/**
 * Every week file the schedule folder holds.
 *
 * Weeks sit either in the folder itself or one year folder down, so anything
 * deeper is not one of ours; and with no folder configured the same rule applies
 * from the vault root. A file named like a week outside that is the user's own,
 * and rewriting it would be the plugin editing a note it was never asked about.
 */
function weekFilesIn(vault: Vault, folderSetting: string): TFile[] {
	const folder = normalizeFolder(folderSetting);
	const prefix = folder.length > 0 ? `${folder}/` : '';
	const files: TFile[] = [];

	for (const file of vault.getFiles()) {
		if (file.extension !== 'md' || parseWeekFileStem(file.basename) === null) {
			continue;
		}
		if (!file.path.startsWith(prefix)) {
			continue;
		}
		if (file.path.slice(prefix.length).split('/').length > 2) {
			continue;
		}
		files.push(file);
	}

	return files.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * The weeks whose cell headings the layout would write differently.
 *
 * Found by reading each file and working out its new text in memory, which is
 * also what applying the plan does — so a week in here is a week that changes,
 * and `changed` is how much of it will. A vault that is already aligned comes
 * back empty, which is what makes running this twice harmless.
 */
export async function planSlotAlignment(
	vault: Vault,
	folderSetting: string,
	layout: SlotLayout,
): Promise<SlotAlignment[]> {
	const plan: SlotAlignment[] = [];

	for (const file of weekFilesIn(vault, folderSetting)) {
		const content = await vault.cachedRead(file);
		const { changed } = alignedWeek(content, file.path, layout);
		if (changed > 0) {
			plan.push({ path: file.path, changed });
		}
	}

	return plan;
}

/**
 * Rewrites the planned weeks, one at a time. Returns how many weeks changed and
 * how many could not be written; a week that cannot be written is reported and
 * the rest go on, because stopping half way leaves the vault half aligned and no
 * better off than before.
 *
 * Each file is read and written in one step, so a week edited between planning
 * and applying is aligned as it now is rather than as it was.
 */
export async function applySlotAlignment(
	vault: Vault,
	plan: readonly SlotAlignment[],
	layout: SlotLayout,
): Promise<{ files: number; failed: number }> {
	let files = 0;
	let failed = 0;

	for (const entry of plan) {
		const file = vault.getFileByPath(entry.path);
		if (!(file instanceof TFile)) {
			failed += 1;
			continue;
		}
		try {
			let changed = 0;
			await vault.process(file, (content) => {
				const aligned = alignedWeek(content, file.path, layout);
				changed = aligned.changed;
				return aligned.text;
			});
			if (changed > 0) {
				files += 1;
			}
		} catch (error) {
			console.error(`Weekly schedule: could not align ${entry.path}`, error);
			failed += 1;
		}
	}

	return { files, failed };
}

export function describeSlotAlignment(plan: readonly SlotAlignment[]): string {
	if (plan.length === 0) {
		return t('migrate.slots.none');
	}
	return tp('migrate.slots.pending', plan.length);
}

export function notifySlotAlignmentResult(files: number, failed: number): void {
	if (failed === 0) {
		new Notice(tp('migrate.slots.changed', files));
		return;
	}
	new Notice(t('migrate.slots.partial', { files, failed }));
}
