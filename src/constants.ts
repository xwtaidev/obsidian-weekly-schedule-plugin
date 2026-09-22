import type { Day, DayId, Quadrant, QuadrantDefinition, QuadrantId } from './types';

export const VIEW_TYPE_WEEKLY_SCHEDULE = 'weekly-schedule-view';

/** Year-at-a-glance view: one tile per ISO week. */
export const VIEW_TYPE_WEEKLY_SCHEDULE_YEAR = 'weekly-schedule-year-view';

/** Folder (vault-relative) that schedule files are written to by default. */
export const DEFAULT_FOLDER = 'weekly-schedule';

/** Debounce applied before a modified board is written back to disk. */
export const SAVE_DEBOUNCE_MS = 500;

/**
 * How often the interface language is re-checked. Obsidian applies a language
 * change in place, without reloading the app and without an event a plugin can
 * listen to, so the plugin notices by looking.
 */
export const LOCALE_POLL_MS = 2000;

/**
 * Eisenhower quadrants, ordered exactly as they appear in the board:
 * urgent first, important first within each urgency band.
 *
 * Wording lives in the locales (`quadrant.important` and friends) and is derived
 * from these flags, so the board and the file headings cannot drift apart.
 */
export const QUADRANTS: readonly QuadrantDefinition[] = [
	{ id: 'q1', important: true, urgent: true },
	{ id: 'q2', important: false, urgent: true },
	{ id: 'q3', important: true, urgent: false },
	{ id: 'q4', important: false, urgent: false },
];

/** The seven columns of the board, in order. */
export const DAY_IDS: readonly DayId[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Quadrant ids in board order, for building the heading tables. */
export const QUADRANT_IDS: readonly QuadrantId[] = QUADRANTS.map((quadrant) => quadrant.id);

export function isQuadrantId(value: string): value is QuadrantId {
	return QUADRANTS.some((quadrant) => quadrant.id === value);
}

export function isDayId(value: string): value is DayId {
	return DAY_IDS.some((day) => day === value);
}

export function createQuadrant(definition: QuadrantDefinition): Quadrant {
	return { id: definition.id, tasks: [] };
}

export function createEmptyDays(): Day[] {
	return DAY_IDS.map((id) => ({
		id,
		quadrants: QUADRANTS.map(createQuadrant),
	}));
}

/**
 * Days the board can start with. Named by day id rather than by label, so the
 * dropdown reads in the user's language.
 */
export const WEEK_START_OPTIONS: readonly { value: number; day: DayId }[] = [
	{ value: 1, day: 'mon' },
	{ value: 0, day: 'sun' },
];
