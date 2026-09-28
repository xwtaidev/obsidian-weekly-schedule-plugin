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
 * - a mark is written in the language the file is written in, not the interface
 *   language;
 * - the week before a target is named and located the way the board names and
 *   locates weeks, including across an ISO year boundary;
 * - the notices read correctly in both languages.
 *
 * Run with `npm run check:carry`. The Obsidian stand-in is shared with
 * `npm run check:i18n`.
 */
import { moment, setStubLanguage } from '../i18n-check/obsidian-stub';
import { applyCarryOver, markCarried, markCarriedTo, planCarryOver, readMarkedText } from '../../src/carry-over';
import { parseSchedule, serializeSchedule } from '../../src/markdown';
import { syncLocale, t, tp } from '../../src/i18n/index';
import { dateKey, shiftWeek, weekFilePath, weekKey } from '../../src/utils/date';
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

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
