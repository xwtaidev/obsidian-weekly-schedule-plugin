import { moment } from 'obsidian';
import { en, type TranslationKey, type Translations } from './locales/en';
import { zh } from './locales/zh';
import type { DayId, ReviewSectionId } from '../types';

/**
 * Locales the plugin ships. Anything else falls back: a regional variant falls
 * back to its base language (a `zh-TW` reader is better served by Simplified
 * Chinese than by English) and an unsupported language falls back to English.
 */
export const SUPPORTED_LOCALES = ['en', 'zh'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

const DEFAULT_LOCALE: Locale = 'en';

const DICTIONARIES: Record<Locale, Translations> = { en, zh };

/** Keys are strings that carry no language, so they are mapped, not translated. */
const DAY_KEYS: Record<DayId, TranslationKey> = {
	mon: 'day.mon',
	tue: 'day.tue',
	wed: 'day.wed',
	thu: 'day.thu',
	fri: 'day.fri',
	sat: 'day.sat',
	sun: 'day.sun',
};

/**
 * Reads the interface language out of Obsidian.
 *
 * Moment's locale is the app's own: Obsidian sets it from the language picked in
 * **Settings → General**, and the plugin's `minAppVersion` predates the
 * `getLanguage()` accessor that Obsidian added in 1.8.7.
 */
function detectAppLocale(): string {
	const fromMoment = moment.locale();
	if (typeof fromMoment === 'string' && fromMoment.length > 0) {
		return fromMoment;
	}
	// Nothing has set a locale yet, which is the state before the app finishes
	// starting. English is then the answer, and the next check corrects it.
	return DEFAULT_LOCALE;
}

function resolveLocale(language: string): Locale {
	const normalized = language.trim().toLowerCase().replace(/_/g, '-');
	const exact = SUPPORTED_LOCALES.find((locale) => locale === normalized);
	if (exact !== undefined) {
		return exact;
	}
	const base = normalized.split('-')[0] ?? '';
	return SUPPORTED_LOCALES.find((locale) => locale === base) ?? DEFAULT_LOCALE;
}

/**
 * Content locale, i.e. the language labels and dates are written in. Resolved on
 * first use rather than at module load, so nothing depends on how early the
 * plugin is imported.
 */
let currentLocale: Locale | null = null;

/** Bumped on every adopted language change, so callers can tell stale from current. */
let revision = 0;

export function getLocale(): Locale {
	currentLocale ??= resolveLocale(detectAppLocale());
	return currentLocale;
}

/**
 * Re-reads the interface language and adopts it. Returns true only when the
 * content locale actually changed, so callers can re-render on a real switch and
 * do nothing otherwise.
 */
export function syncLocale(): boolean {
	const next = resolveLocale(detectAppLocale());
	const changed = currentLocale !== null && currentLocale !== next;
	currentLocale = next;
	if (changed) {
		revision += 1;
	}
	return changed;
}

/**
 * How many times the language has been adopted. Anything that draws a language
 * of its own — Obsidian draws command names, ribbon tooltips and pane titles —
 * compares this against the revision it last drew with, which stays correct no
 * matter which caller noticed the change first.
 */
export function getLocaleRevision(): number {
	return revision;
}

export type TranslationParams = Record<string, string | number>;

function fill(template: string, params?: TranslationParams): string {
	if (!params) {
		return template;
	}
	return template.replace(/\{(\w+)\}/g, (match, name: string) => {
		const value = params[name];
		return value === undefined ? match : String(value);
	});
}

function template(key: TranslationKey, locale: Locale): string {
	return DICTIONARIES[locale][key] ?? en[key] ?? key;
}

/** Translates `key` into the current interface language. */
export function t(key: TranslationKey, params?: TranslationParams): string {
	return fill(template(key, getLocale()), params);
}

/**
 * The unfilled template of a key in a given language, `{name}` placeholders and
 * all.
 *
 * For the rare string that is not simply handed to a reader: the carry-over mark
 * is written into a week's file, so its two halves are needed to recognize it
 * again, and the wording has to come from the same place as every other string.
 */
export function templateFor(key: TranslationKey, locale: Locale = getLocale()): string {
	return template(key, locale);
}

/**
 * Translates a key with a count, choosing the singular form before the `|` and
 * the plural one after it. Languages without a plural distinction simply use one
 * string for both.
 */
export function tp(key: TranslationKey, count: number, params?: TranslationParams): string {
	const [one, other] = template(key, getLocale()).split('|');
	const form = count === 1 ? (one ?? '') : (other ?? one ?? '');
	return fill(form, { ...params, count });
}

/** Name of a day column, e.g. `Monday` or `周一`. */
export function dayLabel(id: DayId, locale: Locale = getLocale()): string {
	return template(DAY_KEYS[id], locale);
}

/**
 * The importance and urgency wording of a quadrant, as shown in a cell header.
 * The flags come from the quadrant definitions, so every locale's wording and
 * the board's ordering stay in step.
 */
export function quadrantParts(
	important: boolean,
	urgent: boolean,
	locale: Locale = getLocale(),
): [string, string] {
	return [
		template(important ? 'quadrant.important' : 'quadrant.unimportant', locale),
		template(urgent ? 'quadrant.urgent' : 'quadrant.notUrgent', locale),
	];
}

/** Separator between the importance and urgency parts, e.g. `重要 · 紧急`. */
export const QUADRANT_SEPARATOR = ' · ';

/** Review sections are named by id, so their wording is mapped, not stored. */
const REVIEW_KEYS: Record<ReviewSectionId, TranslationKey> = {
	plan: 'review.plan',
	do: 'review.do',
	check: 'review.check',
	act: 'review.act',
};

/**
 * Heading of one review section, e.g. `Plan` or `计划`.
 *
 * This is the heading a week is written under and read back by, which is why it
 * is the one name for a step that can never be reworded: the serializer looks
 * for it, in the file's own language. What the panel prints is `reviewStepName`.
 */
export function reviewSectionLabel(
	id: ReviewSectionId,
	locale: Locale = getLocale(),
): string {
	return template(REVIEW_KEYS[id], locale);
}

/**
 * The four questions PDCA asks of a week, so they are mapped rather than one
 * string repeated.
 *
 * What a section asks is what an empty one is entered from: the question is the
 * label of the row that adds its first item, and the hint on every item after
 * it. A section is four fifths of what a first review is written from, and a
 * question is the only thing telling a writer what belongs there.
 */
const REVIEW_QUESTION_KEYS: Record<ReviewSectionId, TranslationKey> = {
	plan: 'board.reviewQuestion.plan',
	do: 'board.reviewQuestion.do',
	check: 'board.reviewQuestion.check',
	act: 'board.reviewQuestion.act',
};

/**
 * What a review section asks for, e.g. `What you set out to do`.
 *
 * Board wording rather than file wording, so it follows the interface language
 * and is never written to a week.
 */
export function reviewQuestion(
	id: ReviewSectionId,
	locale: Locale = getLocale(),
): string {
	return template(REVIEW_QUESTION_KEYS[id], locale);
}

/**
 * What the panel calls each step — the file's word for it, and in a language
 * that has translated that word away, the word the letter stands for.
 *
 * Two names for one step rather than one, because they answer two questions.
 * `reviewSectionLabel` says what a week's file is written under and is
 * untouchable; this one is what a reader is shown, and a reader shown only
 * `计划` beside a `P` has no way to reach the frame the panel is built around.
 * Board wording, so saying it costs no file anything.
 */
const REVIEW_STEP_KEYS: Record<ReviewSectionId, TranslationKey> = {
	plan: 'board.reviewStep.plan',
	do: 'board.reviewStep.do',
	check: 'board.reviewStep.check',
	act: 'board.reviewStep.act',
};

/** Name of one step of the frame, e.g. `计划（Plan）` or `Plan`. */
export function reviewStepName(
	id: ReviewSectionId,
	locale: Locale = getLocale(),
): string {
	return template(REVIEW_STEP_KEYS[id], locale);
}

/** Heading a week's review is written under, e.g. `Review` or `复盘`. */
export function reviewTitle(locale: Locale = getLocale()): string {
	return template('review.title', locale);
}

export type { TranslationKey, Translations };
