/**
 * Checks the rules of carrying unfinished work into the following week — the
 * ones a type cannot express:
 *
 * - only unfinished, non-blank tasks are offered, and each keeps its day and
 *   quadrant;
 * - nothing is taken out of the week the work came from; the tasks that were
 *   carried are marked there with the week they went to;
 * - a mark is never part of a task's words: it is taken off before a task is
 *   compared or copied, so it neither travels into the next week nor turns one
 *   task into two;
 * - a task the target cell already holds is not offered, so running this twice
 *   changes nothing;
 * - a line break inside a task does not make it two tasks: a task that runs over
 *   several lines is offered, carried, moved and marked as the one task it is;
 * - a mark is written in the language the file is written in, not the interface
 *   language;
 * - the week before a target is named and located the way the board names and
 *   locates weeks, including across an ISO year boundary;
 * - the same work at day granularity is moved rather than copied — the day that
 *   is over keeps nothing — and only within one week, since the day before a
 *   Monday is the previous week's;
 * - the notices read correctly in both languages.
 *
 * Run with `npm run check:carry`. The Obsidian stand-in is shared with
 * `npm run check:i18n`.
 */
import { moment, setStubLanguage } from '../i18n-check/obsidian-stub';
import {
	applyCarryOver,
	applyDayCarryOver,
	markCarried,
	markCarriedTo,
	planCarryOver,
	planDayCarryOver,
	previousDayId,
	readMarkedText,
} from '../../src/carry-over';
import { parseSchedule, serializeSchedule } from '../../src/markdown';
import { formatShortDate } from '../../src/i18n/format';
import { syncLocale, t, tp } from '../../src/i18n/index';
import { dateKey, dayIdOf, shiftWeek, weekFilePath, weekKey } from '../../src/utils/date';
import type { DayId, QuadrantId, WeekSchedule } from '../../src/types';

const SOURCE_PATH = 'weekly-schedule/2026/2026-W39.md';
const TARGET_PATH = 'weekly-schedule/2026/2026-W40.md';
const LATER_PATH = 'weekly-schedule/2026/2026-W41.md';
const SOURCE_START = '2026-09-21';
const TARGET_START = '2026-09-28';
const LATER_START = '2026-10-05';
const SOURCE_WEEK = '2026-W39';
const TARGET_WEEK = '2026-W40';
const LATER_WEEK = '2026-W41';

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
	if (JSON.stringify(actual) === JSON.stringify(expected)) {
		console.log(`ok    ${label}`);
		return;
	}
	failures += 1;
	console.log(
		`FAIL  ${label}\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`,
	);
}

/** Pretends Obsidian's interface language is `language`. */
function use(language: string): void {
	setStubLanguage(language);
	syncLocale();
}

function cell(schedule: WeekSchedule, day: DayId, quadrant: QuadrantId) {
	return schedule.days
		.find((item) => item.id === day)
		?.quadrants.find((item) => item.id === quadrant);
}

/** Tasks of one cell as `done:text`, so a check can compare the whole cell. */
function tasks(schedule: WeekSchedule, day: DayId, quadrant: QuadrantId): string[] {
	return (cell(schedule, day, quadrant)?.tasks ?? []).map(
		(task) => `${task.done ? 'x' : ' '}:${task.text}`,
	);
}

/** Adds a task the way the board or a hand-edited file would leave one. */
function add(
	schedule: WeekSchedule,
	day: DayId,
	quadrant: QuadrantId,
	text: string,
	done = false,
): void {
	cell(schedule, day, quadrant)?.tasks.push({ id: `${day}:${quadrant}:${text}`, text, done });
}

// --- the mark a carried task keeps ----------------------------------------
use('zh');
check(
	'zh mark, as written',
	markCarriedTo('回应监管问询', TARGET_WEEK, 'zh'),
	'回应监管问询（已带入 2026-W40）',
);
check(
	'zh mark, read back',
	readMarkedText('回应监管问询（已带入 2026-W40）'),
	{ text: '回应监管问询', carriedTo: TARGET_WEEK },
);
check('zh mark, taken off a task without one', readMarkedText('回应监管问询'), {
	text: '回应监管问询',
	carriedTo: null,
});
check(
	'zh mark, replaced rather than stacked when the task moves on',
	markCarriedTo('回应监管问询（已带入 2026-W40）', LATER_WEEK, 'zh'),
	'回应监管问询（已带入 2026-W41）',
);
check(
	'zh mark, idempotent for the week it already names',
	markCarriedTo('回应监管问询（已带入 2026-W40）', TARGET_WEEK, 'zh'),
	'回应监管问询（已带入 2026-W40）',
);

use('en');
check('en mark, as written', markCarriedTo('Ship it', TARGET_WEEK, 'en'), 'Ship it (carried over to 2026-W40)');
check('en mark, read back', readMarkedText('Ship it (carried over to 2026-W40)'), {
	text: 'Ship it',
	carriedTo: TARGET_WEEK,
});
check(
	'a zh mark is read back while the interface is English',
	readMarkedText('回应监管问询（已带入 2026-W40）'),
	{ text: '回应监管问询', carriedTo: TARGET_WEEK },
);
check(
	'a week named in the middle of a task is not a mark',
	readMarkedText('把 2026-W40 的计划补完'),
	{ text: '把 2026-W40 的计划补完', carriedTo: null },
);

// --- what the previous week offers -----------------------------------------
// A file written in Chinese, read while the interface is English: the mark has
// to follow the file, not the interface.
const lastWeek = parseSchedule(
	'# 2026-W39\n\n## 周一\n\n### 重要 · 紧急\n- [ ] 回应监管问询\n- [x] 提交季度合规材料\n\n## 周二\n\n### 重要 · 紧急\n- [ ] 修复客户端崩溃\n\n## 周五\n\n### 重要 · 不紧急\n- [ ] 整理架构决策记录\n',
	SOURCE_START,
	SOURCE_PATH,
);
add(lastWeek, 'wed', 'q2', '');
check('the previous week is read as a Chinese file', lastWeek.locale, 'zh');

const thisWeek = parseSchedule('', TARGET_START, TARGET_PATH);
add(thisWeek, 'fri', 'q3', '整理架构决策记录');

const plan = planCarryOver(lastWeek, thisWeek);

check('only unfinished tasks are offered', plan.items.map((item) => item.text), [
	'回应监管问询',
	'修复客户端崩溃',
	'整理架构决策记录',
]);
check(
	'each task keeps its day and quadrant',
	plan.items.map((item) => `${item.day}.${item.quadrant}`),
	['mon.q1', 'tue.q1', 'fri.q3'],
);
check('a blank task is counted, not offered', plan.blank, 1);
check(
	'a task the target cell already holds is flagged',
	plan.items.map((item) => item.alreadyThere),
	[false, false, true],
);

const doubled = parseSchedule('', SOURCE_START, SOURCE_PATH);
add(doubled, 'tue', 'q1', 'One and the same');
add(doubled, 'tue', 'q1', 'One and the same');
check(
	'the same wording twice in one cell is one choice',
	planCarryOver(doubled, parseSchedule('', TARGET_START, TARGET_PATH)).items.length,
	1,
);

// --- carrying what was chosen ----------------------------------------------
const chosen = plan.items;
const before = serializeSchedule(lastWeek);
const added = applyCarryOver(thisWeek, chosen);

check('only the tasks the target week lacks are added', added, 2);
check('a carried task lands in the cell it came from', tasks(thisWeek, 'mon', 'q1'), [
	' :回应监管问询',
]);
check('a carried task lands on its own day', tasks(thisWeek, 'tue', 'q1'), [' :修复客户端崩溃']);
check('a task already there is not added twice', tasks(thisWeek, 'fri', 'q3'), [
	' :整理架构决策记录',
]);
check('carried tasks are unfinished', tasks(thisWeek, 'mon', 'q1').every((row) => row.startsWith(' ')), true);
check('no other cell is touched', tasks(thisWeek, 'wed', 'q1'), []);
check(
	'the target file is written as checkboxes, without a mark',
	serializeSchedule(thisWeek).includes('- [ ] 回应监管问询\n'),
	true,
);

// --- marking the week the work came from -----------------------------------
markCarried(lastWeek, chosen, TARGET_WEEK, lastWeek.locale ?? 'en');

check('a carried task is marked with the week it went to', tasks(lastWeek, 'mon', 'q1'), [
	' :回应监管问询（已带入 2026-W40）',
	'x:提交季度合规材料',
]);
check('a task already there is marked too', tasks(lastWeek, 'fri', 'q3'), [
	' :整理架构决策记录（已带入 2026-W40）',
]);
check('a task that was not chosen is left alone', tasks(lastWeek, 'wed', 'q2'), [' :']);
const markedSource = serializeSchedule(lastWeek);
check(
	'the mark is written in the language of the file',
	markedSource.includes('（已带入 2026-W40）'),
	true,
);
// Read off disk and written back again — the trip every mark actually makes.
const reread = serializeSchedule(parseSchedule(markedSource, SOURCE_START, SOURCE_PATH));
check(
	'the mark survives the file round trip',
	reread.includes('- [ ] 回应监管问询（已带入 2026-W40）'),
	true,
);
check(
	'and reading and writing it once more changes nothing',
	serializeSchedule(parseSchedule(reread, SOURCE_START, SOURCE_PATH)),
	reread,
);
check('nothing was taken out of the week the work came from', tasks(lastWeek, 'mon', 'q1').length, 2);

// --- running the whole thing a second time ---------------------------------
const again = planCarryOver(lastWeek, thisWeek);
check('a second run offers the same tasks', again.items.map((item) => item.text), [
	'回应监管问询',
	'修复客户端崩溃',
	'整理架构决策记录',
]);
check(
	'the mark is not part of the words, so every task reads as already there',
	again.items.map((item) => item.alreadyThere),
	[true, true, true],
);
check('so a second run adds nothing', applyCarryOver(thisWeek, again.items), 0);
markCarried(lastWeek, again.items, TARGET_WEEK, lastWeek.locale ?? 'en');
check('and leaves the previous week byte for byte as it was', serializeSchedule(lastWeek), markedSource);
check('with the target week still holding one of each', tasks(thisWeek, 'mon', 'q1'), [
	' :回应监管问询',
]);

// --- carrying the same week on into a later one ----------------------------
const laterWeek = parseSchedule('', LATER_START, LATER_PATH);
const laterPlan = planCarryOver(lastWeek, laterWeek);
check(
	'the tasks are read, not their marks',
	laterPlan.items.map((item) => item.text),
	['回应监管问询', '修复客户端崩溃', '整理架构决策记录'],
);
check('and none of them is in the later week yet', laterPlan.items.map((item) => item.alreadyThere), [
	false,
	false,
	false,
]);
check('so all of them are added', applyCarryOver(laterWeek, laterPlan.items), 3);
markCarried(lastWeek, laterPlan.items, LATER_WEEK, lastWeek.locale ?? 'en');
check('the mark then names the later week', tasks(lastWeek, 'tue', 'q1'), [
	' :修复客户端崩溃（已带入 2026-W41）',
]);
check('and it is still one mark, not two', (serializeSchedule(lastWeek).match(/已带入/g) ?? []).length, 3);

// --- the week before a target is found the way the board finds weeks -------
const week1Of2026 = moment([2025, 11, 29]);
const beforeWeek1 = shiftWeek(week1Of2026, -1);
check('the week before W01 is a date key', dateKey(beforeWeek1), '2025-12-22');
check('and it is the last week of the previous ISO year', weekKey(beforeWeek1), '2025-W52');
check(
	'so it is read from the previous year folder',
	weekFilePath('weekly-schedule', beforeWeek1),
	'weekly-schedule/2025/2025-W52.md',
);
check(
	'while the target keeps its own name',
	weekFilePath('weekly-schedule', week1Of2026),
	'weekly-schedule/2026/2026-W01.md',
);

// --- handing one day's unfinished work to the next --------------------------
// A date names a day the board has a column for, and the day before it is either
// in the same week's file or out of reach.
check('a Monday is the day the board calls Monday', dayIdOf(moment([2026, 8, 28])), 'mon');
check('a Sunday is the day the board calls Sunday', dayIdOf(moment([2026, 8, 27])), 'sun');
check('the day before Monday is in another week', previousDayId('mon'), null);
check('the day before Tuesday is Monday', previousDayId('tue'), 'mon');
check('the day before Sunday is Saturday', previousDayId('sun'), 'sat');
check(
	'so a Sunday has a day to hand over to',
	previousDayId(dayIdOf(moment([2026, 8, 27]))) !== null,
	true,
);
check(
	'while a Monday has none',
	previousDayId(dayIdOf(moment([2026, 8, 28]))),
	null,
);
check('the notice dates are written the way the board writes them', formatShortDate(moment([2026, 8, 27])), '9/27');

const dayWeek = parseSchedule(
	'# 2026-W40\n\n## 周一\n\n### 重要 · 紧急\n- [ ] 回应监管问询\n- [x] 提交季度合规材料\n\n### 重要 · 不紧急\n- [ ] 整理架构决策记录\n\n## 周二\n\n### 重要 · 紧急\n- [ ] 修复客户端崩溃\n\n## 周三\n\n### 重要 · 紧急\n- [ ] 写周报\n',
	TARGET_START,
	TARGET_PATH,
);
add(dayWeek, 'mon', 'q1', '缓解线上告警');
add(dayWeek, 'tue', 'q1', '缓解线上告警');
add(dayWeek, 'mon', 'q2', 'One and the same');
add(dayWeek, 'mon', 'q2', 'One and the same');
add(dayWeek, 'mon', 'q4', '');

const dayPlan = planDayCarryOver(dayWeek, 'mon', 'tue');
check(
	'only unfinished tasks are handed over',
	dayPlan.moves.map((move) => move.task.text),
	['回应监管问询', 'One and the same', '整理架构决策记录'],
);
check(
	'and each keeps the quadrant it was planned in',
	dayPlan.moves.map((move) => move.quadrant),
	['q1', 'q2', 'q3'],
);
check(
	'the same wording twice in one day is handed over once',
	dayPlan.moves.filter((move) => move.task.text === 'One and the same').length,
	1,
);
check('a wording the next day already holds is left where it is', dayPlan.alreadyThere, 1);
check('a blank task is counted, not handed over', dayPlan.blank, 1);
check('the plan names both days', [dayPlan.from, dayPlan.to], ['mon', 'tue']);

const movedDays = applyDayCarryOver(dayWeek, dayPlan);
check('everything planned is moved', movedDays, 3);

check('the tasks now sit at the end of the next day, after what was there', tasks(dayWeek, 'tue', 'q1'), [
	' :修复客户端崩溃',
	' :缓解线上告警',
	' :回应监管问询',
]);
check('and on their own quadrants', [
	tasks(dayWeek, 'tue', 'q2'),
	tasks(dayWeek, 'tue', 'q3'),
], [[' :One and the same'], [' :整理架构决策记录']]);
check(
	'a moved task is unfinished, as it was',
	tasks(dayWeek, 'tue', 'q1').every((row) => row.startsWith(' ')),
	true,
);
check('they are gone from the day that handed them over', tasks(dayWeek, 'mon', 'q3'), []);
check('a finished task is not moved', tasks(dayWeek, 'mon', 'q1'), [
	'x:提交季度合规材料',
	' :缓解线上告警',
]);
check('a blank task stays behind too', tasks(dayWeek, 'mon', 'q4'), [' :']);
check('a day that is neither end of the move is untouched', tasks(dayWeek, 'wed', 'q1'), [' :写周报']);

const dayFile = serializeSchedule(dayWeek);
check('the words now appear once in the file', (dayFile.match(/回应监管问询/g) ?? []).length, 1);
const dayReread = parseSchedule(dayFile, TARGET_START, TARGET_PATH);
check('and the move survives the file round trip', tasks(dayReread, 'tue', 'q1'), [
	' :修复客户端崩溃',
	' :缓解线上告警',
	' :回应监管问询',
]);
check('with the day it came from still holding its own work', tasks(dayReread, 'mon', 'q1'), [
	'x:提交季度合规材料',
	' :缓解线上告警',
]);
check('the day headings keep their language', dayFile.includes('## 周二'), true);

const secondDayPlan = planDayCarryOver(dayWeek, 'mon', 'tue');
check('a second run has nothing left to hand over', secondDayPlan.moves.length, 0);
check(
	'and all it can see left on the day are lines the next day holds',
	secondDayPlan.alreadyThere,
	2,
);
check('so a second run moves nothing', applyDayCarryOver(dayWeek, secondDayPlan), 0);
check('and leaves the file byte for byte as it was', serializeSchedule(dayWeek), dayFile);

// A mark is not part of a task's words here either: a line marked on Monday and
// the same words unmarked on Tuesday are one task, and the copy is not moved.
const markedDays = parseSchedule('', TARGET_START, TARGET_PATH);
add(markedDays, 'mon', 'q1', '回应监管问询（已带入 2026-W40）');
add(markedDays, 'tue', 'q1', '回应监管问询');
const markedDayPlan = planDayCarryOver(markedDays, 'mon', 'tue');
check('a mark does not hide that the next day has the task', markedDayPlan.alreadyThere, 1);
check('so the marked line stays behind', markedDayPlan.moves.length, 0);

// Moving is not marking: the words of a task that does move are left alone.
const movedMark = parseSchedule('', TARGET_START, TARGET_PATH);
add(movedMark, 'mon', 'q1', '回应监管问询（已带入 2026-W40）');
applyDayCarryOver(movedMark, planDayCarryOver(movedMark, 'mon', 'tue'));
check('a moved task keeps its own wording, mark and all', tasks(movedMark, 'tue', 'q1'), [
	' :回应监管问询（已带入 2026-W40）',
]);

// --- a task that runs over several lines -----------------------------------
// A line break inside a task does not make it two tasks: it is offered, carried,
// moved and counted as the one task it is. The mark goes on the end of the task
// — which is now the end of its last line.
const multiSource = parseSchedule('', SOURCE_START, SOURCE_PATH);
add(multiSource, 'mon', 'q1', '回应监管问询\n先补材料清单');
const multiPlan = planCarryOver(multiSource, parseSchedule('', TARGET_START, TARGET_PATH));
check('a multi-line task is offered as one task', multiPlan.items.map((item) => item.text), [
	'回应监管问询\n先补材料清单',
]);

const multiTarget = parseSchedule('', TARGET_START, TARGET_PATH);
check('and is carried whole', applyCarryOver(multiTarget, multiPlan.items), 1);
check('landing on the day it was planned on, lines and all', tasks(multiTarget, 'mon', 'q1'), [
	' :回应监管问询\n先补材料清单',
]);

markCarried(multiSource, multiPlan.items, TARGET_WEEK, 'en');
check('the mark goes on the end of the task’s last line', tasks(multiSource, 'mon', 'q1'), [
	' :回应监管问询\n先补材料清单 (carried over to 2026-W40)',
]);
check(
	'and reading it back leaves the task’s own lines alone',
	readMarkedText('回应监管问询\n先补材料清单 (carried over to 2026-W40)'),
	{ text: '回应监管问询\n先补材料清单', carriedTo: TARGET_WEEK },
);
const multiFile = serializeSchedule(multiSource);
check(
	'so the file holds one task with an indented line',
	multiFile.includes('- [ ] 回应监管问询\n  先补材料清单 (carried over to 2026-W40)\n'),
	true,
);
check(
	'and the mark is read off it again after the round trip',
	tasks(parseSchedule(multiFile, SOURCE_START, SOURCE_PATH), 'mon', 'q1'),
	[' :回应监管问询\n先补材料清单 (carried over to 2026-W40)'],
);
const multiAgain = planCarryOver(multiSource, multiTarget);
check(
	'a second run still reads it as the same task',
	multiAgain.items.map((item) => item.alreadyThere),
	[true],
);
check('so a second run adds nothing', applyCarryOver(multiTarget, multiAgain.items), 0);

// The day move hands the task itself over, so its words are not ours to edit.
const multiDays = parseSchedule('', TARGET_START, TARGET_PATH);
add(multiDays, 'mon', 'q1', '回应监管问询\n先补材料清单');
applyDayCarryOver(multiDays, planDayCarryOver(multiDays, 'mon', 'tue'));
check('a multi-line task moves as one task, words untouched', tasks(multiDays, 'tue', 'q1'), [
	' :回应监管问询\n先补材料清单',
]);

// --- what the dialog and the notices say -----------------------------------
use('en');
check(
	'en dialog title',
	t('carry.modalTitle', { from: SOURCE_WEEK, to: TARGET_WEEK }),
	'Bring unfinished tasks from 2026-W39 into 2026-W40',
);
check('en dialog, nothing already there', tp('carry.modalNote', 1, { to: TARGET_WEEK }), '1 task is already in 2026-W40 and will not be added twice.');
check('en dialog, several already there', tp('carry.modalNote', 3, { to: TARGET_WEEK }), '3 tasks are already in 2026-W40 and will not be added twice.');
check('en button, one task', tp('carry.confirm', 1), 'Bring 1 task over');
check('en button, several tasks', tp('carry.confirm', 4), 'Bring 4 tasks over');
check(
	'en notice',
	tp('carry.result', 2, { from: SOURCE_WEEK, to: TARGET_WEEK }),
	'Weekly schedule: brought 2 tasks over from 2026-W39 into 2026-W40.',
);
check(
	'en notice with what was already there',
	tp('carry.resultSkipped', 3, { from: SOURCE_WEEK, to: TARGET_WEEK, skipped: 2 }),
	'Weekly schedule: brought 3 tasks over from 2026-W39 into 2026-W40, leaving 2 already there.',
);
check(
	'en notice when nothing had to move',
	tp('carry.allThere', 3, { from: SOURCE_WEEK, to: TARGET_WEEK }),
	'Weekly schedule: all 3 tasks you picked are already in 2026-W40; 2026-W39 has been marked.',
);
check(
	'en notice when there is nothing to bring over',
	t('carry.none'),
	'Weekly schedule: nothing from the previous week needs bringing over.',
);
check(
	'en notice for a day move',
	tp('carry.dayResult', 2, { from: '9/27', to: '9/28' }),
	'Weekly schedule: moved 2 tasks from 9/27 into 9/28.',
);
check(
	'en day notice, singular',
	tp('carry.dayResult', 1, { from: '9/27', to: '9/28' }),
	'Weekly schedule: moved 1 task from 9/27 into 9/28.',
);
check(
	'en day notice with what stayed behind',
	tp('carry.dayResultSkipped', 1, { from: '9/27', to: '9/28', skipped: 2 }),
	'Weekly schedule: moved 1 task from 9/27 into 9/28, leaving 2 already there.',
);
check(
	'en day notice when the next day has it all',
	tp('carry.dayAllThere', 3, { to: '9/28' }),
	'Weekly schedule: all 3 tasks yesterday left are already in 9/28.',
);
check(
	'en day notice when there is nothing to move',
	t('carry.dayNone'),
	'Weekly schedule: yesterday left nothing unfinished.',
);
check(
	'en day notice across the week boundary',
	t('carry.dayCrossesWeek'),
	'Weekly schedule: yesterday belongs to the previous week, and this moves work only inside one week — nothing was moved.',
);

use('zh');
check('zh dialog title', t('carry.modalTitle', { from: SOURCE_WEEK, to: TARGET_WEEK }), '把 2026-W39 未完成的工作带入 2026-W40');
check('zh dialog note', tp('carry.modalNote', 2, { to: TARGET_WEEK }), '2 项已在 2026-W40 中，不会重复添加。');
check('zh button', tp('carry.confirm', 3), '带入 3 项');
check(
	'zh notice',
	tp('carry.result', 2, { from: SOURCE_WEEK, to: TARGET_WEEK }),
	'周计划：已把 2026-W39 的 2 项未完成带入 2026-W40。',
);
check(
	'zh notice with what was already there',
	tp('carry.resultSkipped', 1, { from: SOURCE_WEEK, to: TARGET_WEEK, skipped: 1 }),
	'周计划：已把 2026-W39 的 1 项未完成带入 2026-W40，1 项已在其中。',
);
check(
	'zh notice when nothing had to move',
	tp('carry.allThere', 2, { from: SOURCE_WEEK, to: TARGET_WEEK }),
	'周计划：勾选的 2 项都已在 2026-W40 中，2026-W39 已标记。',
);
check('zh notice when there is nothing to bring over', t('carry.none'), '周计划：上周没有需要带入的未完成项。');
check(
	'zh notice for a day move',
	tp('carry.dayResult', 2, { from: '9/27', to: '9/28' }),
	'周计划：已把 9/27 的 2 项未完成移入 9/28。',
);
check(
	'zh day notice with what stayed behind',
	tp('carry.dayResultSkipped', 1, { from: '9/27', to: '9/28', skipped: 2 }),
	'周计划：已把 9/27 的 1 项未完成移入 9/28，另有 2 项已在其中。',
);
check(
	'zh day notice when the next day has it all',
	tp('carry.dayAllThere', 3, { to: '9/28' }),
	'周计划：昨天剩余的 3 项都已在 9/28 中。',
);
check('zh day notice when there is nothing to move', t('carry.dayNone'), '周计划：昨天没有未完成的项。');
check(
	'zh day notice across the week boundary',
	t('carry.dayCrossesWeek'),
	'周计划：昨天属于上一周，而这里只在同一周内移动，本次没有移动。',
);

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
