import { SUPPORTED_LOCALES, templateFor } from './i18n';
import { createTaskId } from './utils/helpers';
import type { Locale } from './i18n';
import type { DayId, Quadrant, QuadrantId, Task, WeekSchedule } from './types';

/**
 * Carrying the unfinished work of one week into the next.
 *
 * Four rules make the result predictable, and everything else follows from them:
 *
 * - a task keeps the day and the priority cell it was planned in, so the shape of
 *   the week survives the move instead of collapsing into one inbox;
 * - nothing is taken out of the week the work came from. It is copied, and the
 *   copy left behind is marked with the week it went to, so a past week stays an
 *   honest record of what was planned then — and of what became of it;
 * - a wording the target cell already holds is not added again, so confirming
 *   twice, or confirming something that was planned ahead, changes nothing;
 * - a mark is never part of a task's words. It is taken off before a task is
 *   compared or copied, so marks neither travel into the next week nor turn one
 *   task into two.
 *
 * Kept free of Obsidian's API on purpose — no vault, no notice, no DOM — so
 * `npm run check:carry` can assert these rules directly.
 */

/** Key in the dictionaries that holds the mark's wording. */
const MARK_KEY = 'carry.mark';

/** Placeholder the mark template names the target week with, e.g. `2026-W40`. */
const MARK_WEEK = '{week}';

/** Week names as the plugin writes them, e.g. `2026-W40`. */
const WEEK_NAME = '\\d{4}-W\\d{2}';

function escapePattern(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One pattern per language, built from that language's mark template: the
 * wording is written once, in the dictionaries, and the pattern that recognizes
 * it is derived from it, so the two cannot drift apart. Every language is
 * matched rather than the current one — a week file keeps the language it was
 * written in, so a mark in either tongue has to be read back.
 */
const MARK_PATTERNS: readonly RegExp[] = SUPPORTED_LOCALES.map((locale: Locale) => {
	const template = templateFor(MARK_KEY, locale);
	const at = template.indexOf(MARK_WEEK);
	const prefix = template.slice(0, at);
	const suffix = template.slice(at + MARK_WEEK.length);
	return new RegExp(`${escapePattern(prefix)}(${WEEK_NAME})${escapePattern(suffix)}$`);
});

/** A week named by a mark at the very end of `text`, or null. */
function trailingMark(text: string): { week: string; start: number } | null {
	for (const pattern of MARK_PATTERNS) {
		const match = pattern.exec(text);
		const week = match?.[1];
		if (match && week !== undefined) {
			return { week, start: match.index };
		}
	}
	return null;
}

export interface MarkedText {
	/** What the task says, with every carry mark taken off the end. */
	text: string;
	/** Week of the latest carry marked on the task, or null when it carries none. */
	carriedTo: string | null;
}

/**
 * Splits a task into its words and the carry marks on it.
 *
 * Marks are stripped in a loop rather than once, so a task marked by hand twice
 * over — or by an older wording of the mark — still reads as one task.
 */
export function readMarkedText(raw: string): MarkedText {
	let text = raw;
	let carriedTo: string | null = null;

	for (;;) {
		const mark = trailingMark(text);
		if (!mark) {
			return { text, carriedTo };
		}
		// The first mark found is the rightmost one, i.e. the latest carry.
		carriedTo ??= mark.week;
		text = text.slice(0, mark.start).replace(/\s+$/, '');
	}
}

/**
 * The task text as it should read after being carried into `week`: the same
 * words with that week's mark on the end, in `locale`'s wording.
 *
 * An earlier mark is replaced rather than stacked. A task carried into two
 * weeks in turn has one current answer, and a text that grows a clause per
 * carry would drown the task itself.
 */
export function markCarriedTo(raw: string, week: string, locale: Locale): string {
	const text = readMarkedText(raw).text.trim();
	if (text.length === 0) {
		return raw;
	}
	return text + templateFor(MARK_KEY, locale).replace(MARK_WEEK, week);
}

/** One cell of a board, or null for a malformed schedule. */
function cellAt(schedule: WeekSchedule, day: DayId, quadrant: QuadrantId): Quadrant | null {
	const column = schedule.days.find((item) => item.id === day);
	return column?.quadrants.find((item) => item.id === quadrant) ?? null;
}

/** What a task says, marks off and no surrounding space. */
function coreTextOf(task: Task): string {
	return readMarkedText(task.text).text.trim();
}

/** A task the previous week still has to offer. */
export interface CarryOverItem {
	day: DayId;
	quadrant: QuadrantId;
	/** What the task says, with any carry mark taken off. */
	text: string;
	/**
	 * The target cell already holds these same words. Adding them would double
	 * the task rather than plan it, so the dialog says so instead.
	 */
	alreadyThere: boolean;
}

export interface CarryOverPlan {
	/** Unfinished tasks to choose from, in the order the board draws them. */
	items: CarryOverItem[];
	/** Unfinished tasks with no text at all, which no file could hold. */
	blank: number;
}

/**
 * Works out what the previous week still has to offer.
 *
 * A completed task is not offered: it is finished, and carrying it would ask the
 * same question twice. A task with no text is not offered either — the file
 * could not hold it, since the serializer drops blank rows. The same wording
 * twice in one cell is one decision, not two, so only the first is offered.
 *
 * Nothing here decides what actually moves: that is the user's choice, made in
 * the dialog. This only says what the choices are.
 */
export function planCarryOver(source: WeekSchedule, target: WeekSchedule): CarryOverPlan {
	const items: CarryOverItem[] = [];
	let blank = 0;

	for (const day of source.days) {
		for (const quadrant of day.quadrants) {
			const destination = cellAt(target, day.id, quadrant.id);
			const present = new Set((destination?.tasks ?? []).map(coreTextOf));
			const seen = new Set<string>();

			for (const task of quadrant.tasks) {
				if (task.done) {
					continue;
				}

				const text = coreTextOf(task);
				if (text.length === 0) {
					blank += 1;
					continue;
				}
				if (seen.has(text)) {
					continue;
				}

				seen.add(text);
				items.push({
					day: day.id,
					quadrant: quadrant.id,
					text,
					alreadyThere: present.has(text),
				});
			}
		}
	}

	return { items, blank };
}

/**
 * Adds the chosen tasks to the end of their cells in `target`, as unfinished
 * work. Returns how many were actually added.
 *
 * A wording the cell already holds is left alone here as well as in the plan:
 * the dialog can sit open while the week is edited elsewhere, and a carry that
 * doubled a task because the week moved under it would be worse than one that
 * quietly did nothing.
 *
 * Mutating in place matches how the views edit a board — they change `tasks` and
 * then let the store write the week — so nothing has to be reconciled with the
 * schedule the store has cached.
 */
export function applyCarryOver(target: WeekSchedule, chosen: readonly CarryOverItem[]): number {
	let added = 0;

	for (const item of chosen) {
		const cell = cellAt(target, item.day, item.quadrant);
		if (!cell || cell.tasks.some((task) => coreTextOf(task) === item.text)) {
			continue;
		}
		cell.tasks.push({ id: createTaskId(), text: item.text, done: false });
		added += 1;
	}

	return added;
}

/**
 * Marks each chosen task in the week it was carried from, so that week says
 * where the work went.
 *
 * Only the tasks the user confirmed are marked, and a task is found by its own
 * words rather than by its position — the week may have been reordered in the
 * meantime. The mark is written in the language the file is already written in:
 * writing it in the interface language instead would put an English clause
 * inside a Chinese week, and the file's language must not follow the interface.
 */
export function markCarried(
	source: WeekSchedule,
	chosen: readonly CarryOverItem[],
	week: string,
	locale: Locale,
): void {
	for (const item of chosen) {
		const cell = cellAt(source, item.day, item.quadrant);
		const task = cell?.tasks.find(
			(candidate) => !candidate.done && coreTextOf(candidate) === item.text,
		);
		if (!task) {
			continue;
		}
		task.text = markCarriedTo(task.text, week, locale);
	}
}
