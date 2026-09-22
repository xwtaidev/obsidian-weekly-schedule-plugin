import { t, getLocale, type Locale } from './index';
import { isoWeekNumber, isoYearOfWeek } from '../utils/date';
import type { Moment } from '../utils/date';

/**
 * Locale-aware date wording.
 *
 * Dates are formatted with `Intl` rather than with a date pattern of our own:
 * the pattern that reads naturally differs per language (`3月16日` against
 * `Mar 16`), and the runtime already knows how each language writes a date.
 * Formats are cached per locale, because the year overview formats two dates for
 * each of its fifty-odd tiles.
 */
const INTL_LOCALES: Record<Locale, string> = {
	en: 'en',
	zh: 'zh-CN',
};

/** A month and a day, spelled the way the language spells it: `3月16日`, `Mar 16`. */
const MONTH_DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
/** A numeric month and day for a compact range: `3/16`, `16.3.`. */
const NUMERIC_MONTH_DAY: Intl.DateTimeFormatOptions = { month: 'numeric', day: 'numeric' };

/** Range separator, used by both the board label and the year tiles. */
const RANGE_DASH = ' – ';

const formatters = new Map<
	Intl.DateTimeFormatOptions,
	Partial<Record<Locale, Intl.DateTimeFormat>>
>();

function formatDate(date: Moment, options: Intl.DateTimeFormatOptions): string {
	const locale = getLocale();
	let byLocale = formatters.get(options);
	if (!byLocale) {
		byLocale = {};
		formatters.set(options, byLocale);
	}
	let formatter = byLocale[locale];
	if (!formatter) {
		formatter = new Intl.DateTimeFormat(INTL_LOCALES[locale], options);
		byLocale[locale] = formatter;
	}
	return formatter.format(date.toDate());
}

/**
 * Heading of the board toolbar, e.g. `Week 12 of 2026 · Mar 16 – Mar 22`.
 *
 * The year comes from the week's own ISO year rather than from the calendar year
 * of its Monday, which is what keeps the week of 29 December 2025 labelled as
 * week 1 of 2026.
 */
export function formatWeekLabel(date: Moment): string {
	const monday = date.clone().startOf('isoWeek');
	const sunday = monday.clone().add(6, 'days');
	const range = `${formatDate(monday, MONTH_DAY)}${RANGE_DASH}${formatDate(sunday, MONTH_DAY)}`;
	return t('board.weekLabel', {
		week: isoWeekNumber(monday),
		year: isoYearOfWeek(monday),
		range,
	});
}

/** Compact one-week range for a year tile, e.g. `3/16 – 3/22`. */
export function formatWeekRange(start: Moment): string {
	const end = start.clone().add(6, 'days');
	return `${formatDate(start, NUMERIC_MONTH_DAY)}${RANGE_DASH}${formatDate(end, NUMERIC_MONTH_DAY)}`;
}
