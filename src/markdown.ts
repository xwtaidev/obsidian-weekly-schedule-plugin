import { DAYS, createEmptyDays } from './constants';
import { createTaskId } from './utils/helpers';
import type { Day, DayId, QuadrantId, Task, WeekSchedule } from './types';

/** `## 周一` */
const DAY_HEADING = /^##\s+(.+?)\s*$/;
/** `### 重要 · 紧急` */
const QUADRANT_HEADING = /^###\s+(.+?)\s*$/;
/** `- [ ] 写周报` / `* [x] 写周报` / `1. [ ] 写周报` */
const TASK_LINE = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s?(.*)$/;

/**
 * Labels recognized when reading a file back. Parsing is heading based, so a
 * hand-edited file keeps working no matter which alias was written.
 */
const HEADING_TO_QUADRANT = new Map<string, QuadrantId>([
	['重要 紧急', 'q1'],
	['important and urgent', 'q1'],
	['urgent and important', 'q1'],
	['不重要 紧急', 'q2'],
	['not important but urgent', 'q2'],
	['urgent but not important', 'q2'],
	['重要 不紧急', 'q3'],
	['important but not urgent', 'q3'],
	['not urgent but important', 'q3'],
	['不重要 不紧急', 'q4'],
	['not important and not urgent', 'q4'],
	['not urgent and not important', 'q4'],
]);

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
 */
export function parseSchedule(content: string, weekStart: string, path: string): WeekSchedule {
	const days = createEmptyDays();
	const byId = new Map<DayId, Day>();
	for (const day of days) {
		byId.set(day.id, day);
	}

	let currentDay: Day | null = null;
	let currentQuadrant: QuadrantId | null = null;

	for (const rawLine of content.split(/\r?\n/)) {
		const dayMatch = DAY_HEADING.exec(rawLine);
		if (dayMatch) {
			const label = normalizeHeading(dayMatch[1] ?? '');
			const definition = DAYS.find(
				(day) => normalizeHeading(day.label) === label || day.id === label,
			);
			currentDay = definition ? (byId.get(definition.id) ?? null) : null;
			currentQuadrant = null;
			continue;
		}

		const quadrantMatch = QUADRANT_HEADING.exec(rawLine);
		if (quadrantMatch) {
			const label = normalizeHeading(quadrantMatch[1] ?? '');
			currentQuadrant = currentDay
				? (HEADING_TO_QUADRANT.get(label) ?? mappingFallback(label))
				: null;
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

	return { weekStart, path, days };
}

/** Handles generic word-order combinations such as "紧急 · 重要". */
function mappingFallback(label: string): QuadrantId | null {
	const important = label.includes('重要') && !label.includes('不重要');
	const unimportant = label.includes('不重要');
	const urgent = label.includes('紧急') && !label.includes('不紧急');
	const notUrgent = label.includes('不紧急');

	if (important && urgent) return 'q1';
	if (unimportant && urgent) return 'q2';
	if (important && notUrgent) return 'q3';
	if (unimportant && notUrgent) return 'q4';
	return null;
}

export function serializeSchedule(schedule: WeekSchedule): string {
	const lines: string[] = [`# ${schedule.path.split('/').pop()?.replace(/\.md$/, '') ?? ''}`];

	for (const day of schedule.days) {
		const populated = day.quadrants.filter((quadrant) => quadrant.tasks.length > 0);
		if (populated.length === 0) {
			continue;
		}

		lines.push('', `## ${day.label}`);
		for (const quadrant of populated) {
			lines.push('', `### ${quadrant.label}`);
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
