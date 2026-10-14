/**
 * Checks the localization rules that a type cannot express:
 *
 * - an existing file keeps the heading language it was written in, and saving it
 *   after the interface language changed does not translate it;
 * - a new file follows the interface language;
 * - a file written in any supported language — or in the wording this plugin
 *   used before it was translated — still parses;
 * - a task that runs over several lines is written as an indented line and read
 *   back as one task, and what a task cannot hold is dropped rather than lost;
 * - a task with nothing in it is not one: it is not written, it earns its cell no
 *   heading, and the week's totals do not count it;
 * - the week's review is a list of items rather than work: an item is written as
 *   a bullet, an indented line continues the one above it, nothing written there
 *   becomes a task, and a section holding no item earns no heading;
 * - the review reads as PDCA: the four sections spell those letters in the order
 *   they are drawn and written, each asks its own question and is named by the
 *   word its letter stands for, and the panel's wording is the board's own,
 *   which can never reach a file;
 * - a week written before the review existed reads back as one nobody has
 *   reviewed, and is written out again exactly as it was;
 * - dates, plurals and notices read correctly in both languages.
 *
 * Run with `npm run check:i18n`.
 */
import { moment, setStubLanguage } from './obsidian-stub';
import {
	REVIEW_SECTIONS,
	REVIEW_SECTION_LETTERS,
	createEmptyReview,
	isReviewSectionId,
} from '../../src/constants';
import {
	hasReviewText,
	hasTaskText,
	normalizeTaskText,
	parseSchedule,
	serializeSchedule,
} from '../../src/markdown';
import { DEFAULT_SLOT_LAYOUT } from '../../src/slots';
import { reviewSpan } from '../../src/utils/helpers';
import { formatWeekLabel, formatWeekRange } from '../../src/i18n/format';
import {
	getLocale,
	quadrantParts,
	reviewQuestion,
	reviewSectionLabel,
	reviewStepName,
	reviewTitle,
	syncLocale,
	t,
	tp,
} from '../../src/i18n/index';
import { en } from '../../src/i18n/locales/en';
import { zh } from '../../src/i18n/locales/zh';
import type { Day, DayId, QuadrantId, WeekSchedule } from '../../src/types';

const PATH = 'weekly-schedule/2026/2026-W12.md';
const WEEK_START = '2026-03-16';

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

/**
 * Reading and writing with the layout a vault starts with — the four quadrants,
 * none renamed. Every file these checks use is such a file; a layout the user
 * configured is what `npm run check:slots` is about.
 */
function read(content: string, weekStart: string, path: string): WeekSchedule {
	return parseSchedule(content, weekStart, path, DEFAULT_SLOT_LAYOUT);
}

function save(schedule: WeekSchedule): string {
	return serializeSchedule(schedule, DEFAULT_SLOT_LAYOUT);
}

function cell(schedule: WeekSchedule, day: DayId, quadrant: QuadrantId) {
	return schedule.days
		.find((item) => item.id === day)
		?.quadrants.find((item) => item.id === quadrant);
}

/** Tasks of one cell, as `done:text`, so a check can compare the whole cell. */
function tasks(schedule: WeekSchedule, day: DayId, quadrant: QuadrantId): string[] {
	return (cell(schedule, day, quadrant)?.tasks ?? []).map(
		(task) => `${task.done ? 'x' : ' '}:${task.text}`,
	);
}

function fill(
	schedule: WeekSchedule,
	day: DayId,
	quadrant: QuadrantId,
	text: string,
	done = false,
): void {
	cell(schedule, day, quadrant)?.tasks.push({ id: `task:${text}`, text, done });
}

/** Every task of the week, whatever day and cell it sits in. */
function allTasks(schedule: WeekSchedule): string[] {
	return schedule.days.flatMap((day) =>
		day.quadrants.flatMap((quadrant) => quadrant.tasks.map((task) => task.text)),
	);
}

// --- the dictionaries cover each other ------------------------------------
check(
	'every en key has a zh translation',
	Object.keys(en).filter((key) => !(key in zh)),
	[],
);
check(
	'every zh key has an en translation',
	Object.keys(zh).filter((key) => !(key in en)),
	[],
);
check(
	'no empty translations',
	[...Object.values(en), ...Object.values(zh)].filter((value) => value.length === 0),
	[],
);
check(
	'counted strings carry both plural forms',
	[
		'migrate.result',
		'migrate.pendingFiles',
		'migrate.movedFiles',
		'migrate.slots.pending',
		'migrate.slots.changed',
		'year.weeksDone',
		'year.tasksTotal',
		'board.stats.tasks',
		'carry.result',
		'carry.resultSkipped',
		'carry.allThere',
		'carry.modalNote',
		'carry.confirm',
		'carry.dayAllThere',
		'carry.dayResult',
		'carry.dayResultSkipped',
	].filter((key) => !(en as Record<string, string>)[key]?.includes('|')),
	[],
);
// The carry-over mark is written into a week's file and recognized again from
// this same wording, so the placeholder is what the pattern is built around: a
// translation that dropped it would silently stop matching.
check(
	'the carry mark names the week it went to, in both languages',
	[en['carry.mark'].includes('{week}'), zh['carry.mark'].includes('{week}')],
	[true, true],
);

// --- which language the app reports ---------------------------------------
use('en');
check('en resolves to en', getLocale(), 'en');
use('zh');
check('zh resolves to zh', getLocale(), 'zh');
use('zh-CN');
check('zh-CN resolves to zh', getLocale(), 'zh');
use('zh-TW');
check('zh-TW falls back to its base language', getLocale(), 'zh');
use('de');
check('an unsupported language falls back to en', getLocale(), 'en');
check('an unsupported language still gets translated text', t('board.thisWeek'), 'This week');

// --- a new week follows the interface language ----------------------------
use('en');
const newEn = read('', WEEK_START, PATH);
fill(newEn, 'mon', 'q1', 'Ship it');
const textEn = save(newEn);
check('new file in en: day heading', textEn.includes('## Monday'), true);
check('new file in en: quadrant heading', textEn.includes('### Important · urgent'), true);
check('new file in en: checkbox syntax kept', textEn.includes('- [ ] Ship it'), true);
check('new file in en: file language', newEn.locale, 'en');

use('zh');
const newZh = read('', WEEK_START, PATH);
fill(newZh, 'mon', 'q1', '交周报');
fill(newZh, 'mon', 'q1', '修线上 bug', true);
fill(newZh, 'tue', 'q2', '回复邮件');
const textZh = save(newZh);
check('new file in zh: day heading', textZh.includes('## 周一'), true);
check('new file in zh: quadrant heading', textZh.includes('### 重要 · 紧急'), true);
check('new file in zh: file language', newZh.locale, 'zh');
check(
	'an empty week writes no headings to translate',
	save(read('', WEEK_START, PATH)),
	'# 2026-W12\n',
);

// --- an existing file keeps the language it was written in ----------------
use('en');
const reloadedZh = read(textZh, WEEK_START, PATH);
check('existing zh file is read as zh', reloadedZh.locale, 'zh');
check('existing zh tasks survive', tasks(reloadedZh, 'mon', 'q1'), [' :交周报', 'x:修线上 bug']);
check('existing zh tasks survive on another day', tasks(reloadedZh, 'tue', 'q2'), [' :回复邮件']);
check('saving after a switch to en keeps zh wording', save(reloadedZh), textZh);
check('reading and writing is idempotent', save(read(textZh, WEEK_START, PATH)), textZh);

use('zh');
const reloadedEn = read(textEn, WEEK_START, PATH);
check('existing en file is read as en', reloadedEn.locale, 'en');
check('saving after a switch to zh keeps en wording', save(reloadedEn), textEn);

// --- hand-edited and legacy files -----------------------------------------
use('en');
const legacyZh =
	'# 2026-W12\n\n## 周一\n\n### 重要 紧急\n- [ ] A\n\n### 不重要 不紧急\n- [ ] B\n\n## 周五\n\n### 紧急 · 重要\n- [x] C\n';
const legacy = read(legacyZh, WEEK_START, PATH);
check('zh heading without a separator maps to q1', tasks(legacy, 'mon', 'q1'), [' :A']);
check('zh heading without a separator maps to q4', tasks(legacy, 'mon', 'q4'), [' :B']);
check('zh word order is read by keyword', tasks(legacy, 'fri', 'q1'), ['x:C']);
check('legacy zh file keeps its wording', save(legacy).includes('## 周一'), true);

const legacyEn =
	'## Monday\n\n### urgent but not important\n- [ ] D\n\n### something else entirely\n- [ ] E\n';
const legacyEnSchedule = read(legacyEn, WEEK_START, PATH);
check('legacy en wording maps to q2', tasks(legacyEnSchedule, 'mon', 'q2'), [' :D']);
check(
	'an unrecognized heading closes the cell instead of guessing',
	save(legacyEnSchedule).includes('- [ ] E'),
	false,
);
check('legacy en file is read as en', legacyEnSchedule.locale, 'en');

const idFile = read('## tue\n\n### Important · not urgent\n- [ ] F\n', WEEK_START, PATH);
check('a bare day id is accepted', tasks(idFile, 'tue', 'q3'), [' :F']);

// --- a task that runs over several lines ----------------------------------
// A task is usually one line, and a line break inside one is stored as an
// indented line under the checkbox: the task's own text, with no markup added.
const multiline = read('', WEEK_START, PATH);
fill(multiline, 'mon', 'q1', '先和后端对齐接口\n再补上灰度开关');
const multilineText = save(multiline);
check(
	'a multi-line task is written as its first line, then the rest indented',
	multilineText.includes('- [ ] 先和后端对齐接口\n  再补上灰度开关\n'),
	true,
);
check(
	'a multi-line task is read back as one task',
	tasks(read(multilineText, WEEK_START, PATH), 'mon', 'q1'),
	[' :先和后端对齐接口\n再补上灰度开关'],
);
check(
	'and writing it out again changes nothing',
	save(read(multilineText, WEEK_START, PATH)),
	multilineText,
);

check('blank lines are not part of a task', normalizeTaskText('  第一行  \n\n  \n第二行\n  '), '第一行\n第二行');
check('a line break typed on Windows is a line break', normalizeTaskText('a\r\nb'), 'a\nb');
const messy = read('', WEEK_START, PATH);
fill(messy, 'mon', 'q1', '  第一行  \n\n第二行\n');
check(
	'and are dropped on the way to the file rather than written out to be lost',
	save(messy).includes('- [ ] 第一行\n  第二行\n'),
	true,
);

// What ends a task is what ends it in Markdown, so a hand-edited file means
// what it looks like.
const broken = read(
	'## mon\n\n### Important · urgent\n- [ ] A\n\n  这一段不再属于 A\n- [ ] B\n  属于 B\nplain prose\n- [ ] C\n',
	WEEK_START,
	PATH,
);
check('a blank line ends the task above it', tasks(broken, 'mon', 'q1'), [
	' :A',
	' :B\n属于 B',
	' :C',
]);
check(
	'an indented checkbox is still a task of its own',
	tasks(
		read(
			'## mon\n\n### Important · urgent\n- [ ] A\n  - [ ] B\n',
			WEEK_START,
			PATH,
		),
		'mon',
		'q1',
	),
	[' :A', ' :B'],
);
check(
	'a checkbox line with nothing after it takes its first line as its first',
	tasks(
		read('## mon\n\n### Important · urgent\n- [ ]\n  第一行\n', WEEK_START, PATH),
		'mon',
		'q1',
	),
	[' :第一行'],
);

// --- a task with nothing in it --------------------------------------------
// A row waiting for its first keystroke is not work: it is never written, it
// earns its cell no heading, and the board's totals count the week's tasks
// rather than its rows.
const waiting = read('', WEEK_START, PATH);
fill(waiting, 'mon', 'q1', '先说点什么');
cell(waiting, 'mon', 'q1')?.tasks.push({ id: 'empty', text: '', done: false });
cell(waiting, 'mon', 'q3')?.tasks.push({ id: 'blank', text: '   \n ', done: false });
check('an empty task is not a task', hasTaskText({ id: 'a', text: '', done: false }), false);
check('nor is one holding only space', hasTaskText({ id: 'a', text: '  \n ', done: false }), false);
check('a task with text is', hasTaskText({ id: 'a', text: '写周报', done: false }), true);

const waitingText = save(waiting);
check('only the task holding something is written', (waitingText.match(/^- \[/gm) ?? []).length, 1);
check('and a cell holding only a row like that earns no heading', (waitingText.match(/^### /gm) ?? []).length, 1);

// --- the week's review -----------------------------------------------------
// Four sections of items, written after the days. An item is a bullet, the way a
// task is a checkbox — the same shape of line, without the box, because a review
// holds what was noticed and decided rather than work to be done. Nothing in it
// becomes a task, and a section holding no item earns no heading, so a week
// nobody reviewed is written out exactly as it was read.
use('en');

const reviewed = read('', WEEK_START, PATH);
fill(reviewed, 'mon', 'q1', 'Ship it');
reviewed.review.plan = ['先把周报自动化推出去'];
reviewed.review.check = ['q3 拖了 3 条，都是重要不紧急'];
const reviewedText = save(reviewed);

check(
	'the review is written after the days',
	reviewedText.indexOf('## Review') > reviewedText.indexOf('- [ ] Ship it'),
	true,
);
check(
	'a section is written under its own heading, each item as a bullet',
	reviewedText.includes('### Plan\n- 先把周报自动化推出去\n'),
	true,
);
check('a section holding nothing earns no heading', (reviewedText.match(/^### /gm) ?? []).length, 3);
check(
	'a reviewed week is read back exactly as it was written',
	read(reviewedText, WEEK_START, PATH).review,
	{
		plan: ['先把周报自动化推出去'],
		do: [],
		check: ['q3 拖了 3 条，都是重要不紧急'],
		act: [],
	},
);
check(
	'and writing it out again changes nothing',
	save(read(reviewedText, WEEK_START, PATH)),
	reviewedText,
);

check(
	'every bullet is an item of its own',
	read('## Review\n\n### Check\n- 一\n- 二\n- 三\n', WEEK_START, PATH).review.check,
	['一', '二', '三'],
);
check(
	'and a section written out by hand is read as the items it looks like',
	read('## Review\n\n### Check\n一\n\n二\n', WEEK_START, PATH).review.check,
	['一', '二'],
);

const continued = '## Review\n\n### Check\n- 一\n  二\n';
check(
	'an indented line continues the item above it rather than opening another',
	read(continued, WEEK_START, PATH).review.check,
	['一\n二'],
);
check(
	'and an item running over several lines is written back the way it came',
	save(read(continued, WEEK_START, PATH)),
	'# 2026-W12\n\n## Review\n\n### Check\n- 一\n  二\n',
);

const spaced = read('', WEEK_START, PATH);
spaced.review.do = ['  \n\n  ', ''];
check(
	'a section holding only space earns no heading either',
	(save(spaced).match(/^### /gm) ?? []).length,
	0,
);
check(
	'and an item holding nothing is not written at all',
	(save(spaced).match(/^- /gm) ?? []).length,
	0,
);

const boxed = read(
	'## Review\n\n### Check\n- [ ] 这一行不是任务\n- 一句普通的话\n',
	WEEK_START,
	PATH,
);
check(
	'a checkbox in the review is part of its line rather than a task',
	boxed.review.check,
	['[ ] 这一行不是任务', '一句普通的话'],
);
check('and nothing written in the review becomes a task', allTasks(boxed), []);
check(
	'reading a section and writing it out again is a fixed point',
	save(read(save(boxed), WEEK_START, PATH)),
	save(boxed),
);

check('a review holding nothing does not count as written', hasReviewText(createEmptyReview()), false);
check(
	'nor does one holding only space',
	hasReviewText({ ...createEmptyReview(), check: ['  \n\n '] }),
	false,
);
check(
	'nor one holding only the item an add row has just opened',
	hasReviewText({ ...createEmptyReview(), check: ['', ''] }),
	false,
);
check(
	'one section written is enough',
	hasReviewText({ ...createEmptyReview(), act: ['一句'] }),
	true,
);
check('a section id is recognized as itself', isReviewSectionId('plan'), true);
check('and not as its own heading', isReviewSectionId('Plan'), false);
check('nor as anything else', isReviewSectionId('nope'), false);
// The panel is read as a cycle, so the four sections have to spell it out in
// the order they are drawn and written — PDCA is not four labels that happen to
// start with those letters in some other order.
check(
	'the four sections spell the frame they belong to',
	REVIEW_SECTIONS.map((id) => REVIEW_SECTION_LETTERS[id]).join(''),
	'PDCA',
);
check(
	'and each letter stands for one section only',
	new Set(REVIEW_SECTIONS.map((id) => REVIEW_SECTION_LETTERS[id])).size,
	REVIEW_SECTIONS.length,
);
// A step is named by the file's word for it, and — where the letter's word is not
// that same word — by the letter's word beside it, so that `计划` next to a `P`
// says which step of PDCA it is. Board wording: the file keeps its heading.
check(
	'each step is named by the word its letter stands for',
	REVIEW_SECTIONS.map((id) => reviewStepName(id, 'en')),
	['Plan', 'Do', 'Check', 'Act'],
);
check(
	'and a language that needed the word said adds it',
	REVIEW_SECTIONS.map((id) => reviewStepName(id, 'zh')),
	['计划（Plan）', '执行（Do）', '检查（Check）', '改进（Act）'],
);
check(
	'without renaming the heading its file is written under',
	REVIEW_SECTIONS.map((id) => [
		reviewStepName(id, 'zh').startsWith(reviewSectionLabel(id, 'zh')),
		reviewStepName(id, 'zh') === reviewSectionLabel(id, 'zh'),
	]),
	[
		[true, false],
		[true, false],
		[true, false],
		[true, false],
	],
);

check('the panel spans two columns where the grid is three wide', reviewSpan(3), 2);
check('one where it is two, since a two-cell span would not fit beside Sunday', reviewSpan(2), 1);
check('and one where it is one', reviewSpan(1), 1);

const closedReview = '## Review\n\n### Plan\n计划一句\n\n## 周一\n\n### 重要 · 紧急\n- [ ] 回到板子上\n';
check(
	'an unrecognized heading closes the review section',
	read('## Review\n\n### Check\n一句\n\n### 别的东西\n漏掉的\n', WEEK_START, PATH)
		.review.check,
	['一句'],
);
check(
	'a day heading after the review leaves the review alone',
	read(closedReview, WEEK_START, PATH).review.plan,
	['计划一句'],
);
check(
	'and the day below it is still read as a day',
	tasks(read(closedReview, WEEK_START, PATH), 'mon', 'q1'),
	[' :回到板子上'],
);

const outOfOrder = read(
	'## Review\n\n### Act\n先写的改进\n\n### Plan\n后写的计划\n',
	WEEK_START,
	PATH,
);
check(
	'sections are read whatever order they come in',
	[outOfOrder.review.plan, outOfOrder.review.act],
	[['后写的计划'], ['先写的改进']],
);
check(
	'and are written back in the order the plugin declares',
	save(outOfOrder).indexOf('### Plan') <
		save(outOfOrder).indexOf('### Act'),
	true,
);

use('zh');
const reviewZh = read('', WEEK_START, PATH);
reviewZh.review.act = ['周三、周五各留半天给 q3'];
const reviewZhText = save(reviewZh);
check('new review in zh: title heading', reviewZhText.includes('## 复盘'), true);
check(
	'new review in zh: section heading',
	reviewZhText.includes('### 改进\n- 周三、周五各留半天给 q3\n'),
	true,
);
// What the panel names a step and what a week is written under are two strings,
// and the one that is never written is the one that carries the acronym's word.
check(
	'and the name the panel shows is not what the week is written with',
	reviewZhText.includes('（'),
	false,
);

use('en');
check(
	'an existing zh review keeps its wording',
	save(read(reviewZhText, WEEK_START, PATH)),
	reviewZhText,
);

use('zh');
check(
	'an existing en review keeps its wording',
	save(read(reviewedText, WEEK_START, PATH)),
	reviewedText,
);

// --- a week written before the review existed -----------------------------
// The review was added to a plugin already in use, so every file already in a
// vault has nothing under `## Review` — no empty section, no heading, not even
// the field in memory. Reading one has to produce a review that is simply
// unwritten, and writing it out again has to leave the file as it was found:
// opening an old week must not be a way to rewrite it.
const beforeReview = '# 2026-W12\n\n## 周一\n\n### 重要 · 紧急\n- [ ] 老文件里的一条\n';
const unreviewed = read(beforeReview, WEEK_START, PATH);
check('a file from before the review holds four empty sections', unreviewed.review, {
	plan: [],
	do: [],
	check: [],
	act: [],
});
check('so nothing in it reads as a review', hasReviewText(unreviewed.review), false);
check('and its tasks are read as they always were', allTasks(unreviewed), ['老文件里的一条']);
check('it is written back byte for byte', save(unreviewed), beforeReview);
check(
	'and gains no review heading on the way out',
	save(unreviewed).includes('## 复盘'),
	false,
);

// --- a language switch while the board is open ----------------------------
use('zh');
const openBoard = read('', WEEK_START, PATH);
fill(openBoard, 'wed', 'q3', '写文档');
const writtenBeforeSwitch = save(openBoard);
use('en');
check(
	'a switch does not translate what is already loaded',
	save(openBoard),
	writtenBeforeSwitch,
);
const afterSwitch = read('', WEEK_START, PATH);
fill(afterSwitch, 'wed', 'q3', 'Write docs');
check(
	'a switch does change what a new file is written with',
	save(afterSwitch).includes('## Wednesday'),
	true,
);

// --- wording --------------------------------------------------------------
use('en');
check('en day label', t('day.wed'), 'Wednesday');
check('en quadrant parts', quadrantParts(true, false), ['Important', 'not urgent']);
check('en review title', reviewTitle(), 'Review');
check('en review section', reviewSectionLabel('act'), 'Act');
check('en review step name', reviewStepName('act'), 'Act');
check('en review panel names the frame', t('board.reviewPanel'), 'PDCA review');
check(
	'en review questions ask four different things',
	REVIEW_SECTIONS.map((id) => reviewQuestion(id)),
	[
		'What you set out to do',
		'What actually got done',
		'Where it fell short, and why',
		'What to change next week',
	],
);
// The panel's heading and a week's own headings are two different strings on
// purpose: the acronym is board wording, and board wording is the one thing the
// serializer must never reach, or it would be written into every week's file —
// and a file the user already had is never translated.
check(
	'the panel heading is not a heading a file is written under',
	[
		t('board.reviewPanel') === reviewTitle(),
		REVIEW_SECTIONS.some((id) => t('board.reviewPanel') === reviewSectionLabel(id)),
	],
	[false, false],
);
check('en day count', t('day.openCount', { count: 3 }), '3 left');
check('en plural, singular', tp('year.tasksTotal', 1), '1 task');
check('en plural, plural', tp('year.tasksTotal', 4), '4 tasks');
check('en week totals, singular', tp('board.stats.tasks', 1), '1 task this week');
check('en week totals, plural', tp('board.stats.tasks', 9), '9 tasks this week');
check(
	'en week totals line',
	`${tp('board.stats.tasks', 12)} · ${t('board.stats.done', { count: 5 })} · ${t('board.stats.percent', { percent: 42 })}`,
	'12 tasks this week · 5 done · 42% complete',
);
check('en notice with a count', tp('migrate.result', 2), 'Weekly schedule: moved 2 files into year folders.');
check(
	'en notice with a year list',
	tp('migrate.movedFiles', 2, { years: '2025, 2026' }),
	'Weekly schedule: moved 2 files into 2025, 2026.',
);

use('zh');
check('zh day label', t('day.wed'), '周三');
check('zh quadrant parts', quadrantParts(false, true), ['不重要', '紧急']);
check('zh review title', reviewTitle(), '复盘');
check('zh review section', reviewSectionLabel('act'), '改进');
check('zh review step name', reviewStepName('act'), '改进（Act）');
check('zh review panel names the frame', t('board.reviewPanel'), 'PDCA 复盘');
check(
	'zh review questions ask four different things',
	REVIEW_SECTIONS.map((id) => reviewQuestion(id)),
	['本周打算做什么', '实际做成了什么', '差距在哪，为什么', '下周准备怎么改'],
);
check(
	'and a section keeps the heading its file is written under',
	REVIEW_SECTIONS.map((id) => reviewSectionLabel(id)),
	['计划', '执行', '检查', '改进'],
);
check('zh day count', t('day.openCount', { count: 3 }), '3 项');
check(
	'zh week totals line',
	`${tp('board.stats.tasks', 12)} · ${t('board.stats.done', { count: 5 })} · ${t('board.stats.percent', { percent: 42 })}`,
	'本周 12 项 · 已完成 5 · 完成 42%',
);
check('zh empty week', t('board.stats.empty'), '本周还没有待办');
check('zh notice with a count', tp('migrate.result', 2), '周计划：已整理 2 个文件到年份文件夹。');
check(
	'zh notice with a year list',
	tp('migrate.movedFiles', 2, { years: '2025、2026' }),
	'周计划：已移动 2 个文件到 2025、2026 文件夹。',
);

// --- dates -----------------------------------------------------------------
const week12 = moment([2026, 2, 16]);
/** Monday of ISO week 1 of 2026, i.e. a date whose calendar year is the previous one. */
const week1Of2026 = moment([2025, 11, 29]);

use('en');
check('en week label', formatWeekLabel(week12), 'Week 12 of 2026 · Mar 16 – Mar 22');
check(
	'en week label across the ISO year boundary',
	formatWeekLabel(week1Of2026),
	'Week 1 of 2026 · Dec 29 – Jan 4',
);
check('en week range', formatWeekRange(week12), '3/16 – 3/22');

use('zh');
check('zh week label', formatWeekLabel(week12), '2026 年第 12 周 · 3月16日 – 3月22日');
check(
	'zh week label across the ISO year boundary',
	formatWeekLabel(week1Of2026),
	'2026 年第 1 周 · 12月29日 – 1月4日',
);
check('zh week range', formatWeekRange(week12), '3/16 – 3/22');

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
