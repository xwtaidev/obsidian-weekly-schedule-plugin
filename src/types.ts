
import type { Locale } from './i18n';

/** The four Eisenhower priority quadrants, in display order (top to bottom). */
export type QuadrantId = 'q1' | 'q2' | 'q3' | 'q4';

/** One of the seven columns of the board. */
export type DayId = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface QuadrantDefinition {
	id: QuadrantId;
	important: boolean;
	urgent: boolean;
}

/**
 * A priority cell of one day. Wording is deliberately not stored: a label is
 * derived from the id and the current language when it is shown or written, so
 * switching languages cannot leave a stale label behind.
 */
export interface Quadrant {
	id: QuadrantId;
	tasks: Task[];
}

export interface Day {
	id: DayId;
	quadrants: Quadrant[];
}

/**
 * One task, serialized as `- [ ] text` / `- [x] text` — or, when its text runs
 * over several lines, as the checkbox line followed by the remaining lines
 * indented under it.
 *
 * `text` holds those lines joined with `\n`, and is normalized on the way in and
 * out (`normalizeTaskText`) rather than kept exactly as typed: a task cannot
 * hold a blank line or a line's own leading space, and dropping them where the
 * text is stored is what keeps the board and the file saying the same thing.
 */
export interface Task {
	id: string;
	text: string;
	done: boolean;
}

/** Which keystroke saves a task's text rather than starting a new line in it. */
export type TaskCommitKey = 'enter' | 'shiftEnter';

/**
 * The four sections of a week's review, in the order they are written to the
 * file: plan, do, check, act.
 *
 * Wording is deliberately not stored, exactly as it is not for a quadrant: a
 * section is recognized by its id, and its heading is derived from the id and
 * the file's language when it is written.
 */
export type ReviewSectionId = 'plan' | 'do' | 'check' | 'act';

/**
 * A week's review: a list of items per section, empty when nothing has been
 * written there.
 *
 * An item is a line, or a few lines run together — the shape a task's text has,
 * and held to the same rule (`normalizeTaskText`), because it is the same thing:
 * one thing to be read on a line of its own. Nothing else is kept. Items are not
 * tasks and are not counted as work, and an item holding nothing is never
 * written: a section holding none of those earns no heading in the file either.
 */
export type WeekReview = Record<ReviewSectionId, string[]>;

export interface WeekSchedule {
	/** Monday of the week, formatted `YYYY-MM-DD`. */
	weekStart: string;
	/** Vault path of the file backing this schedule. */
	path: string;
	days: Day[];
	/**
	 * The week's own review, looked back on once the week is over. Written after
	 * the days, and always present — a week with nothing written holds four empty
	 * sections rather than a missing field.
	 */
	review: WeekReview;
	/**
	 * Language the file's headings are written in, so editing a file keeps the
	 * wording it already uses instead of translating it on every save. A file
	 * with no recognizable heading — a new week, or one written by hand without
	 * them — adopts the interface language at the time it is loaded.
	 */
	locale: Locale;
}
