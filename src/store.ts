import { TFile, TFolder } from 'obsidian';
import { SAVE_DEBOUNCE_MS } from './constants';
import { folderOf, parseWeekFileStem } from './utils/date';
import { hasReviewText, hasTaskText, parseSchedule, serializeSchedule } from './markdown';
import { debounce } from './utils/helpers';
import type { Vault } from 'obsidian';
import type { SlotLayout } from './slots';
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
	/** Serialized state at the last read or write, independent of file formatting. */
	baseline: string;
	/** Neither the current path nor its legacy fallback existed when read. */
	missing: boolean;
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
				// A row being typed into is not work: the totals are counted from
				// what the week would hold, and an empty task is never written.
				if (!hasTaskText(task)) {
					continue;
				}
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
 * Whether a week holds anything worth a file of its own.
 *
 * A week with no task and no line of review serializes to its own title and
 * nothing else, and a file holding one line is not a week anybody wrote: it is
 * the shape `serializeSchedule` gives an empty week. Writing one is what turns
 * a *path* into a folder, so it is asked before a file is created — see
 * `persist`.
 */
function hasWeekContent(schedule: WeekSchedule): boolean {
	const hasTask = schedule.days.some((day) =>
		day.quadrants.some((quadrant) => quadrant.tasks.some(hasTaskText)),
	);
	return hasTask || hasReviewText(schedule.review);
}

/**
 * Loads and persists one board per week, backed by a Markdown file in the vault.
 *
 * Writes are debounced and tracked, so the resulting `modify` events are not
 * mistaken for outside edits, and a write that fails leaves the schedule in
 * memory untouched so the next change retries it.
 *
 * The layout is asked for rather than kept: the settings tab can change which
 * cells a day has while a week is loaded, and every read and every write has to
 * be made with the layout in force at that moment. A snapshot taken at
 * construction would go on reading and writing a layout the user has left.
 */
export class ScheduleStore {
	private readonly cache = new Map<string, CacheEntry>();
	/**
	 * Boards holding an edit that has not been written yet.
	 *
	 * Kept apart from the cache because the two answer different questions: the
	 * cache is what this store has read, and this is what a board is showing.
	 * They fall out of step whenever the store is emptied while a pane is open —
	 * a change of cells empties it by design, and a vault event for the week can
	 * drop it as well — and a write that read only the cache would then find
	 * nothing to write and say it was done. The board would go on showing work
	 * no file holds, which is the one failure a week cannot recover from.
	 */
	private readonly pendingSchedules = new Map<string, WeekSchedule>();
	private readonly pendingWrites = new Set<string>();
	private readonly write = debounce((path: string) => {
		void this.persist(path);
	}, SAVE_DEBOUNCE_MS);

	constructor(
		private readonly vault: Vault,
		private readonly layout: () => SlotLayout,
	) {}

	async load(weekStart: string, path: string): Promise<WeekSchedule> {
		const cached = this.cache.get(path);
		if (cached && cached.schedule.weekStart === weekStart) {
			return cached.schedule;
		}

		const missing = !this.hasSourceFile(path);
		const content = await this.read(path);
		const schedule = parseSchedule(content, weekStart, path, this.layout());
		this.cache.set(path, { schedule, raw: content, baseline: serializeSchedule(schedule, this.layout()), missing });
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

	/**
	 * Queues a debounced write of a schedule that is already in memory.
	 *
	 * The schedule is handed over with the edit rather than looked up when the
	 * timer fires, because by then it may no longer be in the cache: what is
	 * written has to be what the board shows, whatever this store still keeps.
	 */
	markDirty(path: string, schedule: WeekSchedule): void {
		this.pendingSchedules.set(path, schedule);
		this.write(path);
	}

	/**
	 * Whether the in-memory board differs from the file on disk, i.e. an edit
	 * that has not been flushed yet. Used to avoid clobbering a pending edit
	 * with an external change.
	 */
	hasLocalEdits(path: string): boolean {
		const entry = this.cache.get(path);
		if (entry === undefined) {
			// Nothing cached, but a board is holding an edit: it counts as an
			// unsaved change whether or not this store can compare it to disk.
			return this.pendingSchedules.has(path);
		}
		if (entry.missing && !hasWeekContent(entry.schedule)) {
			return false;
		}
		return serializeSchedule(entry.schedule, this.layout()) !== entry.raw;
	}

	/**
	 * Writes immediately, e.g. before switching weeks or unloading. Reports
	 * whether the file now holds what memory holds, so a caller whose change is
	 * worth announcing — or worth taking back — can tell the difference.
	 */
	async flush(path: string): Promise<boolean> {
		return this.persist(path);
	}

	async flushAll(): Promise<void> {
		const paths = new Set([...this.cache.keys(), ...this.pendingSchedules.keys()]);
		await Promise.all([...paths].map((path) => this.persist(path)));
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

		const schedule = parseSchedule(content, entry.schedule.weekStart, path, this.layout());
		this.cache.set(path, {
			schedule,
			raw: content,
			baseline: serializeSchedule(schedule, this.layout()),
			missing: !this.hasSourceFile(path),
		});
		return true;
	}

	/** Drops cached state after flushing pending writes. */
	async invalidate(): Promise<void> {
		await this.flushAll();
		this.cache.clear();
		this.pendingSchedules.clear();
	}

	forget(path: string): void {
		this.cache.delete(path);
		// A board's unsaved edit goes with it: the caller is saying the week is
		// to be read again, and a write left over from before would put the
		// discarded version back on disk.
		this.pendingSchedules.delete(path);
	}

	/** Flushes pending writes; called when the plugin unloads. */
	dispose(): void {
		void this.flushAll();
	}

	private hasSourceFile(path: string): boolean {
		const legacy = legacyPathFor(path);
		return this.vault.getFileByPath(path) instanceof TFile ||
			(legacy !== null && this.vault.getFileByPath(legacy) instanceof TFile);
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

	private async persist(path: string): Promise<boolean> {
		const entry = this.cache.get(path);
		// An edit a board handed over is newer than anything cached, and may be
		// the only copy this store has.
		const schedule = this.pendingSchedules.get(path) ?? entry?.schedule;
		if (schedule === undefined) {
			return true;
		}

		const content = serializeSchedule(schedule, this.layout());
		const existing = this.vault.getFileByPath(path);
		// A file moved or deleted since it was read should not be recreated by a
		// flush of an unchanged board. An actual local edit still needs saving.
		if (!(existing instanceof TFile) && entry && content === entry.baseline) {
			this.pendingSchedules.delete(path);
			return true;
		}

		// Nothing to do when the file is already exactly what we would write.
		if (entry !== undefined && content === entry.raw && existing instanceof TFile) {
			this.pendingSchedules.delete(path);
			return true;
		}

		// A week read from neither path and still empty needs no file. Keep it
		// untouched even if an external file arrived since the read: the create
		// event will reload that file instead. A week read from either path must
		// still be written when emptied, including the legacy fallback.
		if (!hasWeekContent(schedule) && (entry?.missing ?? !this.hasSourceFile(path))) {
			this.pendingSchedules.delete(path);
			return true;
		}

		this.pendingWrites.add(path);
		try {
			await this.writeFile(path, content);
			// Re-seated rather than patched: a write can come from a board whose
			// week was dropped from the cache, and after writing it this store
			// knows that week again — exactly as written.
			this.cache.set(path, { schedule, raw: content, baseline: content, missing: false });
			this.pendingSchedules.delete(path);
			return true;
		} catch (error) {
			console.error(`Weekly schedule: could not write ${path}`, error);
			// The schedule stays in memory, so the next edit retries the write.
			return false;
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
