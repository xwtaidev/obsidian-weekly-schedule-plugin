import { moment } from 'obsidian';
import { en, type TranslationKey, type Translations } from './locales/en';
import { zh } from './locales/zh';
import type { DayId } from '../types';

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

export type { TranslationKey, Translations };
