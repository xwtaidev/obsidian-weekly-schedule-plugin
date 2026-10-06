import {
	DAY_IDS,
	QUADRANT_IDS,
	QUADRANTS,
	REVIEW_SECTIONS,
	createEmptyDays,
	createEmptyReview,
	isDayId,
} from './constants';
import {
	QUADRANT_SEPARATOR,
	SUPPORTED_LOCALES,
	dayLabel,
	getLocale,
	quadrantParts,
	reviewSectionLabel,
	reviewTitle,
} from './i18n';
import { createTaskId } from './utils/helpers';
import type { Locale } from './i18n';
import type {
	Day,
	DayId,
	QuadrantId,
	ReviewSectionId,
	Task,
	WeekReview,
	WeekSchedule,
} from './types';

/** `## 周一` / `## Monday` */
const DAY_HEADING = /^##\s+(.+?)\s*$/;
/** `### 重要 · 紧急` / `### Important · urgent` */
const QUADRANT_HEADING = /^###\s+(.+?)\s*$/;
/** `- [ ] 写周报` / `* [x] 写周报` / `1. [ ] 写周报` */
const TASK_LINE = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s?(.*)$/;
/** `- 一句话` / `* 一句话` / `1. 一句话` — an item of a review, with no box. */
const REVIEW_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;

/**
 * What an item of a review is written as, and what a task is written as the
 * other half of: the same bullet, minus the checkbox that would make it work.
 */
const REVIEW_ITEM_PREFIX = '- ';

/**
 * What a line that continues a task or an item is indented by: the width of the
 * `- ` the line above it hangs off, so the continuation sits under the text it
 * belongs to rather than under the box. No markup is involved — a continuation
 * line is the plain text of what it continues, only indented.
 */
const CONTINUATION = '  ';

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

/**
 * The heading a week's review is written under, and its four sections, again in
 * every language so a file goes on parsing after the interface language changed.
 *
 * The review's heading is a top-level one, exactly like a day's, so it is looked
 * up first — the day branch has already matched the line by the time this is
 * needed. A section name means nothing outside the review, which is what keeps
 * `### Check` under a day closing the cell rather than opening a section.
 */
const REVIEW_TITLES = new Map<string, Locale>();
const REVIEW_HEADINGS = new Map<string, HeadingMatch<ReviewSectionId>>();

for (const locale of SUPPORTED_LOCALES) {
	REVIEW_TITLES.set(normalizeHeading(reviewTitle(locale)), locale);
	for (const id of REVIEW_SECTIONS) {
		REVIEW_HEADINGS.set(normalizeHeading(reviewSectionLabel(id, locale)), { id, locale });
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
 * A task's text as the file and the board both hold it: one line per line, with
 * no line blank and none carrying space of its own.
 *
 * A task may run over several lines, and each but the first is written as an
 * indented line under the checkbox. Two things cannot survive that trip and are
 * dropped here rather than written out and lost on the next read: a blank line,
 * which would end the task, and a line's own leading space, which would grow by
 * an indent every time the week was saved. Trimming each line is what keeps a
 * round trip through the file truthful.
 */
export function normalizeTaskText(text: string): string {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.join('\n');
}

/**
 * Whether one item of a review holds anything yet.
 *
 * The item's counterpart to `hasTaskText`, and deliberately the same rule: a
 * line of a review is written the way a line of work is, so both are held to
 * `normalizeTaskText`. An item holding nothing is one being typed into — the
 * line the add row turns into — so it is never written to the file, and a
 * section holding only those earns no heading.
 */
function hasItemText(item: string): boolean {
	return normalizeTaskText(item).length > 0;
}

/**
 * Whether a task holds anything yet.
 *
 * A task with no text is a row being typed into rather than a piece of work: it
 * is never written to the file, and it is not one of the week's tasks either, so
 * the counts leave it out. Otherwise the totals would climb by one the moment
 * Enter opened the next task, and a cell would write a heading with nothing
 * under it.
 */
export function hasTaskText(task: Task): boolean {
	return normalizeTaskText(task.text).length > 0;
}

/**
 * Whether a week's review holds anything.
 *
 * The review's counterpart to `hasTaskText`, asked for the same reason: a week
 * that nobody wrote a review for has to be written out exactly as it was read,
 * and the panel has to know whether it has anything to show. Empty means empty
 * by the rule above, so an item holding nothing but spaces does not count.
 */
export function hasReviewText(review: WeekReview): boolean {
	return REVIEW_SECTIONS.some((id) => review[id].some(hasItemText));
}

/**
 * Parses a board file. Anything that is not a recognized day/quadrant heading,
 * a review heading, or a checkbox line (frontmatter, comments, prose) is
 * ignored, and an unrecognized `###` heading closes the current quadrant instead
 * of guessing.
 *
 * An indented line under a task belongs to that task: it is how a task that runs
 * over several lines is written back out (see `serializeSchedule`). A blank line
 * or a line back at the margin ends the task above it, which leaves the meaning
 * a hand-edited file has in Markdown itself.
 *
 * The week's review is read by the same rules as a day, because it is written by
 * them: a bullet is an item, an indented line continues the one above it, and a
 * line at the margin is an item of its own — a section typed out by hand, one
 * thought to a line, reads as the items the board would have written. What a
 * section does not have is tasks: under `## Review` nothing becomes work, so a
 * checkbox written there is part of the line it is on.
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

	const review = createEmptyReview();
	let currentDay: Day | null = null;
	let currentQuadrant: QuadrantId | null = null;
	/** Whether the lines below sit in the week's review rather than in a day. */
	let inReview = false;
	/** Review section those lines belong to; always null outside the review. */
	let currentSection: ReviewSectionId | null = null;
	/** Task the last checkbox line started, which an indented line continues. */
	let currentTask: Task | null = null;
	/** Language the file is written in, taken from the first heading that names one. */
	let fileLocale: Locale | null = null;

	for (const rawLine of content.split(/\r?\n/)) {
		const dayMatch = DAY_HEADING.exec(rawLine);
		if (dayMatch) {
			const label = normalizeHeading(dayMatch[1] ?? '');
			// The review's heading is a top-level one exactly like a day's, so the two
			// are told apart here, before the day headings are looked up. A review
			// opens no day: everything under it is items rather than work.
			const titleLocale = REVIEW_TITLES.get(label);
			if (titleLocale !== undefined) {
				inReview = true;
				currentDay = null;
				currentQuadrant = null;
				currentSection = null;
				currentTask = null;
				fileLocale ??= titleLocale;
				continue;
			}
			// A bare id (`## mon`) names no language, so it leaves the file locale alone.
			const match = DAY_HEADINGS.get(label) ?? (isDayId(label) ? { id: label, locale: null } : null);
			inReview = false;
			currentDay = match ? (byId.get(match.id) ?? null) : null;
			currentQuadrant = null;
			currentSection = null;
			currentTask = null;
			fileLocale ??= match?.locale ?? null;
			continue;
		}

		const quadrantMatch = QUADRANT_HEADING.exec(rawLine);
		if (quadrantMatch) {
			const label = normalizeHeading(quadrantMatch[1] ?? '');
			// Only a line inside the review can name one of its sections. The same
			// word under a day names nothing, so it closes the cell like any heading
			// the board does not recognize.
			const section = inReview ? REVIEW_HEADINGS.get(label) : undefined;
			if (section) {
				currentSection = section.id;
				currentQuadrant = null;
				currentTask = null;
				fileLocale ??= section.locale;
				continue;
			}
			const known = QUADRANT_HEADINGS.get(label);
			currentQuadrant = currentDay ? (known?.id ?? mappingFallback(label)) : null;
			currentSection = null;
			currentTask = null;
			fileLocale ??= known?.locale ?? null;
			continue;
		}

		// Collecting a review section's items comes before the task rules, because
		// inside the review there are none: a checkbox written there belongs to the
		// line it is on rather than starting a piece of work.
		//
		// An item is a bullet — that is what the board writes — and anything at the
		// margin is read as one too, so a section written out by hand is read as the
		// items it looks like. An indented line continues the item above it, exactly
		// as it continues a task, and a blank line separates nothing: an item is one
		// line or a few lines run together, and there is no third thing between two
		// of them for a blank line to be.
		if (currentSection !== null) {
			const items = review[currentSection];
			const bullet = REVIEW_ITEM.exec(rawLine);
			if (bullet) {
				items.push((bullet[1] ?? '').trim());
				continue;
			}
			const line = rawLine.trim();
			if (line.length === 0) {
				continue;
			}
			const last = items.length - 1;
			if (last >= 0 && /^\s/.test(rawLine)) {
				items[last] = `${items[last] ?? ''}\n${line}`;
				continue;
			}
			items.push(line);
			continue;
		}

		if (!currentDay || !currentQuadrant) {
			continue;
		}

		const taskMatch = TASK_LINE.exec(rawLine);
		if (taskMatch) {
			const quadrant = currentDay.quadrants.find((item) => item.id === currentQuadrant);
			const task = createTask((taskMatch[2] ?? '').trim(), taskMatch[1] !== ' ');
			quadrant?.tasks.push(task);
			currentTask = quadrant ? task : null;
			continue;
		}

		// An indented line continues the task above it. A checkbox line is tested
		// first, indented or not, so a hand-written nested list keeps reading as
		// the tasks it looks like.
		if (currentTask && /^\s/.test(rawLine)) {
			const line = rawLine.trim();
			if (line.length > 0) {
				// A checkbox line with nothing after it carries no break of its
				// own, so its first continuation line is simply its first line.
				currentTask.text =
					currentTask.text.length > 0 ? `${currentTask.text}\n${line}` : line;
				continue;
			}
		}

		// Anything else — a blank line, prose, a line back at the margin — ends
		// the task above it rather than being read into it.
		currentTask = null;
	}

	// Nothing is normalized here, and nothing needs to be: an item was trimmed as
	// it was read, and emptied ones were never pushed at all.
	return { weekStart, path, days, review, locale: fileLocale ?? fallbackLocale };
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
 *
 * A task or an item that runs over several lines is written as its first line,
 * then each further line indented under it — the plain text of the thing itself,
 * no markup added.
 *
 * The week's review goes after the days, in the order the sections are declared
 * rather than the order the file happened to use, so reading a file back and
 * writing it out again is what `hasLocalEdits` compares byte for byte.
 */
export function serializeSchedule(schedule: WeekSchedule): string {
	const lines: string[] = [`# ${schedule.path.split('/').pop()?.replace(/\.md$/, '') ?? ''}`];

	for (const day of schedule.days) {
		// A cell earns its heading by holding a task, and a row with nothing in it
		// is not one — a heading with no task under it would be noise in the file.
		const populated = day.quadrants.filter((quadrant) => quadrant.tasks.some(hasTaskText));
		if (populated.length === 0) {
			continue;
		}

		lines.push('', `## ${dayLabel(day.id, schedule.locale)}`);
		for (const quadrant of populated) {
			lines.push('', `### ${quadrantHeading(quadrant.id, schedule.locale)}`);
			for (const task of quadrant.tasks) {
				if (!hasTaskText(task)) {
					continue;
				}
				const text = normalizeTaskText(task.text);
				const [head, ...rest] = text.split('\n');
				lines.push(`- [${task.done ? 'x' : ' '}] ${head ?? ''}`);
				for (const line of rest) {
					lines.push(`${CONTINUATION}${line}`);
				}
			}
		}
	}

	// The week's own review, written last: it is what the week is looked back on
	// once it is over, and the days are what it looks back at. Each section is a
	// list of items, and an item holding nothing is not one — it is the line the
	// add row has just opened. A section left holding none of them earns no
	// heading, the way a cell with nothing in it does not: five headings over four
	// empty lists would be noise in every file.
	const written = REVIEW_SECTIONS.filter((id) => schedule.review[id].some(hasItemText));
	if (written.length > 0) {
		lines.push('', `## ${reviewTitle(schedule.locale)}`);
		for (const id of written) {
			lines.push('', `### ${reviewSectionLabel(id, schedule.locale)}`);
			for (const item of schedule.review[id]) {
				const text = normalizeTaskText(item);
				if (text.length === 0) {
					continue;
				}
				const [head, ...rest] = text.split('\n');
				lines.push(`${REVIEW_ITEM_PREFIX}${head ?? ''}`);
				for (const line of rest) {
					lines.push(`${CONTINUATION}${line}`);
				}
			}
		}
	}

	lines.push('');
	return lines.join('\n');
}
