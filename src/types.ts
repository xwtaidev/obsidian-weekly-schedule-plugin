
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

export interface WeekSchedule {
	/** Monday of the week, formatted `YYYY-MM-DD`. */
	weekStart: string;
	/** Vault path of the file backing this schedule. */
	path: string;
	days: Day[];
	/**
	 * Language the file's headings are written in, so editing a file keeps the
	 * wording it already uses instead of translating it on every save. A file
	 * with no recognizable heading — a new week, or one written by hand without
	 * them — adopts the interface language at the time it is loaded.
	 */
	locale: Locale;
}
