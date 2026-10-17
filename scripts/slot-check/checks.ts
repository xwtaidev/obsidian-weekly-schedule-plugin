/**
 * Checks the rules of cells — the layout the user configures, the headings it
 * answers to, and what is refused. These are the ones a type cannot express:
 *
 * - every wording any version of this plugin has ever written still resolves to
 *   the cell it was written for, so an existing vault reads unchanged;
 * - a cell nobody renamed is written with the plugin's own wording, in the
 *   language of the file, which is what keeps saving byte-stable and stops the
 *   whole vault being judged modified the moment a new version opens it;
 * - a cell that was removed takes nothing with it: its wording resolves to the
 *   cell that took its work over, through any number of removals in between,
 *   and a layout holding one cell answers to all four wordings at once;
 * - a name the user typed is written the same in every language, while an
 *   unnamed cell follows the file's language;
 * - a layout that cannot be honoured — no cells, two cells sharing a key or a
 *   name, a removal pointing at nothing or looping — is refused, with one code
 *   per failure, in a fixed order;
 * - a stored settings object, whatever an older version or a hand-edit left in
 *   it, arrives as cells that can be used, with nothing lost that could be
 *   honoured and nothing shared with the defaults.
 *
 * Run with `npm run check:slots`. The Obsidian stand-in is shared with
 * `npm run check:i18n`.
 */
import { setStubLanguage } from '../i18n-check/obsidian-stub';
import {
	BUILT_IN_SLOTS,
	DEFAULT_SLOTS,
	LEGACY_QUADRANT_HEADINGS,
	SLOT_LIMITS,
	TONE_COUNT,
} from '../../src/constants';
import {
	DEFAULT_SLOT_LAYOUT,
	buildSlotLayout,
	nextSlot,
	nextSlotId,
	normalizeHeading,
	normalizeSlotConfig,
	retireHeading,
	retireSlot,
	slotHeading,
	validateSlots,
} from '../../src/slots';
import type { SlotLayout } from '../../src/slots';
import { syncLocale } from '../../src/i18n/index';
import { parseSchedule, rewriteSlotHeadings, serializeSchedule } from '../../src/markdown';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/settings';
import type { DayId, RetiredHeadings, RetiredSlots, Slot, WeekSchedule } from '../../src/types';

const WEEK_START = '2026-03-16';
const PATH = 'weekly-schedule/2026/2026-W12.md';

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

function cell(id: string, name: string | null = null, tone = 0): Slot {
	return { id, name, tone };
}

function layout(
	slots: readonly Slot[],
	retired: RetiredSlots = {},
	retiredHeadings: RetiredHeadings = {},
) {
	return buildSlotLayout(slots, retired, retiredHeadings);
}

/** The cell a heading belongs to, under the layout a vault starts with. */
function cellOfHeading(heading: string): string | null {
	return DEFAULT_SLOT_LAYOUT.heading(heading)?.id ?? null;
}

/** The four cells a day has, as `id:tone:name`, to compare a whole layout. */
function shape(slots: readonly Slot[]): string[] {
	return slots.map((slot) => `${slot.id}:${slot.tone}:${slot.name ?? '-'}`);
}

// --- the layout a vault starts with ---------------------------------------
check(
	'the default layout is the four quadrants, in the order the board drew them',
	shape(DEFAULT_SLOTS),
	['q1:0:-', 'q2:1:-', 'q3:2:-', 'q4:3:-'],
);
check(
	'the four the plugin ships keep the ids and colours they always had',
	BUILT_IN_SLOTS.map((slot) => `${slot.id}:${slot.tone}`),
	['q1:0', 'q2:1', 'q3:2', 'q4:3'],
);
check('the palette has room for more cells than ship', TONE_COUNT >= BUILT_IN_SLOTS.length, true);

// --- every wording ever written still resolves -----------------------------
check(
	'every legacy wording is in the reduced form the heading table is keyed by',
	LEGACY_QUADRANT_HEADINGS.filter(([wording]) => normalizeHeading(wording) !== wording).map(
		([wording]) => wording,
	),
	[],
);
for (const [wording, id] of LEGACY_QUADRANT_HEADINGS) {
	check(`legacy heading 「${wording}」 still names ${id}`, cellOfHeading(wording), id);
}
check(
	'the wordings the plugin derives for itself resolve too, in both languages',
	['Important · urgent', '重要 · 紧急', 'Unimportant · urgent', 'Important · not urgent'].map(
		cellOfHeading,
	),
	['q1', 'q1', 'q2', 'q3'],
);
check(
	'emphasis a hand-editor added does not stop a heading resolving',
	['**重要 · 紧急**', 'Important · urgent', 'IMPORTANT AND URGENT'].map(cellOfHeading),
	['q1', 'q1', 'q1'],
);
check(
	'a full-width space is a separator like any other',
	cellOfHeading('重要　紧急'),
	'q1',
);
check(
	'a wording in the other order is read by its words',
	['紧急 · 重要', 'urgent but unimportant', 'not urgent and unimportant', 'Not important · urgent'].map(
		cellOfHeading,
	),
	['q1', 'q2', 'q4', 'q2'],
);
check('a heading naming no cell resolves to nothing', cellOfHeading('随便写的一句'), null);
check('an empty heading resolves to nothing', cellOfHeading('   '), null);
// Widening on purpose: a cell with no wording of its own writes its id, so its
// id has to read back — otherwise a layout saved mid-edit would lose the week.
check('a cell answers to its own id as well as to its wording', cellOfHeading('q1'), 'q1');

// --- a name the user typed -------------------------------------------------
const named = layout([cell('q1', '深度工作'), cell('q2', '沟通'), cell('q3', '杂事')]);
check('a name the user typed resolves to that cell', named.heading('深度工作')?.id, 'q1');
check(
	'a name is matched the way a heading is reduced',
	named.heading('**深度工作**')?.id,
	'q1',
);
check(
	'the wording it replaced still resolves to the same cell',
	['重要 · 紧急', 'Important · urgent', '重要 紧急'].map((wording) => named.heading(wording)?.id),
	['q1', 'q1', 'q1'],
);
check(
	'each name resolves to the cell that was given it',
	['深度工作', '沟通', '杂事'].map((wording) => named.heading(wording)?.id),
	['q1', 'q2', 'q3'],
);

// --- a cell that was removed takes nothing with it -------------------------
const merged = layout(
	DEFAULT_SLOTS.filter((slot) => slot.id !== 'q3'),
	{ q3: 'q1' },
);
check('a removed cell is no longer a cell', merged.slots.some((slot) => slot.id === 'q3'), false);
check(
	'its wording resolves to the cell that took its work over',
	['重要 · 不紧急', 'Important · not urgent', '重要 不紧急'].map((wording) => merged.heading(wording)?.id),
	['q1', 'q1', 'q1'],
);
check(
	'the cell that took it over is reached by its own wording too',
	merged.heading('重要 · 紧急')?.id,
	'q1',
);
check(
	'a removal is followed to the end of the chain',
	layout([cell('q2'), cell('s1', '甲')], { q3: 'q1', q1: 'q2' }).resolve('q3'),
	'q2',
);
check(
	'a removal is followed across the cells the user added as well',
	layout([cell('s1', '甲')], { q3: 'q1', q1: 'q2', q2: 's1' }).resolve('q3'),
	's1',
);
check('a chain that ends nowhere resolves to nothing', layout([cell('s1', '甲')], { q3: 'q1' }).resolve('q3'), null);
check(
	'one cell answers to every wording the four ever had',
	['重要 · 紧急', '不重要 · 紧急', '重要 · 不紧急', '不重要 · 不紧急'].map(
		(wording) => layout([cell('q1')], { q2: 'q1', q3: 'q1', q4: 'q1' }).heading(wording)?.id,
	),
	['q1', 'q1', 'q1', 'q1'],
);

// --- what a cell was called is on file for ever, like where it went -------
// A cell of the user's own is written under the name they typed, and the id
// says nothing about those words. So removing or renaming one used to lose its
// weeks: the `### ` line named no cell, the tasks under it were read into
// nothing, and a week saved after that was saved without them.
const removedNamed = layout(DEFAULT_SLOTS, { s1: 'q1' }, { '格子 5': 's1' });
check(
	'a week written under the name of a removed cell reads into the cell that took it over',
	removedNamed.heading('格子 5')?.id,
	'q1',
);
check(
	'and one written under the id of a cell nobody named needs no name on file',
	layout(DEFAULT_SLOTS, { s1: 'q1' }).heading('s1')?.id,
	'q1',
);
check(
	'a former name that leads to no cell of the layout names nothing at all',
	layout(DEFAULT_SLOTS, {}, { '格子 5': 's1' }).heading('格子 5')?.id ?? null,
	null,
);
check(
	'a cell of the layout that answers to a name keeps it, whatever a removed cell was called once',
	layout([...DEFAULT_SLOTS, cell('s2', '格子 5', 4)], { s1: 'q1' }, { '格子 5': 's1' }).heading(
		'格子 5',
	)?.id,
	's2',
);

// The whole of the report: the tasks of a removed cell have to arrive in the
// cell that took them over, and stay there when the week is written again.
const weekUnderRemovedCell = `# 2026-W12

## 周一

### 重要 · 紧急
- [ ] 一件重要的事

### 格子 5
- [ ] 甲
- [ ] 乙
`;
const afterRemoval = parseSchedule(weekUnderRemovedCell, WEEK_START, PATH, removedNamed, 'zh');
check(
	'its tasks are read into the cell that took them over',
	afterRemoval.days
		.find((day) => day.id === 'mon')
		?.quadrants.find((quadrant) => quadrant.id === 'q1')
		?.tasks.map((task) => task.text),
	['一件重要的事', '甲', '乙'],
);
const rewritten = serializeSchedule(afterRemoval, removedNamed);
check('and the week is written again without the old heading', rewritten.includes('### 格子 5'), false);
check('with the work it now holds under the heading it now has', rewritten.split('\n').includes('- [ ] 甲'), true);

// Renaming one is the same loss, caught before it happens.
const renamed = layout([...DEFAULT_SLOTS, cell('s1', '读书', 4)], {}, { '格子 5': 's1' });
check('a renamed cell still reads the weeks written under its old name', renamed.heading('格子 5')?.id, 's1');
check('and answers to the name it has now', renamed.heading('读书')?.id, 's1');
check(
	'one wording is kept once, however it was spelled',
	Object.keys(retireHeading({ '格子·5': 's1' }, '格子 5', 's2')),
	['格子 5'],
);
check('a name of nothing but spaces is not a name', retireHeading({}, '   ', 's1'), {});

// What a settings file may say about them.
check(
	'a former name is read off a settings file, against the removals it resolves through',
	normalizeSlotConfig({
		slots: DEFAULT_SLOTS,
		retiredSlots: { s1: 'q1' },
		retiredHeadings: { '格子 5': 's1', 无主: 's9' },
	}).retiredHeadings,
	{ '格子 5': 's1' },
);
check(
	'a settings file written before names were kept reads as no names at all',
	normalizeSlotConfig({ slots: DEFAULT_SLOTS, retiredSlots: {} }).retiredHeadings,
	{},
);

// --- what a cell is written as --------------------------------------------
check(
	'a built-in cell follows the language of the file, not the interface',
	[slotHeading(DEFAULT_SLOT_LAYOUT, 'q1', 'en'), slotHeading(DEFAULT_SLOT_LAYOUT, 'q1', 'zh')],
	['Important · urgent', '重要 · 紧急'],
);
check(
	'a name the user typed is written the same in every language',
	[slotHeading(named, 'q1', 'en'), slotHeading(named, 'q1', 'zh')],
	['深度工作', '深度工作'],
);
check(
	'an unnamed cell of the user\'s own is written as its id',
	slotHeading(layout([cell('s1')]), 's1', 'zh'),
	's1',
);
check(
	'a cell outside the layout is written as its bare id rather than guessed at',
	slotHeading(DEFAULT_SLOT_LAYOUT, 'q9', 'zh'),
	'q9',
);

// --- the interface language is not an input -------------------------------
use('en');
const builtInEn = layout(DEFAULT_SLOTS, {});
use('zh');
const builtInZh = layout(DEFAULT_SLOTS, {});
check(
	'a layout resolves the same whatever the interface language is',
	[builtInEn.heading('重要 · 紧急')?.id, builtInZh.heading('重要 · 紧急')?.id],
	['q1', 'q1'],
);
check(
	'and the layout frozen at load time agrees with both',
	cellOfHeading('重要 · 紧急'),
	'q1',
);

// --- what is refused ------------------------------------------------------
check('the default layout is valid', validateSlots(DEFAULT_SLOTS, {}), []);
check(
	'a built-in cell may have its name cleared',
	validateSlots([cell('q1')], {}),
	[],
);
check('a layout with no cells is refused', validateSlots([], {}).includes('limitMin'), true);
check(
	'more cells than the board can lay out is refused',
	validateSlots(
		Array.from({ length: SLOT_LIMITS.max + 1 }, (_unused, index) => cell(`s${index + 1}`, `名${index + 1}`)),
		{},
	).includes('limitMax'),
	true,
);
check(
	'two cells sharing an id is refused',
	validateSlots([cell('s1', '甲'), cell('s1', '乙')], {}).includes('duplicateId'),
	true,
);
check(
	'a colour outside the palette is refused',
	validateSlots([cell('s1', '甲', TONE_COUNT)], {}).includes('unknown'),
	true,
);
check(
	'a cell of the user\'s own with no name at all is refused',
	validateSlots([cell('s1')], {}).includes('empty'),
	true,
);
check(
	'a name that is nothing but space is refused',
	validateSlots([cell('s1', '   ')], {}).includes('empty'),
	true,
);
check(
	'a name longer than the settings tab shows is refused',
	validateSlots([cell('s1', '长'.repeat(SLOT_LIMITS.nameMax + 1))], {}).includes('tooLong'),
	true,
);
check(
	'a name a heading line cannot carry is refused',
	[
		['上\n下', 'newline'],
		['深度#工作', 'hash'],
		['- 深度工作', 'bullet'],
		['> 深度工作', 'quote'],
		['| 深度工作', 'table'],
		['1. 深度工作', 'list number'],
	].map(([name]) => validateSlots([cell('s1', name ?? '')], {}).includes('invalid')),
	[true, true, true, true, true, true],
);
check(
	'a name that only has emphasis in it is still usable',
	validateSlots([cell('s1', '*深度*工作')], {}),
	[],
);
check(
	'two cells sharing a name is refused',
	validateSlots([cell('s1', '深度工作'), cell('s2', '深度工作')], {}).includes('duplicate'),
	true,
);
check(
	'two cells whose names reduce to the same words is refused',
	validateSlots([cell('s1', '深度 · 工作'), cell('s2', '深度 工作')], {}).includes('duplicate'),
	true,
);
check(
	'a name the plugin already uses is refused',
	['重要 · 紧急', 'urgent but not important', '周一', 'Review', '计划'].map((name) =>
		validateSlots([cell('s1', name)], {}).includes('reserved'),
	),
	[true, true, true, true, true],
);
check(
	'a name the user is free to take is not reserved',
	validateSlots([cell('s1', '深度工作')], {}),
	[],
);
check(
	'a removal pointing at a cell that is neither here nor on file is refused',
	validateSlots([cell('s1', '甲')], { q1: 's9' }).includes('dangling'),
	true,
);
check(
	'removals that point at each other are refused',
	validateSlots([cell('s1', '甲')], { q1: 'q2', q2: 'q1' }).includes('cycle'),
	true,
);
check(
	'a removal onto a cell that is still here is not a loop',
	validateSlots([cell('q1')], { q2: 'q1' }).includes('cycle'),
	false,
);
check(
	'one code per failure, whatever caused it',
	validateSlots([cell('s1'), cell('s2')], {}),
	['empty'],
);
check(
	'failures that break the layout itself are reported before a cell\'s',
	validateSlots([], { q1: 'q9' }),
	['limitMin', 'dangling'],
);
check(
	'every code is reported in the order they are declared',
	validateSlots([cell('s1', '重要 · 紧急', TONE_COUNT)], { q1: 'q9' }),
	['unknown', 'dangling', 'reserved'],
);

// --- the id the next cell gets --------------------------------------------
check('the next id avoids the ids in use', nextSlotId([cell('s1', '甲')], {}), 's2');
check(
	'the next id skips ids that were retired, so one is never handed out twice',
	nextSlotId([cell('q1')], { q2: 'q1', q3: 'q1' }),
	's1',
);
check(
	'adding a cell after the four built-ins gets a free id',
	nextSlotId(DEFAULT_SLOTS, {}),
	's1',
);

// --- the cell a user adds, and the one they remove --------------------------
// Both are done by the settings tab, which is a page of fields and buttons and
// cannot be checked without a page. What is checked here is the part that would
// be wrong silently: the new cell's key, its colour, and its name not colliding
// with a name already in use; and a removal leaving a record that still reads
// every week written before it.

const nameFor = (count: number): string => `格子 ${count}`;
check(
	'a cell added to the four built-ins is the fifth cell: new key, next colour',
	nextSlot(DEFAULT_SLOTS, {}, nameFor),
	{ id: 's1', name: '格子 5', tone: 4 },
);
check(
	'... and a name already in use is stepped over rather than repeated',
	nextSlot([cell('q1', '格子 5'), cell('q2'), cell('q3'), cell('q4')], {}, nameFor),
	{ id: 's1', name: '格子 6', tone: 4 },
);
check(
	'... and wording that never changes with the count stops rather than spinning',
	validateSlots([cell('q1', '甲'), nextSlot([cell('q1', '甲')], {}, () => '甲')], {}),
	['duplicate'],
);
check(
	'a cell added to a layout of one is the second, in the second colour',
	nextSlot([cell('q1')], { q2: 'q1' }, nameFor),
	{ id: 's1', name: '格子 2', tone: 1 },
);

check(
	'removing a cell points the removed one at whoever took the work over',
	retireSlot({}, 'q3', 'q1'),
	{ q3: 'q1' },
);
check(
	'... and anything that already pointed at it is shortened to the same answer',
	retireSlot({ q3: 'q1', q4: 'q1' }, 'q1', 'q2'),
	{ q3: 'q2', q4: 'q2', q1: 'q2' },
);
check(
	'... with a removal that has nothing to do with it left exactly as it was',
	retireSlot({ q4: 'q1' }, 'q3', 'q1'),
	{ q4: 'q1', q3: 'q1' },
);
check(
	'... and a removal made this way is one the layout accepts',
	validateSlots([cell('q1'), cell('q2')], retireSlot({ q3: 'q1', q4: 'q1' }, 'q1', 'q2')),
	[],
);
check(
	'... and every wording of a twice-removed cell still resolves, to the one that holds it',
	layout([cell('q2')], retireSlot({ q3: 'q1', q4: 'q1' }, 'q1', 'q2')).heading('重要 · 不紧急')?.id,
	'q2',
);

// --- reading and writing a whole week -------------------------------------
// The layout is not a display concern: it decides which heading a task is
// written under and which cell a heading is read into, so a week read and
// written by the same layout has to come back as the bytes it went out as. The
// store decides whether a week has local edits by comparing exactly that, so a
// layout that did not round-trip would have every week rewritten on open.

function read(content: string, week: SlotLayout): WeekSchedule {
	return parseSchedule(content, WEEK_START, PATH, week);
}

function save(schedule: WeekSchedule, week: SlotLayout): string {
	return serializeSchedule(schedule, week);
}

/** Tasks of one cell as `done:text`, so a check can compare the whole cell. */
function tasks(schedule: WeekSchedule, day: DayId, id: string): string[] {
	return (
		schedule.days.find((item) => item.id === day)?.quadrants.find((item) => item.id === id)
			?.tasks ?? []
	).map((task) => `${task.done ? 'x' : ' '}:${task.text}`);
}

/** Every task of the week, whatever cell it sits in. */
function allTasks(schedule: WeekSchedule): string[] {
	return schedule.days.flatMap((day) =>
		day.quadrants.flatMap((quadrant) => quadrant.tasks.map((task) => task.text)),
	);
}

/** A four-cell week in each language, as an older version of this plugin wrote it. */
const FOUR_CELLS_ZH =
	'# 2026-W12\n\n## 周一\n\n### 重要 · 紧急\n- [ ] A\n\n### 不重要 · 紧急\n- [ ] B\n\n### 重要 · 不紧急\n- [ ] C\n\n### 不重要 · 不紧急\n- [ ] D\n';
const FOUR_CELLS_EN =
	'# 2026-W12\n\n## Monday\n\n### Important · urgent\n- [ ] A\n\n### Unimportant · urgent\n- [ ] B\n\n### Important · not urgent\n- [ ] C\n\n### Unimportant · not urgent\n- [ ] D\n';

check(
	'a four-cell week in zh reads and writes back byte for byte',
	save(read(FOUR_CELLS_ZH, DEFAULT_SLOT_LAYOUT), DEFAULT_SLOT_LAYOUT),
	FOUR_CELLS_ZH,
);
check(
	'a four-cell week in en reads and writes back byte for byte',
	save(read(FOUR_CELLS_EN, DEFAULT_SLOT_LAYOUT), DEFAULT_SLOT_LAYOUT),
	FOUR_CELLS_EN,
);

// A week the plugin wrote in a wording it has since stopped using reads into the
// right cell, and settles on the wording it uses now after one save.
for (const [wording, id] of LEGACY_QUADRANT_HEADINGS) {
	const raw = `# 2026-W12\n\n## 周一\n\n### ${wording}\n- [ ] A\n`;
	const once = save(read(raw, DEFAULT_SLOT_LAYOUT), DEFAULT_SLOT_LAYOUT);
	check(
		`a week written as 「${wording}」 still reads into ${id}`,
		tasks(read(raw, DEFAULT_SLOT_LAYOUT), 'mon', id),
		[' :A'],
	);
	check(
		`... and settles once it is saved again`,
		save(read(once, DEFAULT_SLOT_LAYOUT), DEFAULT_SLOT_LAYOUT),
		once,
	);
}

// Removing cells folds their work into the cells that took it over. The count is
// the assertion that matters: a heading that stopped resolving would take the
// tasks under it with it, and nothing would ever say so.
const TWO_CELLS = layout([cell('q1'), cell('q2')], { q3: 'q2', q4: 'q2' });
check(
	'two cells read all four cells of an older week, and keep every task',
	allTasks(read(FOUR_CELLS_ZH, TWO_CELLS)),
	['A', 'B', 'C', 'D'],
);
check(
	'... with the work of the removed cells folded into the one that took it over',
	tasks(read(FOUR_CELLS_ZH, TWO_CELLS), 'mon', 'q2'),
	[' :B', ' :C', ' :D'],
);

const ONE_CELL = layout([cell('q1')], { q2: 'q1', q3: 'q1', q4: 'q1' });
check(
	'a week of one cell reads all four cells of an older week, and keeps every task',
	allTasks(read(FOUR_CELLS_ZH, ONE_CELL)),
	['A', 'B', 'C', 'D'],
);
check(
	'... all of it in the only cell there is',
	tasks(read(FOUR_CELLS_ZH, ONE_CELL), 'mon', 'q1'),
	[' :A', ' :B', ' :C', ' :D'],
);
check(
	'... and a day has as many cells as the layout holds',
	read('', ONE_CELL).days.map((day) => day.quadrants.length),
	[1, 1, 1, 1, 1, 1, 1],
);
check(
	'eight cells are eight cells on every day',
	read('', layout(Array.from({ length: 8 }, (_unused, index) => cell(`s${index + 1}`, `格${index + 1}`, index))))
		.days.map((day) => day.quadrants.length),
	[8, 8, 8, 8, 8, 8, 8],
);

// A week the user's own layout wrote comes back as it went out — the promise the
// whole feature rests on, in the shape a configured vault actually has.
const RENAMED = layout([cell('q1', '深度工作'), cell('q2', '沟通')]);
const RENAMED_FILE = '# 2026-W12\n\n## 周一\n\n### 深度工作\n- [ ] A\n\n### 沟通\n- [ ] B\n';
check(
	'a week in a layout the user named reads and writes back byte for byte',
	save(read(RENAMED_FILE, RENAMED), RENAMED),
	RENAMED_FILE,
);
check(
	'... and the tasks are in the cells they were written under',
	[tasks(read(RENAMED_FILE, RENAMED), 'mon', 'q1'), tasks(read(RENAMED_FILE, RENAMED), 'mon', 'q2')],
	[[' :A'], [' :B']],
);

use('en');
const namedFromEn = save(read(RENAMED_FILE, RENAMED), RENAMED);
use('zh');
const namedFromZh = save(read(RENAMED_FILE, RENAMED), RENAMED);
check(
	'a cell the user named is written the same whatever the interface language is',
	[namedFromEn === namedFromZh, namedFromZh.includes('### 深度工作')],
	[true, true],
);

// The other half of that rule: a cell nobody renamed goes on being written in
// the language of the file it is in, which is what keeps the four built-ins
// byte-stable for a vault that never configures anything.
use('zh');
check(
	'an unnamed cell follows the language of the file, not the interface',
	save(read(FOUR_CELLS_EN, DEFAULT_SLOT_LAYOUT), DEFAULT_SLOT_LAYOUT),
	FOUR_CELLS_EN,
);
use('en');
check(
	'... and follows it the other way round too',
	save(read(FOUR_CELLS_ZH, DEFAULT_SLOT_LAYOUT), DEFAULT_SLOT_LAYOUT),
	FOUR_CELLS_ZH,
);

const REORDERED = layout([cell('q2'), cell('q1')]);
const reorderedText = save(read(FOUR_CELLS_ZH, REORDERED), REORDERED);
check(
	'cells are written in the order the layout holds them',
	reorderedText.indexOf('### 不重要 · 紧急') < reorderedText.indexOf('### 重要 · 紧急'),
	true,
);

// --- what a stored settings object is allowed to say -----------------------
// A settings file is data rather than code: it can be older than the fields
// being read out of it, written by hand, or left half written. These are the
// rules that turn whatever it holds into cells that can be used — and the point
// of every one of them is that nothing which *can* be honoured is dropped.

check(
	'a settings object with no cells in it gets the four the plugin ships with',
	shape(normalizeSlotConfig({}).slots),
	['q1:0:-', 'q2:1:-', 'q3:2:-', 'q4:3:-'],
);
check(
	'... and an old settings file, which has no such field at all, is the same thing',
	shape(normalizeSlotConfig({ folder: 'weekly-schedule', weekStartsOn: 1, taskCommitKey: 'enter' }).slots),
	['q1:0:-', 'q2:1:-', 'q3:2:-', 'q4:3:-'],
);
check(
	'... as is a file whose cells are not a list at all',
	['nonsense', 42, null, []].map((value) => shape(normalizeSlotConfig({ slots: value }).slots)),
	[
		['q1:0:-', 'q2:1:-', 'q3:2:-', 'q4:3:-'],
		['q1:0:-', 'q2:1:-', 'q3:2:-', 'q4:3:-'],
		['q1:0:-', 'q2:1:-', 'q3:2:-', 'q4:3:-'],
		['q1:0:-', 'q2:1:-', 'q3:2:-', 'q4:3:-'],
	],
);

// The trap this whole function exists for: `Object.assign({}, DEFAULT_SETTINGS,
// loaded)` would have handed the defaults themselves to whoever asked, so one
// pane editing a cell would have edited it for every pane, for every later
// load, and for the rest of the session.
const fallbackA = normalizeSlotConfig({}).slots;
const fallbackB = normalizeSlotConfig({}).slots;
check(
	'the four defaults are copied, not handed out',
	[fallbackA === DEFAULT_SLOTS, fallbackA[0] === DEFAULT_SLOTS[0], fallbackA === fallbackB],
	[false, false, false],
);
fallbackA[0].name = '深度工作';
fallbackA.push(cell('s1', '甲'));
check(
	'... so editing what was loaded leaves the defaults as they were',
	[shape(DEFAULT_SLOTS), DEFAULT_SLOTS.length],
	[
		['q1:0:-', 'q2:1:-', 'q3:2:-', 'q4:3:-'],
		4,
	],
);

check(
	'an entry that is not a cell is dropped and the rest are kept',
	[shape(normalizeSlotConfig({ slots: [cell('q1'), null, 'x', cell('q2', '沟通'), 42] }).slots)],
	[['q1:0:-', 'q2:0:沟通']],
);
check(
	'a cell without an id is not a cell, and the ones with ids are unaffected',
	shape(normalizeSlotConfig({ slots: [{ name: '深' }, { id: '   ' }, cell('s1', '甲', 4)] }).slots),
	['s1:4:甲'],
);
check(
	'a stored id is trimmed, so a stray space cannot make it unreachable',
	shape(normalizeSlotConfig({ slots: [{ id: ' q1 ', name: null, tone: 0 }] }).slots),
	['q1:0:-'],
);
check(
	'of two cells sharing an id the first is the cell',
	shape(normalizeSlotConfig({ slots: [cell('q1', '甲'), cell('q1', '乙')] }).slots),
	['q1:0:甲'],
);
check(
	'a colour the palette has is kept, whatever position the cell is in',
	shape(normalizeSlotConfig({ slots: [cell('s1', '甲', 5), cell('s2', '乙', 0)] }).slots),
	['s1:5:甲', 's2:0:乙'],
);
check(
	'a colour the palette does not have becomes the cell\'s own position',
	normalizeSlotConfig({
		slots: [cell('q1', null, 99), cell('q2', null, -1), cell('q3', null, 1.5), cell('q4', null, 'red')],
	}).slots.map((slot) => slot.tone),
	[0, 1, 2, 3],
);
check(
	'a name is trimmed, and one of nothing but spaces is no name at all',
	normalizeSlotConfig({
		slots: [
			{ id: 's1', name: '  深度工作  ', tone: 0 },
			{ id: 's2', name: '   ', tone: 1 },
			{ id: 'q1', name: 42, tone: 2 },
		],
	}).slots.map((slot) => slot.name),
	['深度工作', null, null],
);
check(
	'settings that hold nothing usable still leave a board that can be drawn',
	normalizeSlotConfig({ slots: [], retiredSlots: 'nonsense' }),
	{ slots: normalizeSlotConfig({}).slots, retiredSlots: {}, retiredHeadings: {} },
);

// A removal is read by following it to a cell the layout has, so a removal that
// never arrives there is reading nothing either way; keeping it would only stop
// the id being handed out again.
check(
	'a removal that still leads to a cell is kept as it stands',
	normalizeSlotConfig({ slots: [cell('q2')], retiredSlots: { q3: 'q1', q1: 'q2' } }).retiredSlots,
	{ q3: 'q1', q1: 'q2' },
);
check(
	'a removal pointing at nothing is dropped, and one pointing at a cell is not',
	normalizeSlotConfig({ slots: [cell('s1', '甲')], retiredSlots: { q1: 'q2', q3: 's1', q4: 'q9' } })
		.retiredSlots,
	{ q3: 's1' },
);
check(
	'two removals pointing at each other are both dropped',
	normalizeSlotConfig({ slots: [cell('s1', '甲')], retiredSlots: { q1: 'q2', q2: 'q1', q3: 's1' } })
		.retiredSlots,
	{ q3: 's1' },
);
check(
	'a removal that points at itself leads nowhere',
	normalizeSlotConfig({ slots: [cell('s1', '甲')], retiredSlots: { q4: 'q4', q3: 's1' } })
		.retiredSlots,
	{ q3: 's1' },
);
check(
	'a removal whose id is a cell again can never be read, so it goes',
	normalizeSlotConfig({ slots: [cell('q1'), cell('q2')], retiredSlots: { q2: 'q1', q3: 'q1' } })
		.retiredSlots,
	{ q3: 'q1' },
);
check(
	'a removal is judged against the cells that survived, not the ones asked for',
	normalizeSlotConfig({ slots: [cell('q1'), cell('q1', '乙')], retiredSlots: { q2: 's9', q3: 'q1' } })
		.retiredSlots,
	{ q3: 'q1' },
);
check(
	'a settings file with no removals at all is not an error',
	[
		normalizeSlotConfig({}).retiredSlots,
		normalizeSlotConfig({ retiredSlots: null }).retiredSlots,
		normalizeSlotConfig({ retiredSlots: { q1: 42 } }).retiredSlots,
	],
	[{}, {}, {}],
);

// The claim the whole feature rests on, made about the shape an upgrading vault
// actually has: a settings file written before cells were configurable.
const UPGRADED = (() => {
	const { slots, retiredSlots } = normalizeSlotConfig({
		folder: 'weekly-schedule',
		weekStartsOn: 1,
		taskCommitKey: 'enter',
	});
	return buildSlotLayout(slots, retiredSlots);
})();
check(
	'a vault that upgrades and configures nothing reads a week as the bytes it has',
	save(read(FOUR_CELLS_ZH, UPGRADED), UPGRADED),
	FOUR_CELLS_ZH,
);
check(
	'... in either language, and in the older wordings it wrote itself',
	[
		save(read(FOUR_CELLS_EN, UPGRADED), UPGRADED) === FOUR_CELLS_EN,
		[
			'重要 紧急',
			'urgent and important',
			'not important but urgent',
			'重要 · 不紧急',
		].map((wording) =>
			UPGRADED.heading(wording)?.id,
		),
	],
	[true, ['q1', 'q1', 'q2', 'q3']],
);

// A configured vault, read through the same path the plugin uses to load it.
const CONFIGURED = (() => {
	const { slots, retiredSlots } = normalizeSlotConfig({
		slots: [
			{ id: 'q1', name: ' 深度工作 ', tone: 99 },
			{ id: 'q3', name: '杂事', tone: 1 },
		],
		retiredSlots: { q2: 'q1', q4: 'q3', q9: 'nope' },
	});
	return { slots, retiredSlots, layout: buildSlotLayout(slots, retiredSlots) };
})();
check(
	'a configured vault loads as the cells it describes',
	[shape(CONFIGURED.slots), CONFIGURED.retiredSlots],
	[['q1:0:深度工作', 'q3:1:杂事'], { q2: 'q1', q4: 'q3' }],
);
check(
	'... and reads every task of a four-cell week into one of them',
	allTasks(read(FOUR_CELLS_ZH, CONFIGURED.layout)),
	['A', 'B', 'C', 'D'],
);
check(
	'... with the wording each cell answers to now',
	['深度工作', '杂事'].map((wording) => CONFIGURED.layout.heading(wording)?.id),
	['q1', 'q3'],
);

// --- the same rules, reached the way the plugin reaches them ----------------
// `normalizeSettings` is what `loadSettings` calls, and it stands where a
// shallow `Object.assign({}, DEFAULT_SETTINGS, loaded)` used to. That assign
// would have handed out the defaults themselves: `slots` is an array, so the
// settings a vault loaded and the defaults it fell back to would have been the
// same array, and one pane editing a cell would have edited it for every pane,
// for every vault loaded later in that session, and for the rest of the run.
// The mutation below is the tripwire — it leaves the defaults alone only if the
// cells were copied.

const loadedOnce = normalizeSettings(undefined);
const loadedTwice = normalizeSettings(null);
check(
	'a store with nothing in it loads as the four built-in cells',
	shape(loadedOnce.slots),
	['q1:0:-', 'q2:1:-', 'q3:2:-', 'q4:3:-'],
);
check(
	'... and so does a data.json from before cells were configurable',
	shape(
		normalizeSettings(
			JSON.parse('{"folder":"weekly-schedule","weekStartsOn":1,"taskCommitKey":"enter"}'),
		).slots,
	),
	['q1:0:-', 'q2:1:-', 'q3:2:-', 'q4:3:-'],
);
check(
	'... and a file whose cells are nonsense loads as the four rather than refusing to load',
	shape(normalizeSettings({ slots: 'nonsense', retiredSlots: 42 }).slots),
	['q1:0:-', 'q2:1:-', 'q3:2:-', 'q4:3:-'],
);
check(
	'two loads are two sets of cells, and neither is the default',
	[
		loadedOnce.slots === loadedTwice.slots,
		loadedOnce.slots === DEFAULT_SETTINGS.slots,
		loadedOnce.slots[0] === DEFAULT_SLOTS[0],
	],
	[false, false, false],
);
loadedOnce.slots[0].name = '深度工作';
loadedOnce.slots.push(cell('s1', '甲'));
check(
	'... so editing what a vault loaded leaves the defaults as they were',
	[shape(DEFAULT_SETTINGS.slots), DEFAULT_SLOTS.length],
	[
		['q1:0:-', 'q2:1:-', 'q3:2:-', 'q4:3:-'],
		4,
	],
);
check(
	'a stored setting of the right type is kept, and zero is a value',
	[
		normalizeSettings({ folder: 'work/weeks' }).folder,
		normalizeSettings({ weekStartsOn: 0 }).weekStartsOn,
		normalizeSettings({ taskCommitKey: 'shiftEnter' }).taskCommitKey,
	],
	['work/weeks', 0, 'shiftEnter'],
);
check(
	'a stored setting of the wrong type falls back rather than being trusted',
	[
		normalizeSettings({ folder: 42 }).folder,
		normalizeSettings({ weekStartsOn: 'x' }).weekStartsOn,
		normalizeSettings({ taskCommitKey: 'tab' }).taskCommitKey,
	],
	[DEFAULT_SETTINGS.folder, DEFAULT_SETTINGS.weekStartsOn, DEFAULT_SETTINGS.taskCommitKey],
);

// --- bringing a vault's headings up to date ---------------------------------
// The one operation that rewrites a file the user did not open. It is offered
// rather than needed — a week written before a cell was renamed goes on being
// read correctly — so the assertions are about what it must *not* touch: every
// line but a cell heading, every heading that stands outside a day, and the
// work under them all.

/** The lines two texts disagree on, as `line: before -> after`. */
function differingLines(before: string, after: string): string[] {
	const a = before.split('\n');
	const b = after.split('\n');
	const differences: string[] = [];
	for (let at = 0; at < Math.max(a.length, b.length); at += 1) {
		if (a[at] !== b[at]) {
			differences.push(
				`${at + 1}: ${JSON.stringify(a[at] ?? '<eof>')} -> ${JSON.stringify(b[at] ?? '<eof>')}`,
			);
		}
	}
	return differences;
}

const alignedZh = rewriteSlotHeadings(FOUR_CELLS_ZH, DEFAULT_SLOT_LAYOUT, 'zh');
const alignedEn = rewriteSlotHeadings(FOUR_CELLS_EN, DEFAULT_SLOT_LAYOUT, 'en');
check(
	'a week that already names its cells the way the layout does is left byte for byte',
	[
		[alignedZh.text === FOUR_CELLS_ZH, alignedZh.changed],
		[alignedEn.text === FOUR_CELLS_EN, alignedEn.changed],
	],
	[
		[true, 0],
		[true, 0],
	],
);

// One cell left, and everything folded into it. The week below carries the three
// kinds of `### ` line that are not a cell of a day: one under the review, one
// under a `##` that names no day, and one no cell answers to.
const MERGED = layout([cell('q3', '杂事')], { q1: 'q3', q2: 'q3', q4: 'q3' });
const STALE_WEEK =
	'# 2026-W12\n\n## 周一\n\n### 重要 · 紧急\n- [ ] A\n\n### 不重要 · 紧急\n- [ ] B\n\n### 不认得的标题\n这不是任务\n\n## 复盘\n\n### 重要 · 不紧急\n- 一句话\n';
const staleAligned = rewriteSlotHeadings(STALE_WEEK, MERGED, 'zh');

check(
	'aligning a week renames its cell headings and nothing else',
	[differingLines(STALE_WEEK, staleAligned.text), staleAligned.changed],
	[
		['5: "### 重要 · 紧急" -> "### 杂事"', '8: "### 不重要 · 紧急" -> "### 杂事"'],
		2,
	],
);
check(
	'... leaving a heading under the review alone, even where a cell answers to it',
	staleAligned.text.includes('### 重要 · 不紧急'),
	true,
);
check(
	'... and leaving a heading no cell answers to alone as well',
	staleAligned.text.includes('### 不认得的标题'),
	true,
);
check(
	'... with the work of the week untouched, in the cell that answers for it now',
	[allTasks(read(staleAligned.text, MERGED)), tasks(read(staleAligned.text, MERGED), 'mon', 'q3')],
	[['A', 'B'], [' :A', ' :B']],
);

const staleTwice = rewriteSlotHeadings(staleAligned.text, MERGED, 'zh');
check(
	'aligning a week twice is aligning it once',
	[staleTwice.text === staleAligned.text, staleTwice.changed],
	[true, 0],
);

const NOT_A_WEEK =
	'---\ntags: [week]\n---\n\n# 2026-W12\n\n## 周一\n\n### 重要 · 紧急\n- [ ] A\n\n## 随笔\n\n### 重要 · 不紧急\n- 不是任务\n';
const notAWeekAligned = rewriteSlotHeadings(NOT_A_WEEK, MERGED, 'zh');
check(
	'a heading under a `##` that names no day is not a cell, and is left alone',
	[differingLines(NOT_A_WEEK, notAWeekAligned.text), notAWeekAligned.changed],
	[['9: "### 重要 · 紧急" -> "### 杂事"'], 1],
);

use('en');
const alignedForEn = rewriteSlotHeadings(FOUR_CELLS_EN, DEFAULT_SLOT_LAYOUT, 'zh');
use('zh');
check(
	'a week is renamed in the language it is written in, whatever the interface says',
	alignedForEn.text.includes('### 重要 · 紧急'),
	true,
);

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
