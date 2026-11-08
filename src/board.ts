/**
 * Moving a task from one cell to another: the model change behind a drag.
 *
 * Kept out of the view because it is the part that can be wrong without anyone
 * seeing it — a task that lands in the wrong cell, or in the wrong place among
 * its new neighbours, is a task the user has to go looking for. The view
 * measures the pointer and draws; this decides what the week holds afterwards,
 * and can be asked directly what it decided.
 *
 * Nothing here touches the DOM, the store or Obsidian: a drag is one file's
 * worth of change (every cell of a week lives in the same file), so the caller
 * writes the week the way any other edit does.
 */
import type { DayId, Quadrant, WeekSchedule } from './types';

/**
 * A row as far as a drop position is concerned: where it starts and how tall it
 * is, in the same units as the pointer being placed among them.
 *
 * Two numbers rather than a rectangle, because that is all either question
 * below needs — and because a test can then ask it without a browser.
 */
export interface RowBox {
	top: number;
	height: number;
}

/** Where a task sits in the week: the cell holding it, and its place there. */
interface FoundTask {
	quadrant: Quadrant;
	index: number;
}

/**
 * Which place in a list of rows a pointer at `y` is asking for, as an index.
 *
 * The row it lands in front of is the first one whose middle is below the
 * pointer; past the last middle it lands at the end. Measured against the
 * middle rather than an edge because a row is a line of text: the pointer is
 * nearly always over some part of one, and which side of its middle it is on is
 * what the user means by it.
 */
export function dropIndexBefore(rows: readonly RowBox[], y: number): number {
	for (let index = 0; index < rows.length; index += 1) {
		const row = rows[index];
		if (row !== undefined && y < row.top + row.height / 2) {
			return index;
		}
	}
	return rows.length;
}

/**
 * Which of a day's cells a pointer at `y` is over — or, in the gap between two
 * of them, the one it is nearest.
 *
 * Nearest rather than none: the cells of a day are separated by a margin of a
 * few pixels, and a drop target that blinked out while crossing one would be a
 * drop the user keeps missing.
 */
export function cellIndexAt(rows: readonly RowBox[], y: number): number | null {
	let best: number | null = null;
	let bestGap = Number.POSITIVE_INFINITY;
	for (let index = 0; index < rows.length; index += 1) {
		const row = rows[index];
		if (row === undefined) {
			continue;
		}
		const bottom = row.top + row.height;
		const gap = y < row.top ? row.top - y : y > bottom ? y - bottom : 0;
		if (gap < bestGap) {
			bestGap = gap;
			best = index;
		}
		if (gap === 0) {
			return index;
		}
	}
	return best;
}

/**
 * Moves one task to a place in a cell, and says whether anything changed.
 *
 * Everything is named by id and looked up afresh. A drag outlives a redraw —
 * the week on screen can be replaced by a change made elsewhere while the
 * pointer is down — so holding the objects found at the start would be holding
 * ones the week no longer contains. A task or a cell that is gone by the time
 * the pointer comes up is not an error: the drop is simply dropped.
 *
 * `beforeTaskId` names a task of the target cell to land in front of, or is
 * null to land at the end. A neighbour rather than an index, because the rows
 * on screen are not the tasks in the week: completed ones may be hidden, and an
 * index counted over what is drawn would put the task in the wrong place.
 */
export function moveTaskToCell(
	schedule: WeekSchedule,
	taskId: string,
	dayId: DayId,
	slotId: string,
	beforeTaskId: string | null,
): boolean {
	const found = findTask(schedule, taskId);
	if (!found) {
		return false;
	}

	const target = schedule.days
		.find((day) => day.id === dayId)
		?.quadrants.find((quadrant) => quadrant.id === slotId);
	if (!target) {
		return false;
	}

	const before =
		beforeTaskId === null
			? target.tasks.length
			: target.tasks.findIndex((task) => task.id === beforeTaskId);
	// A neighbour that is no longer there — deleted, or carried in after the
	// drag began — leaves the end as the only place the drop can mean.
	const position = before === -1 ? target.tasks.length : before;

	// Taking the task out of the list first shifts everything after it: dropping
	// it back into the gap it already sits in front of would otherwise be read
	// as a place one further on, and a drop that moved nothing would mark the
	// week dirty and write it.
	const index = found.quadrant === target && position > found.index ? position - 1 : position;
	if (found.quadrant === target && index === found.index) {
		return false;
	}

	const [task] = found.quadrant.tasks.splice(found.index, 1);
	if (task === undefined) {
		return false;
	}
	target.tasks.splice(index, 0, task);
	return true;
}

function findTask(schedule: WeekSchedule, taskId: string): FoundTask | null {
	for (const day of schedule.days) {
		for (const quadrant of day.quadrants) {
			const index = quadrant.tasks.findIndex((task) => task.id === taskId);
			if (index !== -1) {
				return { quadrant, index };
			}
		}
	}
	return null;
}
