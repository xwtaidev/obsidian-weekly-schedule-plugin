import type { Day, DayId, Quadrant, QuadrantDefinition, QuadrantId } from './types';

export const VIEW_TYPE_WEEKLY_SCHEDULE = 'weekly-schedule-view';

/** Year-at-a-glance view: one tile per ISO week. */
export const VIEW_TYPE_WEEKLY_SCHEDULE_YEAR = 'weekly-schedule-year-view';

/** Folder (vault-relative) that schedule files are written to by default. */
export const DEFAULT_FOLDER = 'weekly-schedule';

/** Debounce applied before a modified board is written back to disk. */
export const SAVE_DEBOUNCE_MS = 500;

/**
 * Eisenhower quadrants, ordered exactly as they appear in the board:
 * urgent first, important first within each urgency band.
 */
export const QUADRANTS: readonly QuadrantDefinition[] = [
	{ id: 'q1', label: '重要 · 紧急', important: true, urgent: true },
	{ id: 'q2', label: '不重要 · 紧急', important: false, urgent: true },
	{ id: 'q3', label: '重要 · 不紧急', important: true, urgent: false },
	{ id: 'q4', label: '不重要 · 不紧急', important: false, urgent: false },
];

export const DAYS: readonly { id: DayId; label: string }[] = [
	{ id: 'mon', label: '周一' },
	{ id: 'tue', label: '周二' },
	{ id: 'wed', label: '周三' },
	{ id: 'thu', label: '周四' },
	{ id: 'fri', label: '周五' },
	{ id: 'sat', label: '周六' },
	{ id: 'sun', label: '周日' },
];

export function isQuadrantId(value: string): value is QuadrantId {
	return QUADRANTS.some((quadrant) => quadrant.id === value);
}

export function isDayId(value: string): value is DayId {
	return DAYS.some((day) => day.id === value);
}

export function createQuadrant(definition: QuadrantDefinition): Quadrant {
	return { id: definition.id, label: definition.label, tasks: [] };
}

export function createEmptyDays(): Day[] {
	return DAYS.map((day) => ({
		id: day.id,
		label: day.label,
		quadrants: QUADRANTS.map(createQuadrant),
	}));
}

/** Groups the board headings for a weekday option in the settings tab. */
export const WEEK_START_OPTIONS: readonly { value: number; label: string }[] = [
	{ value: 1, label: '周一' },
	{ value: 0, label: '周日' },
];
