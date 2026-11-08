/**
 * Checks the two questions a drag asks, and the answer it changes the week with.
 *
 * The gesture itself is the view's — a pointer, a handle, a line drawn under it —
 * and cannot be asked here. What can is everything the gesture means:
 *
 * - where a row dropped between two others lands, by the middle of the rows it
 *   would sit among;
 * - which cell of a day a pointer is over, including the margin between two,
 *   where a drop must still find a cell rather than fall through;
 * - what a move does to the week: which cell gains the task, where among its new
 *   neighbours, and that a drop in the place the task already sits in changes
 *   nothing — because a week marked dirty for no change is a week written out
 *   again for nothing;
 * - that a task named by an id the week no longer has is a drop that does
 *   nothing, rather than an error or a task lost;
 * - that what was moved is what reaches the file: done stays done, a second line
 *   stays a second line, and a cell emptied by the move stops claiming a heading.
 *
 * Run with `npm run check:board`. The Obsidian stand-in is shared with
 * `npm run check:i18n`.
 */
import { cellIndexAt, dropIndexBefore, moveTaskToCell } from '../../src/board';
import { dayLabel } from '../../src/i18n';
import { parseSchedule, serializeSchedule } from '../../src/markdown';
import { normalizeSettings } from '../../src/settings';
import { buildSlotLayout, slotHeading } from '../../src/slots';
import type { DayId, WeekSchedule } from '../../src/types';

const WEEK_START = '2026-03-16';
const PATH = 'weekly-schedule/2026/2026-W12.md';

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
	if (JSON.stringify(actual) === JSON.stringify(expected)) {
		console.log(`ok    ${label}`);
		return;
	}
	failures += 1;
	console.log(`FAIL  ${label}\n  actual:   ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`);
}

const layout = buildSlotLayout(normalizeSettings(null).slots, {}, {});

/** A week with work in two cells of two days, and nothing else. */
function week(): WeekSchedule {
	const schedule = parseSchedule('', WEEK_START, PATH, layout, 'zh');
	const monday = schedule.days[0]?.quadrants[0];
	monday?.tasks.push(
		{ id: 'a', text: '甲', done: false },
		{ id: 'b', text: '乙', done: true },
		{ id: 'c', text: '丙', done: false },
	);
	schedule.days[1]?.quadrants[1]?.tasks.push({ id: 'd', text: '丁', done: false });
	return schedule;
}

/** The texts one cell of one day holds, in order. */
function texts(schedule: WeekSchedule, day: DayId, slot: string): string[] {
	const quadrant = schedule.days
		.find((item) => item.id === day)
		?.quadrants.find((item) => item.id === slot);
	return (quadrant?.tasks ?? []).map((task) => task.text);
}

console.log('where a drop lands among the rows of a cell');
const rows = [
	{ top: 100, height: 20 }, // middle 110
	{ top: 120, height: 20 }, // middle 130
	{ top: 140, height: 20 }, // middle 150
];
check('a cell holding nothing leaves the end, which is the same as the start', dropIndexBefore([], 100), 0);
check('above every middle is in front of the first row', dropIndexBefore(rows, 100), 0);
check('the upper half of a row is in front of it', dropIndexBefore(rows, 105), 0);
check('the lower half of a row is behind it', dropIndexBefore(rows, 111), 1);
check('a pointer exactly on a middle goes behind that row', dropIndexBefore(rows, 110), 1);
check('between two rows, in front of the one below', dropIndexBefore(rows, 135), 2);
check('below every middle is past the last row', dropIndexBefore(rows, 151), 3);

console.log('which cell of a day a pointer is over');
const cells = [
	{ top: 0, height: 40 },
	{ top: 60, height: 40 },
];
check('the cell holding the pointer', cellIndexAt(cells, 10), 0);
check('the other one', cellIndexAt(cells, 70), 1);
check('the margin between two goes to the nearer cell above', cellIndexAt(cells, 45), 0);
check('and to the nearer cell below', cellIndexAt(cells, 55), 1);
check('above the first cell is the first cell', cellIndexAt(cells, -30), 0);
check('below the last cell is the last cell', cellIndexAt(cells, 200), 1);
check('a day drawn with no cells has nowhere to drop', cellIndexAt([], 40), null);

console.log('what a move does to the week');
let schedule = week();
check('a task is taken to another day and put in front of the row it was dropped before', moveTaskToCell(schedule, 'a', 'tue', 'q2', 'd'), true);
check('the cell it left keeps the rest, in order', texts(schedule, 'mon', 'q1'), ['乙', '丙']);
check('the cell it landed in holds it where it was dropped', texts(schedule, 'tue', 'q2'), ['甲', '丁']);

schedule = week();
check('a drop past the last row lands at the end', moveTaskToCell(schedule, 'a', 'tue', 'q2', null), true);
check('which is the end of that cell', texts(schedule, 'tue', 'q2'), ['丁', '甲']);

schedule = week();
check('a task dropped in the gap it already sits in changes nothing', moveTaskToCell(schedule, 'b', 'mon', 'q1', 'c'), false);
check('and the cell is untouched', texts(schedule, 'mon', 'q1'), ['甲', '乙', '丙']);
check('a task dropped past the last row of its own cell changes nothing', moveTaskToCell(schedule, 'c', 'mon', 'q1', null), false);

schedule = week();
check('a task moved up its own cell', moveTaskToCell(schedule, 'c', 'mon', 'q1', 'a'), true);
check('takes the place of the row it was dropped before', texts(schedule, 'mon', 'q1'), ['丙', '甲', '乙']);

schedule = week();
check('a task moved down its own cell', moveTaskToCell(schedule, 'a', 'mon', 'q1', 'c'), true);
check('lands in front of that row, not in the gap it left', texts(schedule, 'mon', 'q1'), ['乙', '甲', '丙']);

schedule = week();
check('a neighbour that is the task itself changes nothing', moveTaskToCell(schedule, 'a', 'mon', 'q1', 'a'), false);
check('a neighbour from another cell is a drop past the last row', moveTaskToCell(schedule, 'a', 'mon', 'q1', 'd'), true);
check('which puts the task at the end of its cell', texts(schedule, 'mon', 'q1'), ['乙', '丙', '甲']);
check('a task the week no longer has is a drop that does nothing', moveTaskToCell(week(), 'gone', 'tue', 'q2', null), false);
check('a cell the layout does not have is a drop that does nothing', moveTaskToCell(week(), 'a', 'tue', 'gone', null), false);
check('a day the week does not have is a drop that does nothing', moveTaskToCell(week(), 'a', 'noday' as DayId, 'q1', null), false);

console.log('what the move leaves in the file');
schedule = week();
schedule.days[0]?.quadrants[0]?.tasks.push({ id: 'm', text: '第一行\n第二行', done: false });
// Monday's first cell is emptied into Tuesday's second one, so both the heading
// it no longer earns and the day it no longer earns are on the way out.
moveTaskToCell(schedule, 'a', 'tue', 'q2', null);
moveTaskToCell(schedule, 'b', 'tue', 'q2', null);
moveTaskToCell(schedule, 'c', 'tue', 'q2', null);
moveTaskToCell(schedule, 'm', 'tue', 'q2', 'd');
const written = serializeSchedule(schedule, layout);
const reread = parseSchedule(written, WEEK_START, PATH, layout, 'zh');
check(
	'a finished task stays finished in its new cell',
	reread.days[1]?.quadrants[1]?.tasks.some((task) => task.text === '乙' && task.done),
	true,
);
check('the tasks landed where they were dropped, in order', texts(reread, 'tue', 'q2'), [
	'第一行\n第二行',
	'丁',
	'甲',
	'乙',
	'丙',
]);
check('a week written after a move reads back into what was written', serializeSchedule(reread, layout), written);
check(
	'a cell emptied by the move stops claiming a heading',
	written.includes(`### ${slotHeading(layout, 'q1', 'zh')}`),
	false,
);
check(
	'a day emptied by the move stops claiming a heading too',
	written.includes(`## ${dayLabel('mon', 'zh')}`),
	false,
);
const tuesday = written.indexOf(`## ${dayLabel('tue', 'zh')}`);
check(
	'the work that landed on tuesday is written under tuesday',
	tuesday !== -1 && written.indexOf('第一行') > tuesday,
	true,
);

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
