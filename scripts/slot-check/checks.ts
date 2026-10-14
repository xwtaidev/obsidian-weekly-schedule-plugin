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
 *   per failure, in a fixed order.
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
	nextSlotId,
	normalizeHeading,
	slotHeading,
	validateSlots,
} from '../../src/slots';
import { syncLocale } from '../../src/i18n/index';
import type { RetiredSlots, Slot } from '../../src/types';

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

function layout(slots: readonly Slot[], retired: RetiredSlots = {}) {
	return buildSlotLayout(slots, retired);
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
	['Important · urgent', '重要 · 紧急', 'Not important · urgent', 'Important · not urgent'].map(
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
	['紧急 · 重要', 'urgent but unimportant', 'not urgent and unimportant'].map(cellOfHeading),
	['q1', 'q2', 'q4'],
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

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
