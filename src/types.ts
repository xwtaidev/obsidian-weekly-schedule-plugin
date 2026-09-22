
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
 * A single checkbox line, serialized as `- [ ] text` / `- [x] text`.
 * `Text` is kept verbatim so anything a user types survives a round trip.
 */
export interface Task {
	id: string;
	text: string;
	done: boolean;
}

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
