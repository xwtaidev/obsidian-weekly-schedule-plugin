import { moment } from 'obsidian';
import { clamp, normalizeFolder } from './helpers';

/**
 * Moment instance type, derived from Obsidian's own runtime export: the API
 * bundles moment without shipping standalone type declarations.
 */
export type Moment = ReturnType<typeof moment>;

export const DATE_FORMAT = 'YYYY-MM-DD';

export function startOfWeek(date: Moment, weekStartsOn: number): Moment {
	const offset = (date.day() - clamp(weekStartsOn, 0, 6) + 7) % 7;
	return date.clone().subtract(offset, 'days').startOf('day');
}

export function shiftWeek(date: Moment, weeks: number): Moment {
	return date.clone().add(weeks * 7, 'days').startOf('day');
}

export function dateKey(date: Moment): string {
	return date.format(DATE_FORMAT);
}

export function isSameDay(a: Moment, b: Moment): boolean {
	return dateKey(a) === dateKey(b);
}

/** ISO-8601 week number, always derived from the Monday of the week. */
export function isoWeekNumber(date: Moment): number {
	const thursday = date.clone().startOf('isoWeek').add(3, 'days');
	const dayOfYear = thursday.diff(thursday.clone().startOf('year'), 'days') + 1;
	return Math.ceil(dayOfYear / 7);
}

/**
 * The Monday starting the ISO week that contains `date`. Deriving the week from
 * its own Monday (rather than pairing a calendar year with a week number) is
 * what keeps weeks around new year attributed to the correct ISO year.
 */
function weekStartOf(date: Moment): Moment {
	return isoWeekStart(isoYearOf(date), isoWeekNumber(date));
}

/**
 * The ISO year a week belongs to, taken from its Monday. 2025-12-29 is week 1 of
 * ISO year 2026, so this is deliberately not the calendar year of that Monday.
 */
export function isoYearOfWeek(monday: Moment): number {
	return isoWeekStart(isoYearOf(monday), isoWeekNumber(monday)).add(3, 'days').year();
}

/** The ISO year the given date's week belongs to: the year of that week's Monday. */
export function isoYearOf(date: Moment): number {
	// The Thursday of the week decides which year that week belongs to.
	const thursday = date.clone().add(3 - ((date.day() + 6) % 7), 'days');
	return thursday.year();
}

/**
 * Stable file-name stem for a week, e.g. `2026-W12`. Normalised through the
 * week's Monday, so every date inside one week maps to the same file — including
 * the days either side of new year.
 */
export function weekKey(date: Moment): string {
	const monday = weekStartOf(date);
	return `${isoYearOfWeek(monday)}-W${String(isoWeekNumber(monday)).padStart(2, '0')}`;
}

/**
 * Vault path of the file holding a week, grouped by ISO year:
 * `weekly-schedule/2026/2026-W12.md`. A year folder keeps a growing archive
 * navigable, and matches the year shown in the year overview.
 */
export function weekFilePath(folder: string, date: Moment): string {
	const directory = normalizeFolder(folder);
	const key = weekKey(date);
	const year = isoYearOfWeek(weekStartOf(date));
	const fileName = `${key}.md`;
	return directory.length > 0 ? `${directory}/${year}/${fileName}` : `${year}/${fileName}`;
}

/**
 * Where a week's file lived before year folders were introduced:
 * `weekly-schedule/2026-W12.md`. Only used to find files that have not been
 * migrated yet, so an existing vault keeps working.
 */
export function legacyWeekFilePath(folder: string, date: Moment): string {
	const directory = normalizeFolder(folder);
	const fileName = `${weekKey(date)}.md`;
	return directory.length > 0 ? `${directory}/${fileName}` : fileName;
}

/**
 * Parses a `YYYY-Www` file stem into the ISO year and week number.
 *
 * The week may be one or two digits: the plugin always writes two, but accepting
 * one means a hand-renamed `2026-W3.md` is still recognised on migration instead
 * of being quietly left behind in the old layout.
 */
export function parseWeekFileStem(stem: string): { isoYear: number; week: number } | null {
	const match = /^(\d{4})-W(\d{1,2})$/.exec(stem);
	if (!match) {
		return null;
	}
	const week = Number(match[2]);
	if (week < 1 || week > 53) {
		return null;
	}
	return { isoYear: Number(match[1]), week };
}

/** The canonical file name for an ISO year and week, e.g. `2026-W03.md`. */
export function weekFileName(isoYear: number, week: number): string {
	return `${isoYear}-W${String(week).padStart(2, '0')}.md`;
}

export function folderOf(path: string): string {
	const index = path.lastIndexOf('/');
	return index === -1 ? '' : path.slice(0, index);
}

/** Days of the week in configured order (Monday first by default). */
export function weekDays(date: Moment, weekStartsOn: number): Moment[] {
	const first = startOfWeek(date, weekStartsOn);
	return Array.from({ length: 7 }, (_, index) => first.clone().add(index, 'days'));
}

const DAY_MS = 86400000;

const toUtc = (date: Moment): number =>
	Date.UTC(date.year(), date.month(), date.date());

const fromUtc = (ms: number): Moment => {
	const date = new Date(ms);
	return moment([date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()]);
};

/**
 * Monday of a given ISO week, found by the textbook definition rather than
 * moment's locale machinery: 4 January is always in week 1, and the Thursday of
 * a week decides which year that week belongs to.
 */
export function isoWeekStart(isoYear: number, isoWeek: number): Moment {
	const jan4 = Date.UTC(isoYear, 0, 4);
	// getUTCDay(): Sunday is 0, so shift to make Monday the first day.
	const offsetToMonday = (new Date(jan4).getUTCDay() + 6) % 7;
	const week1Monday = jan4 - offsetToMonday * DAY_MS;
	return fromUtc(week1Monday + (isoWeek - 1) * 7 * DAY_MS);
}

/**
 * 52 or 53: a year has 53 ISO weeks exactly when its own week 53 starts seven
 * days before week 1 of the next year.
 */
export function isoWeeksInYear(isoYear: number): number {
	const week53Monday = toUtc(isoWeekStart(isoYear, 53));
	const nextYearMonday = toUtc(isoWeekStart(isoYear + 1, 1));
	return week53Monday + 7 * DAY_MS === nextYearMonday ? 53 : 52;
}

/** Every ISO week of a year, in order, for the year overview. */
export function isoWeeksOfYear(isoYear: number): { week: number; start: Moment }[] {
	const total = isoWeeksInYear(isoYear);
	return Array.from({ length: total }, (_, index) => ({
		week: index + 1,
		start: isoWeekStart(isoYear, index + 1),
	}));
}
