import type {
	BuiltInSlot,
	Day,
	DayId,
	Quadrant,
	QuadrantId,
	ReviewSectionId,
	Slot,
	WeekReview,
} from './types';
import type { Locale } from './i18n';

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
 * How often the calendar date is re-checked. A pane left open for days would
 * otherwise keep drawing the day it was opened on as today, and no event tells
 * the plugin that midnight passed. Only a date comparison happens per check, so
 * this bounds how long a stale highlight can survive rather than what it costs.
 */
export const DAY_POLL_MS = 30000;

/**
 * The cells the plugin ships with, in the order the board first drew them:
 * urgent first, important first within each urgency band.
 *
 * This is the fixed point the whole feature is built on. A cell's *default*
 * wording is derived from these two flags and the language of the file being
 * written (see `slotHeading`), and every heading any version of this plugin has
 * ever written resolves through one of these ids — so the table can be added to
 * but the four entries in it can never change. Setting a name on a cell, or
 * removing one, is the user's business; what `重要 · 紧急` means is not.
 *
 * The tones are `0..3` and match the order, which is what keeps the board the
 * colours it has always been after the layout becomes configurable.
 */
export const BUILT_IN_SLOTS: readonly BuiltInSlot[] = [
	{ id: 'q1', tone: 0, important: true, urgent: true },
	{ id: 'q2', tone: 1, important: false, urgent: true },
	{ id: 'q3', tone: 2, important: true, urgent: false },
	{ id: 'q4', tone: 3, important: false, urgent: false },
];

/** The seven columns of the board, in order. */
export const DAY_IDS: readonly DayId[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/**
 * The layout every vault starts with: the four built-in cells, none renamed.
 *
 * A cell's name is `null` rather than the wording it shows, and that is the
 * point: a name is a fact about this vault and is written to the file, while
 * `重要 · 紧急` is the plugin's own wording for one of its own quadrants and is
 * derived afresh, in the language of the file it goes into, every time. A vault
 * that never renames a cell therefore reads and writes the bytes it always did.
 */
export const DEFAULT_SLOTS: readonly Slot[] = BUILT_IN_SLOTS.map((slot) => ({
	id: slot.id,
	name: null,
	tone: slot.tone,
}));

/** How many cells a layout may hold, and how long one of their names may be. */
export const SLOT_LIMITS = { min: 1, max: 8, nameMax: 24 } as const;

/** Colours a cell can be drawn in; see the `--ws-tone*` palette in styles.css. */
export const TONE_COUNT = 8;

/**
 * Headings this plugin wrote before it was translated, accepted for ever so an
 * existing vault is read unchanged. Each keeps its language, so such a file
 * goes on being written the way it already was.
 *
 * These are already in the form `normalizeHeading` produces — lower case here,
 * spaces where the separators were — and `check:slots` asserts it, because
 * `slotHeading`/`buildSlotLayout` key the table by the normalized wording.
 */
export const LEGACY_QUADRANT_HEADINGS: readonly (readonly [string, QuadrantId, Locale])[] = [
	['important and urgent', 'q1', 'en'],
	['urgent and important', 'q1', 'en'],
	['not important but urgent', 'q2', 'en'],
	['urgent but not important', 'q2', 'en'],
	['important but not urgent', 'q3', 'en'],
	['not urgent but important', 'q3', 'en'],
	['not important and not urgent', 'q4', 'en'],
	['not urgent and not important', 'q4', 'en'],
	['重要 紧急', 'q1', 'zh'],
	['不重要 紧急', 'q2', 'zh'],
	['重要 不紧急', 'q3', 'zh'],
	['不重要 不紧急', 'q4', 'zh'],
];

export function isDayId(value: string): value is DayId {
	return DAY_IDS.some((day) => day === value);
}

export function createQuadrant(slot: { id: QuadrantId }): Quadrant {
	return { id: slot.id, tasks: [] };
}

/**
 * A week with nothing in it, with one cell per entry of `slots`.
 *
 * Built from the layout rather than from a fixed four, so the board, the reader
 * and the writer all agree on which cells a day has — a week read from a file
 * that mentions a cell the layout no longer has still gets that cell's work,
 * because reading resolves the heading rather than looking the id up.
 */
export function createEmptyDays(slots: readonly Slot[] = DEFAULT_SLOTS): Day[] {
	return DAY_IDS.map((id) => ({
		id,
		quadrants: slots.map(createQuadrant),
	}));
}

/**
 * The four review sections, in the order they are written to the file.
 *
 * The order is fixed here rather than taken from the file: a week read back and
 * written out again has to produce the same bytes, whatever order a hand-edited
 * file happened to put the sections in.
 */
export const REVIEW_SECTIONS: readonly ReviewSectionId[] = ['plan', 'do', 'check', 'act'];

export function isReviewSectionId(value: string): value is ReviewSectionId {
	return REVIEW_SECTIONS.some((section) => section === value);
}

/**
 * The letter each review section stands for.
 *
 * The four sections are PDCA, and these are what say so: a panel of four
 * paragraphs headed only `计划 / 执行 / 检查 / 改进` is four notes, while the
 * same four headed `P / D / C / A` are a frame the week is read through.
 * Letters are initials of the same four words in every language, so they are
 * data here and are never translated — only the name beside one is.
 */
export const REVIEW_SECTION_LETTERS: Record<ReviewSectionId, string> = {
	plan: 'P',
	do: 'D',
	check: 'C',
	act: 'A',
};

export function createEmptyReview(): WeekReview {
	return { plan: [], do: [], check: [], act: [] };
}

/**
 * Days the board can start with. Named by day id rather than by label, so the
 * dropdown reads in the user's language.
 */
export const WEEK_START_OPTIONS: readonly { value: number; day: DayId }[] = [
	{ value: 1, day: 'mon' },
	{ value: 0, day: 'sun' },
];
