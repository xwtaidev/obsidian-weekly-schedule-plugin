import { normalizeTaskText } from './markdown';
import { createTaskId } from './utils/helpers';
import type { DayId, QuadrantId, WeekSchedule } from './types';

/**
 * Adding a task without going to the board.
 *
 * The rule here is a small one, and it is the whole of the module: the task
 * lands at the end of the cell it is aimed at, with the text every task holds
 * — normalized the same way the board normalizes it, so a task added from the
 * dialog and the same words typed on the board are the same task, and a task
 * holding nothing (a row of spaces, say) is not added rather than written as
 * a line the file would drop on the next save.
 *
 * A duplicate wording is added anyway. Carrying refuses one, because a copy
 * might double a decision the week already holds; this text was typed on
 * purpose, into a dialog that named where it would go, and second-guessing
 * that would make the dialog answer for something the user just said.
 *
 * Kept free of Obsidian's API on purpose — no vault, no notice, no DOM.
 */
export function addTaskToCell(
	schedule: WeekSchedule,
	day: DayId,
	slot: QuadrantId,
	text: string,
): boolean {
	const normalized = normalizeTaskText(text);
	if (normalized.length === 0) {
		return false;
	}

	const cell = schedule.days
		.find((item) => item.id === day)
		?.quadrants.find((item) => item.id === slot);
	if (!cell) {
		return false;
	}

	cell.tasks.push({ id: createTaskId(), text: normalized, done: false });
	return true;
}
