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

/**
 * What a line that continues a task is indented by: the width of the `- ` the
 * task itself hangs off, so the line sits under the text it belongs to rather
 * than under the box. No markup is involved — a continuation line is the plain
 * text of the task, only indented.
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
 * Parses a board file. Anything that is not a recognized day/quadrant heading
 * or a checkbox line (frontmatter, comments, prose) is ignored, and an
 * unrecognized `###` heading closes the current quadrant instead of guessing.
 *
 * An indented line under a task belongs to that task: it is how a task that runs
 * over several lines is written back out (see `serializeSchedule`). A blank line
 * or a line back at the margin ends the task above it, which leaves the meaning
 * a hand-edited file has in Markdown itself.
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
	/** Task the last checkbox line started, which an indented line continues. */
	let currentTask: Task | null = null;
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
			currentTask = null;
			fileLocale ??= match?.locale ?? null;
			continue;
		}

		const quadrantMatch = QUADRANT_HEADING.exec(rawLine);
		if (quadrantMatch) {
			const label = normalizeHeading(quadrantMatch[1] ?? '');
			const known = QUADRANT_HEADINGS.get(label);
			currentQuadrant = currentDay ? (known?.id ?? mappingFallback(label)) : null;
			currentTask = null;
			fileLocale ??= known?.locale ?? null;
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
 *
 * A task that runs over several lines is written as its first line, then each
 * further line indented under it — the plain text of the task, no markup added.
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

	lines.push('');
	return lines.join('\n');
}
