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

/** Stable file-name stem for a week, e.g. `2026-W12`. */
export function weekKey(date: Moment): string {
	const monday = date.clone().startOf('isoWeek');
	return `${monday.format('GGGG')}-W${String(isoWeekNumber(monday)).padStart(2, '0')}`;
}

export function weekFilePath(folder: string, date: Moment): string {
	const directory = normalizeFolder(folder);
	const fileName = `${weekKey(date)}.md`;
	return directory.length > 0 ? `${directory}/${fileName}` : fileName;
}

export function folderOf(path: string): string {
	const index = path.lastIndexOf('/');
	return index === -1 ? '' : path.slice(0, index);
}

export function formatWeekLabel(date: Moment): string {
	const monday = date.clone().startOf('isoWeek');
	const sunday = monday.clone().add(6, 'days');
	const range = `${monday.format('M月D日')} – ${sunday.format('M月D日')}`;
	return `${monday.format('YYYY')} 年第 ${isoWeekNumber(monday)} 周 · ${range}`;
}

/** Days of the week in configured order (Monday first by default). */
export function weekDays(date: Moment, weekStartsOn: number): Moment[] {
	const first = startOfWeek(date, weekStartsOn);
	return Array.from({ length: 7 }, (_, index) => first.clone().add(index, 'days'));
}
