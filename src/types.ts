
/** The four Eisenhower priority quadrants, in display order (top to bottom). */
export type QuadrantId = 'q1' | 'q2' | 'q3' | 'q4';

/** One of the seven columns of the board. */
export type DayId = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface QuadrantDefinition {
	id: QuadrantId;
	/** Chinese label shown in the cell header, e.g. "重要 · 紧急". */
	label: string;
	important: boolean;
	urgent: boolean;
}

export interface Quadrant {
	id: QuadrantId;
	label: string;
	tasks: Task[];
}

export interface Day {
	id: DayId;
	label: string;
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
}
