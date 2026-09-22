/**
 * Checks the localization rules that a type cannot express:
 *
 * - an existing file keeps the heading language it was written in, and saving it
 *   after the interface language changed does not translate it;
 * - a new file follows the interface language;
 * - a file written in any supported language — or in the wording this plugin
 *   used before it was translated — still parses;
 * - dates, plurals and notices read correctly in both languages.
 *
 * Run with `npm run check:i18n`.
 */
import { moment, setStubLanguage } from './obsidian-stub';
import { parseSchedule, serializeSchedule } from '../../src/markdown';
import { formatWeekLabel, formatWeekRange } from '../../src/i18n/format';
import { getLocale, quadrantParts, syncLocale, t, tp } from '../../src/i18n/index';
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
	['migrate.result', 'migrate.pendingFiles', 'migrate.movedFiles', 'year.weeksDone', 'year.tasksTotal', 'board.stats.tasks'].filter(
		(key) => !(en as Record<string, string>)[key]?.includes('|'),
	),
	[],
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
const newEn = parseSchedule('', WEEK_START, PATH);
fill(newEn, 'mon', 'q1', 'Ship it');
const textEn = serializeSchedule(newEn);
check('new file in en: day heading', textEn.includes('## Monday'), true);
check('new file in en: quadrant heading', textEn.includes('### Important · urgent'), true);
check('new file in en: checkbox syntax kept', textEn.includes('- [ ] Ship it'), true);
check('new file in en: file language', newEn.locale, 'en');

use('zh');
const newZh = parseSchedule('', WEEK_START, PATH);
fill(newZh, 'mon', 'q1', '交周报');
fill(newZh, 'mon', 'q1', '修线上 bug', true);
fill(newZh, 'tue', 'q2', '回复邮件');
const textZh = serializeSchedule(newZh);
check('new file in zh: day heading', textZh.includes('## 周一'), true);
check('new file in zh: quadrant heading', textZh.includes('### 重要 · 紧急'), true);
check('new file in zh: file language', newZh.locale, 'zh');
check(
	'an empty week writes no headings to translate',
	serializeSchedule(parseSchedule('', WEEK_START, PATH)),
	'# 2026-W12\n',
);

// --- an existing file keeps the language it was written in ----------------
use('en');
const reloadedZh = parseSchedule(textZh, WEEK_START, PATH);
check('existing zh file is read as zh', reloadedZh.locale, 'zh');
check('existing zh tasks survive', tasks(reloadedZh, 'mon', 'q1'), [' :交周报', 'x:修线上 bug']);
check('existing zh tasks survive on another day', tasks(reloadedZh, 'tue', 'q2'), [' :回复邮件']);
check('saving after a switch to en keeps zh wording', serializeSchedule(reloadedZh), textZh);
check('reading and writing is idempotent', serializeSchedule(parseSchedule(textZh, WEEK_START, PATH)), textZh);

use('zh');
const reloadedEn = parseSchedule(textEn, WEEK_START, PATH);
check('existing en file is read as en', reloadedEn.locale, 'en');
check('saving after a switch to zh keeps en wording', serializeSchedule(reloadedEn), textEn);

// --- hand-edited and legacy files -----------------------------------------
use('en');
const legacyZh =
	'# 2026-W12\n\n## 周一\n\n### 重要 紧急\n- [ ] A\n\n### 不重要 不紧急\n- [ ] B\n\n## 周五\n\n### 紧急 · 重要\n- [x] C\n';
const legacy = parseSchedule(legacyZh, WEEK_START, PATH);
check('zh heading without a separator maps to q1', tasks(legacy, 'mon', 'q1'), [' :A']);
check('zh heading without a separator maps to q4', tasks(legacy, 'mon', 'q4'), [' :B']);
check('zh word order is read by keyword', tasks(legacy, 'fri', 'q1'), ['x:C']);
check('legacy zh file keeps its wording', serializeSchedule(legacy).includes('## 周一'), true);

const legacyEn =
	'## Monday\n\n### urgent but not important\n- [ ] D\n\n### something else entirely\n- [ ] E\n';
const legacyEnSchedule = parseSchedule(legacyEn, WEEK_START, PATH);
check('legacy en wording maps to q2', tasks(legacyEnSchedule, 'mon', 'q2'), [' :D']);
check(
	'an unrecognized heading closes the cell instead of guessing',
	serializeSchedule(legacyEnSchedule).includes('- [ ] E'),
	false,
);
check('legacy en file is read as en', legacyEnSchedule.locale, 'en');

const idFile = parseSchedule('## tue\n\n### Important · not urgent\n- [ ] F\n', WEEK_START, PATH);
check('a bare day id is accepted', tasks(idFile, 'tue', 'q3'), [' :F']);

// --- a language switch while the board is open ----------------------------
use('zh');
const openBoard = parseSchedule('', WEEK_START, PATH);
fill(openBoard, 'wed', 'q3', '写文档');
const writtenBeforeSwitch = serializeSchedule(openBoard);
use('en');
check(
	'a switch does not translate what is already loaded',
	serializeSchedule(openBoard),
	writtenBeforeSwitch,
);
const afterSwitch = parseSchedule('', WEEK_START, PATH);
fill(afterSwitch, 'wed', 'q3', 'Write docs');
check(
	'a switch does change what a new file is written with',
	serializeSchedule(afterSwitch).includes('## Wednesday'),
	true,
);

// --- wording --------------------------------------------------------------
use('en');
check('en day label', t('day.wed'), 'Wednesday');
check('en quadrant parts', quadrantParts(true, false), ['Important', 'not urgent']);
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
