import { DAY_IDS, QUADRANT_IDS, QUADRANTS, createEmptyDays, isDayId } from './constants';
import {
	QUADRANT_SEPARATOR,
	SUPPORTED_LOCALES,
	dayLabel,
	getLocale,
	quadrantParts,
} from './i18n';
import { createTaskId } from './utils/helpers';
import type { Locale } from './i18n';
import type { Day, DayId, QuadrantId, Task, WeekSchedule } from './types';

/** `## 周一` / `## Monday` */
const DAY_HEADING = /^##\s+(.+?)\s*$/;
/** `### 重要 · 紧急` / `### Important · urgent` */
const QUADRANT_HEADING = /^###\s+(.+?)\s*$/;
/** `- [ ] 写周报` / `* [x] 写周报` / `1. [ ] 写周报` */
const TASK_LINE = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s?(.*)$/;

/** A heading matched to its id, and the language it was written in. */
interface HeadingMatch<Id> {
	id: Id;
	locale: Locale | null;
}

/** The heading a day or quadrant is written with, in one language. */
function quadrantHeading(id: QuadrantId, locale: Locale): string {
	const definition = QUADRANTS.find((item) => item.id === id);
	if (!definition) {
		return id;
	}
	return quadrantParts(definition.important, definition.urgent, locale).join(QUADRANT_SEPARATOR);
}

/**
 * Headings recognized when reading a file back, in every language, so a file
 * keeps parsing whichever language it was written in — including after the user
 * switches the interface language. Parsing stays heading based, so a hand-edited
 * file keeps working no matter which wording it uses.
 */
const DAY_HEADINGS = new Map<string, HeadingMatch<DayId>>();
const QUADRANT_HEADINGS = new Map<string, HeadingMatch<QuadrantId>>();

for (const locale of SUPPORTED_LOCALES) {
	for (const id of DAY_IDS) {
		DAY_HEADINGS.set(normalizeHeading(dayLabel(id, locale)), { id, locale });
	}
	for (const id of QUADRANT_IDS) {
		QUADRANT_HEADINGS.set(normalizeHeading(quadrantHeading(id, locale)), { id, locale });
	}
}

/**
 * Wordings this plugin used before it was translated, still accepted so an
 * existing vault is read unchanged. Each keeps its language, so such a file goes
 * on being written the way it already was.
 */
const LEGACY_QUADRANT_HEADINGS: readonly (readonly [string, QuadrantId, Locale])[] = [
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

for (const [heading, id, locale] of LEGACY_QUADRANT_HEADINGS) {
	if (!QUADRANT_HEADINGS.has(heading)) {
		QUADRANT_HEADINGS.set(heading, { id, locale });
	}
}

function normalizeHeading(text: string): string {
	return text
		.replace(/[*_`]/g, '')
		.replace(/[·・•]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function createTask(text: string, done: boolean): Task {
	return { id: createTaskId(), text, done };
}

/**
 * Parses a board file. Anything that is not a recognized day/quadrant heading
 * or a checkbox line (frontmatter, comments, prose) is ignored, and an
 * unrecognized `###` heading closes the current quadrant instead of guessing.
 *
 * `fallbackLocale` is the language a file with no recognizable heading is taken
 * to be written in; the caller passes the interface language.
 */
export function parseSchedule(
	content: string,
	weekStart: string,
	path: string,
	fallbackLocale: Locale = getLocale(),
): WeekSchedule {
	const days = createEmptyDays();
	const byId = new Map<DayId, Day>();
	for (const day of days) {
		byId.set(day.id, day);
	}

	let currentDay: Day | null = null;
	let currentQuadrant: QuadrantId | null = null;
	/** Language the file is written in, taken from the first heading that names one. */
	let fileLocale: Locale | null = null;

	for (const rawLine of content.split(/\r?\n/)) {
		const dayMatch = DAY_HEADING.exec(rawLine);
		if (dayMatch) {
			const label = normalizeHeading(dayMatch[1] ?? '');
			// A bare id (`## mon`) names no language, so it leaves the file locale alone.
			const match = DAY_HEADINGS.get(label) ?? (isDayId(label) ? { id: label, locale: null } : null);
			currentDay = match ? (byId.get(match.id) ?? null) : null;
			currentQuadrant = null;
			fileLocale ??= match?.locale ?? null;
			continue;
		}

		const quadrantMatch = QUADRANT_HEADING.exec(rawLine);
		if (quadrantMatch) {
			const label = normalizeHeading(quadrantMatch[1] ?? '');
			const known = QUADRANT_HEADINGS.get(label);
			currentQuadrant = currentDay ? (known?.id ?? mappingFallback(label)) : null;
			fileLocale ??= known?.locale ?? null;
			continue;
		}

		if (!currentDay || !currentQuadrant) {
			continue;
		}

		const taskMatch = TASK_LINE.exec(rawLine);
		if (taskMatch) {
			const quadrant = currentDay.quadrants.find((item) => item.id === currentQuadrant);
			quadrant?.tasks.push(createTask((taskMatch[2] ?? '').trim(), taskMatch[1] !== ' '));
		}
	}

	return { weekStart, path, days, locale: fileLocale ?? fallbackLocale };
}

/**
 * Handles generic word-order combinations such as "紧急 · 重要" or "urgent but
 * unimportant", which a hand-edited file may use instead of the exact wording.
 */
function mappingFallback(label: string): QuadrantId | null {
	if (label.includes('重要') || label.includes('紧急')) {
		// `不重要` contains `重要`, and `不紧急` contains `紧急`, so the negated
		// forms are tested first.
		return fromFlags({
			important: label.includes('重要') && !label.includes('不重要'),
			unimportant: label.includes('不重要'),
			urgent: label.includes('紧急') && !label.includes('不紧急'),
			notUrgent: label.includes('不紧急'),
		});
	}

	const unimportant = label.includes('not important') || label.includes('unimportant');
	return fromFlags({
		important: !unimportant && label.includes('important'),
		unimportant,
		urgent: !label.includes('not urgent') && label.includes('urgent'),
		notUrgent: label.includes('not urgent'),
	});
}

function fromFlags(flags: {
	important: boolean;
	unimportant: boolean;
	urgent: boolean;
	notUrgent: boolean;
}): QuadrantId | null {
	if (flags.important && flags.urgent) return 'q1';
	if (flags.unimportant && flags.urgent) return 'q2';
	if (flags.important && flags.notUrgent) return 'q3';
	if (flags.unimportant && flags.notUrgent) return 'q4';
	return null;
}

/**
 * Writes a board file, with the headings in the language the schedule was loaded
 * with, so saving an edit never translates a file the user already had.
 */
export function serializeSchedule(schedule: WeekSchedule): string {
	const lines: string[] = [`# ${schedule.path.split('/').pop()?.replace(/\.md$/, '') ?? ''}`];

	for (const day of schedule.days) {
		const populated = day.quadrants.filter((quadrant) => quadrant.tasks.length > 0);
		if (populated.length === 0) {
			continue;
		}

		lines.push('', `## ${dayLabel(day.id, schedule.locale)}`);
		for (const quadrant of populated) {
			lines.push('', `### ${quadrantHeading(quadrant.id, schedule.locale)}`);
			for (const task of quadrant.tasks) {
				const text = task.text.trim();
				if (text.length === 0) {
					continue;
				}
				lines.push(`- [${task.done ? 'x' : ' '}] ${text}`);
			}
		}
	}

	lines.push('');
	return lines.join('\n');
}
