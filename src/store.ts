import { TFile, TFolder } from 'obsidian';
import { SAVE_DEBOUNCE_MS } from './constants';
import { folderOf, parseWeekFileStem } from './utils/date';
import { parseSchedule, serializeSchedule } from './markdown';
import { debounce } from './utils/helpers';
import type { Vault } from 'obsidian';
import type { WeekSchedule } from './types';

/**
 * The pre-year-folder location of a week's file, derived from its current path:
 * `weekly-schedule/2026/2026-W12.md` -> `weekly-schedule/2026-W12.md`.
 *
 * Deriving it keeps the store's API unchanged: callers only ever deal with the
 * canonical path, and the fallback is an implementation detail of reading.
 */
function legacyPathFor(path: string): string | null {
	const slash = path.lastIndexOf('/');
	const fileName = path.slice(slash + 1);
	const stem = fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName;
	const parsed = parseWeekFileStem(stem);
	if (parsed === null) {
		return null;
	}
	const folder = folderOf(path);
	if (folder.length === 0) {
		return fileName;
	}
	// The year folder is the innermost one; drop exactly that one segment.
	const parentSlash = folder.lastIndexOf('/');
	const outer = parentSlash === -1 ? '' : folder.slice(0, parentSlash);
	return outer.length > 0 ? `${outer}/${fileName}` : fileName;
}

interface CacheEntry {
	schedule: WeekSchedule;
	/** Markdown as last read from or written to disk, used for change detection. */
	raw: string;
}

export interface WeekStats {
	total: number;
	done: number;
	/** Rounded percentage of completed tasks, or null when the week is empty. */
	percent: number | null;
}

export function countTasks(schedule: WeekSchedule): WeekStats {
	let total = 0;
	let done = 0;
	for (const day of schedule.days) {
		for (const quadrant of day.quadrants) {
			for (const task of quadrant.tasks) {
				total += 1;
				if (task.done) {
					done += 1;
				}
			}
		}
	}
	return {
		total,
		done,
		percent: total === 0 ? null : Math.round((done / total) * 100),
	};
}

/**
 * Loads and persists one board per week, backed by a Markdown file in the vault.
 *
 * Writes are debounced and tracked, so the resulting `modify` events are not
 * mistaken for outside edits, and a write that fails leaves the schedule in
 * memory untouched so the next change retries it.
 */
export class ScheduleStore {
	private readonly cache = new Map<string, CacheEntry>();
	private readonly pendingWrites = new Set<string>();
	private readonly write = debounce((path: string) => {
		void this.persist(path);
	}, SAVE_DEBOUNCE_MS);

	constructor(private readonly vault: Vault) {}

	async load(weekStart: string, path: string): Promise<WeekSchedule> {
		const cached = this.cache.get(path);
		if (cached && cached.schedule.weekStart === weekStart) {
			return cached.schedule;
		}

		const content = await this.read(path);
		const schedule = parseSchedule(content, weekStart, path);
		this.cache.set(path, { schedule, raw: content });
		return schedule;
	}

	/**
	 * Task counts for one week, for the year overview.
	 *
	 * Reuses the loaded board when one is open, and otherwise reads only this
	 * week's file — a week with no file is reported as empty without any read,
	 * so a year of tiles costs as many reads as there are weeks actually used.
	 */
	async loadWeekStats(weekStart: string, path: string): Promise<WeekStats> {
		const schedule = await this.load(weekStart, path);
		return countTasks(schedule);
	}

	/** Queues a debounced write of a schedule that is already in memory. */
	markDirty(path: string): void {
		this.write(path);
	}

	/**
	 * Whether the in-memory board differs from the file on disk, i.e. an edit
	 * that has not been flushed yet. Used to avoid clobbering a pending edit
	 * with an external change.
	 */
	hasLocalEdits(path: string): boolean {
		const entry = this.cache.get(path);
		return entry !== undefined && serializeSchedule(entry.schedule) !== entry.raw;
	}

	/** Writes immediately, e.g. before switching weeks or unloading. */
	async flush(path: string): Promise<void> {
		await this.persist(path);
	}

	async flushAll(): Promise<void> {
		await Promise.all([...this.cache.keys()].map((path) => this.persist(path)));
	}

	/**
	 * Re-reads a file that changed on disk. Returns true when the board should be
	 * re-rendered; false when the change was our own write, or the file is not
	 * one this store is tracking.
	 */
	async reloadIfChanged(path: string): Promise<boolean> {
		if (this.pendingWrites.has(path)) {
			return false;
		}

		const entry = this.cache.get(path);
		if (!entry) {
			return false;
		}

		const content = await this.read(path);
		if (content === entry.raw) {
			return false;
		}

		const schedule = parseSchedule(content, entry.schedule.weekStart, path);
		this.cache.set(path, { schedule, raw: content });
		return true;
	}

	/** Drops cached state after flushing pending writes. */
	async invalidate(): Promise<void> {
		await this.flushAll();
		this.cache.clear();
	}

	forget(path: string): void {
		this.cache.delete(path);
	}

	/** Flushes pending writes; called when the plugin unloads. */
	dispose(): void {
		void this.flushAll();
	}

	private async read(path: string): Promise<string> {
		const file = this.vault.getFileByPath(path);
		if (file instanceof TFile) {
			try {
				return await this.vault.read(file);
			} catch (error) {
				console.error(`Weekly schedule: could not read ${path}`, error);
				return '';
			}
		}

		// A week's file used to live directly in the schedule folder. Read it from
		// there when it has not been migrated, so introducing year folders did not
		// make an existing vault look empty. The first edit writes to the new path.
		const legacy = legacyPathFor(path);
		if (legacy !== null) {
			const old = this.vault.getFileByPath(legacy);
			if (old instanceof TFile) {
				try {
					return await this.vault.read(old);
				} catch (error) {
					console.error(`Weekly schedule: could not read ${legacy}`, error);
				}
			}
		}

		return '';
	}

	private async persist(path: string): Promise<void> {
		const entry = this.cache.get(path);
		if (!entry) {
			return;
		}

		const content = serializeSchedule(entry.schedule);
		const existing = this.vault.getFileByPath(path);

		// Nothing to do when the file is already exactly what we would write.
		if (content === entry.raw && existing instanceof TFile) {
			return;
		}

		this.pendingWrites.add(path);
		try {
			await this.writeFile(path, content);
			entry.raw = content;
		} catch (error) {
			console.error(`Weekly schedule: could not write ${path}`, error);
			// The schedule stays in memory, so the next edit retries the write.
		} finally {
			this.pendingWrites.delete(path);
		}
	}

	private async writeFile(path: string, content: string): Promise<void> {
		const folder = folderOf(path);
		if (folder.length > 0 && !(this.vault.getAbstractFileByPath(folder) instanceof TFolder)) {
			await this.vault.createFolder(folder);
		}

		const existing = this.vault.getFileByPath(path);
		if (existing instanceof TFile) {
			await this.vault.modify(existing, content);
			return;
		}
		await this.vault.create(path, content);
	}
}
