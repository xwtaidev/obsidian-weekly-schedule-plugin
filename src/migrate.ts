import { Notice, TFile, TFolder, normalizePath } from 'obsidian';
import { t, tp } from './i18n';
import { folderOf, parseWeekFileStem, weekFileName } from './utils/date';
import { normalizeFolder } from './utils/helpers';
import type { Vault } from 'obsidian';

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
