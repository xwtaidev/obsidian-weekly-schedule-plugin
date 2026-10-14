/**
 * Cells: which cells a day has, what each one answers to in a file, and where
 * the work of a cell that was removed ends up.
 *
 * A cell is recognized by its *heading* — the `### ` line above its tasks — and
 * nothing else is stored in a week's file. So the whole of this module is one
 * question asked twice: given a heading, which cell is that; and given a cell,
 * what heading does it get. Both answers come from the layout, which is the
 * user's list of cells plus the record of the ones they removed.
 *
 * Two rules hold it together, and both exist to keep an existing vault intact:
 *
 * - A cell nobody renamed is written with the wording the plugin derives for
 *   one of its own quadrants, in the language of the file being written. That
 *   is why a vault that upgrades and configures nothing reads and writes the
 *   same bytes it always did — and `serializeSchedule` staying byte-stable is
 *   what stops every week being judged modified and rewritten.
 * - Every heading any version of this plugin has ever written keeps resolving,
 *   including the wordings used before it was translated, and including cells
 *   that are no longer in the layout: the heading names an id, and the id is
 *   still on file as having been taken over by another cell.
 *
 * Pure: no Obsidian, no disk, no current-language lookups that the caller does
 * not pass in. `npm run check:slots` holds it to that.
 */
import {
	BUILT_IN_SLOTS,
	DAY_IDS,
	DEFAULT_SLOTS,
	LEGACY_QUADRANT_HEADINGS,
	REVIEW_SECTIONS,
	SLOT_LIMITS,
	TONE_COUNT,
} from './constants';
import {
	QUADRANT_SEPARATOR,
	SUPPORTED_LOCALES,
	dayLabel,
	quadrantParts,
	reviewSectionLabel,
	reviewTitle,
} from './i18n';
import { isRecord } from './utils/helpers';
import type { Locale } from './i18n';
import type { BuiltInSlot, QuadrantId, RetiredSlots, Slot } from './types';

/**
 * A heading reduced to what two spellings of the same thing agree on: the
 * emphasis a hand-editor may have added taken off, every kind of separator
 * turned into a space, and the case flattened.
 *
 * Moved here from the Markdown module when the heading table stopped being a
 * fixed four: the table and the lookups have to reduce a heading the same way,
 * and there is now a second caller (the whole-vault alignment) that must not
 * reduce it differently.
 */
export function normalizeHeading(text: string): string {
	return text
		.replace(/[*_`]/g, '')
		.replace(/[·・•]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

/** The wording one of the plugin's own cells is written with, in one language. */
function builtInHeading(slot: BuiltInSlot, locale: Locale): string {
	return quadrantParts(slot.important, slot.urgent, locale).join(QUADRANT_SEPARATOR);
}

/** Whether `id` is one of the cells the plugin ships with. */
function builtInSlot(id: string): BuiltInSlot | undefined {
	return BUILT_IN_SLOTS.find((slot) => slot.id === id);
}

/**
 * A heading, matched to the cell that answers to it now.
 *
 * `id` is always a cell of the current layout, never the one the heading was
 * written for: a heading that names a removed cell has already been redirected
 * to whatever took it over. `locale` says which language the wording is from,
 * or `null` when the wording carries no language of its own (a name the user
 * typed, or a cell's bare id) — the reader uses it to keep writing a file in
 * the language it already uses.
 */
export interface SlotHeadingMatch {
	id: QuadrantId;
	locale: Locale | null;
}

export interface SlotLayout {
	readonly slots: readonly Slot[];
	/** The cell with this id, if the layout has one. */
	slotById(id: string): Slot | undefined;
	/** Follows the retirement chain to the cell that holds this id's work now. */
	resolve(id: string): string | null;
	/** Which cell a heading belongs to, or `null` if it names no cell. */
	heading(label: string): SlotHeadingMatch | null;
	/** Every heading, keyed the way `normalizeHeading` reduces one. */
	readonly headings: ReadonlyMap<string, SlotHeadingMatch>;
}

/**
 * Reads a layout: the cells to draw, plus where the work of removed cells went.
 *
 * The heading table is built in three passes, and the order is what resolves
 * every conflict there is:
 *
 * 1. what the user calls a cell (and a cell's own id, so a layout that is half
 *    configured cannot write a heading it will not recognize);
 * 2. the plugin's own wording for each of its four quadrants, in every
 *    language — kept for cells that are no longer in the layout, resolved
 *    through the retirement chain, which is what makes removing a cell a
 *    rename rather than a deletion;
 * 3. the wordings this plugin used before it was translated.
 *
 * A pass never overwrites an earlier one. A name the user typed therefore wins
 * over the plugin's own wording for the same words, which is only reachable
 * with data `validateSlots` rejects — but which has to resolve the same way
 * every time rather than depending on iteration order.
 */
export function buildSlotLayout(
	slots: readonly Slot[],
	retired: RetiredSlots = {},
): SlotLayout {
	const present = new Set(slots.map((slot) => slot.id));

	/**
	 * Follows `old id → the cell that took over`, to the end.
	 *
	 * A cell that was removed twice over is one hop too few, so the chain is
	 * followed rather than looked up once. It cannot loop: the walk would have
	 * to leave the current layout and come back to an id it already passed,
	 * which is a cycle, and a cycle is answered with `null` — no cell holds
	 * that work as far as this layout can tell, and `validateSlots` refuses to
	 * save a layout that says otherwise.
	 */
	const resolve = (id: string): string | null => {
		let current = id;
		const seen = new Set<string>();
		while (!present.has(current)) {
			if (seen.has(current)) {
				return null;
			}
			seen.add(current);
			const next = retired[current];
			if (next === undefined) {
				return null;
			}
			current = next;
		}
		return current;
	};

	const headings = new Map<string, SlotHeadingMatch>();
	/** First wording for a key wins; see the pass order above. */
	const remember = (wording: string, id: string, locale: Locale | null): void => {
		const key = normalizeHeading(wording);
		if (key.length === 0 || headings.has(key)) {
			return;
		}
		headings.set(key, { id, locale });
	};

	for (const slot of slots) {
		if (slot.name !== null) {
			remember(slot.name, slot.id, null);
		}
	}
	for (const slot of slots) {
		remember(slot.id, slot.id, null);
	}
	for (const slot of BUILT_IN_SLOTS) {
		const target = resolve(slot.id);
		if (target === null) {
			continue;
		}
		for (const locale of SUPPORTED_LOCALES) {
			remember(builtInHeading(slot, locale), target, locale);
		}
	}
	for (const [wording, id, locale] of LEGACY_QUADRANT_HEADINGS) {
		const target = resolve(id);
		if (target !== null) {
			remember(wording, target, locale);
		}
	}

	const slotById = (id: string): Slot | undefined =>
		slots.find((slot) => slot.id === id);

	const layout: SlotLayout = {
		slots,
		headings,
		slotById,
		resolve,
		heading: (label) => {
			const key = normalizeHeading(label);
			const known = headings.get(key);
			if (known !== undefined) {
				return known;
			}
			// Last resort: a hand-edited file that worded the priority its own way
			// (`紧急 · 重要`) names a quadrant, not a cell, and the layout says
			// which cell that quadrant's work is in now.
			const guessed = guessSlotId(key, layout);
			return guessed === null ? null : { id: guessed, locale: null };
		},
	};
	return layout;
}

/**
 * The layout a vault has until the user says otherwise, and the one every
 * caller that has no settings to hand still uses.
 */
export const DEFAULT_SLOT_LAYOUT: SlotLayout = buildSlotLayout(
	BUILT_IN_SLOTS.map((slot) => ({ id: slot.id, name: null, tone: slot.tone })),
);

/**
 * The heading a cell is written under: the user's name if they gave it one, the
 * plugin's own wording for one of its quadrants if it did not, and its id as a
 * last resort — an unnamed cell of the user's own has no wording at all, and
 * writing its id at least keeps the heading readable by this same layout.
 *
 * `locale` is the *file's* language, not the interface language. A name is a
 * name in every language, so a renamed cell is written identically whatever the
 * interface is set to, while a cell nobody renamed keeps following the file it
 * is in.
 */
export function slotHeading(layout: SlotLayout, id: string, locale: Locale): string {
	const slot = layout.slotById(id);
	if (slot === undefined) {
		return id;
	}
	const name = slot.name?.trim();
	if (name !== undefined && name.length > 0) {
		return name;
	}
	const builtIn = builtInSlot(id);
	return builtIn === undefined ? id : builtInHeading(builtIn, locale);
}

/**
 * Handles generic word-order combinations such as `紧急 · 重要` or "urgent but
 * unimportant", which a hand-edited file may use instead of the exact wording.
 *
 * Answers with a *cell*: the wording pins down which of the plugin's quadrants
 * was meant, and the layout then says where that quadrant's work lives now, so
 * this keeps working after the cell it names was removed or renamed.
 */
export function guessSlotId(label: string, layout: SlotLayout): string | null {
	const id = quadrantOfWording(label);
	return id === null ? null : layout.resolve(id);
}

/** Which of the four built-in quadrants a wording describes, if it says. */
function quadrantOfWording(label: string): QuadrantId | null {
	if (label.includes('重要') || label.includes('紧急')) {
		// `不重要` contains `重要`, and `不紧急` contains `紧急`, so the negated
		// forms are tested first.
		return fromFlags({
			important: label.includes('重要') && !label.includes('不重要'),
			unimportant: label.includes('不重要'),
			urgent: label.includes('紧急') && !label.includes('不紧急'),
			notUrgent: label.includes('不紧急'),
		});
	}

	const unimportant = label.includes('not important') || label.includes('unimportant');
	return fromFlags({
		important: !unimportant && label.includes('important'),
		unimportant,
		urgent: !label.includes('not urgent') && label.includes('urgent'),
		notUrgent: label.includes('not urgent'),
	});
}

function fromFlags(flags: {
	important: boolean;
	unimportant: boolean;
	urgent: boolean;
	notUrgent: boolean;
}): QuadrantId | null {
	if (flags.important && flags.urgent) return 'q1';
	if (flags.unimportant && flags.urgent) return 'q2';
	if (flags.important && flags.notUrgent) return 'q3';
	if (flags.unimportant && flags.notUrgent) return 'q4';
	return null;
}

/**
 * What is wrong with a layout, by code — the wording is the settings tab's job,
 * because a code is the same in every language and a sentence is not.
 *
 * The first six describe a layout that cannot be honoured at all (it has no
 * cells, two cells share a key, a removal points at nothing); the rest describe
 * a cell whose heading would not come back the way it went out, which is the
 * one failure this plugin cannot recover from quietly.
 */
export type SlotError =
	/** Fewer cells than a board can show. */
	| 'limitMin'
	/** More cells than the board can lay out. */
	| 'limitMax'
	/** Two cells share an id, so one of them can never be reached. */
	| 'duplicateId'
	/** A colour outside the palette. */
	| 'unknown'
	/** A removal pointing at a cell that is neither here nor on file. */
	| 'dangling'
	/** Removals that point at each other, so neither has a destination. */
	| 'cycle'
	/** A cell with no name and no wording of its own to fall back on. */
	| 'empty'
	/** A name longer than the settings tab can show. */
	| 'tooLong'
	/** A name that would break the heading line it is written on. */
	| 'invalid'
	/** A name already taken by a day, a review section, or the plugin's own wording. */
	| 'reserved'
	/** Two cells answering to the same name, so neither could be read back. */
	| 'duplicate';

/** The order errors are reported in: what breaks the layout first, then cells. */
const SLOT_ERROR_ORDER: readonly SlotError[] = [
	'limitMin',
	'limitMax',
	'duplicateId',
	'unknown',
	'dangling',
	'cycle',
	'empty',
	'tooLong',
	'invalid',
	'reserved',
	'duplicate',
];

/** Names that would stop the heading line reading as a heading, or as itself. */
function isUsableName(name: string): boolean {
	if (/[\n\r#]/.test(name)) {
		return false;
	}
	if (/^[-|>]/.test(name)) {
		return false;
	}
	return !/^\d+[.)]/.test(name);
}

/**
 * Wordings that belong to something other than the user.
 *
 * A cell is a `### ` heading and so are the review's sections, which is why the
 * section names are in here even though a cell and a section never sit at the
 * same level: a week whose four cells are called 计划/执行/检查/改进 and whose
 * review opens four headings of the same four names is a week nobody can read.
 */
function reservedWordings(): Set<string> {
	const taken = new Set<string>();
	for (const slot of BUILT_IN_SLOTS) {
		for (const locale of SUPPORTED_LOCALES) {
			taken.add(normalizeHeading(builtInHeading(slot, locale)));
		}
	}
	for (const [wording] of LEGACY_QUADRANT_HEADINGS) {
		taken.add(normalizeHeading(wording));
	}
	for (const locale of SUPPORTED_LOCALES) {
		taken.add(normalizeHeading(reviewTitle(locale)));
		for (const day of DAY_IDS) {
			taken.add(normalizeHeading(dayLabel(day, locale)));
		}
		for (const section of REVIEW_SECTIONS) {
			taken.add(normalizeHeading(reviewSectionLabel(section, locale)));
		}
	}
	return taken;
}

/**
 * Everything wrong with a layout, as codes, in a fixed order and without
 * repeats — so the settings tab can show the first one and say nothing else.
 *
 * Answered for a layout as a whole rather than one cell at a time, because
 * three of the failures are relations between cells (two of them sharing an id
 * or a name, removals that loop) and one of them is the count.
 */
export function validateSlots(slots: readonly Slot[], retired: RetiredSlots): SlotError[] {
	const found = new Set<SlotError>();
	const present = new Set(slots.map((slot) => slot.id));

	if (slots.length < SLOT_LIMITS.min) {
		found.add('limitMin');
	}
	if (slots.length > SLOT_LIMITS.max) {
		found.add('limitMax');
	}

	const ids = new Set<string>();
	const reserved = reservedWordings();
	const nameCounts = new Map<string, number>();

	for (const slot of slots) {
		if (ids.has(slot.id)) {
			found.add('duplicateId');
		}
		ids.add(slot.id);

		if (!Number.isInteger(slot.tone) || slot.tone < 0 || slot.tone >= TONE_COUNT) {
			found.add('unknown');
		}

		// A cell the plugin shipped keeps a wording to fall back on; one the user
		// added has nothing to be called until they call it something.
		if (slot.name === null) {
			if (builtInSlot(slot.id) === undefined) {
				found.add('empty');
			}
			continue;
		}

		const name = slot.name.trim();
		if (name.length === 0) {
			found.add('empty');
			continue;
		}
		if (name.length > SLOT_LIMITS.nameMax) {
			found.add('tooLong');
		}
		if (!isUsableName(name)) {
			found.add('invalid');
		}
		const key = normalizeHeading(name);
		if (reserved.has(key)) {
			found.add('reserved');
		}
		nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
	}

	if ([...nameCounts.values()].some((count) => count > 1)) {
		found.add('duplicate');
	}

	for (const from of Object.keys(retired)) {
		const walked = new Set<string>();
		let current = from;
		for (;;) {
			if (present.has(current)) {
				break;
			}
			if (walked.has(current)) {
				found.add('cycle');
				break;
			}
			walked.add(current);
			const next = retired[current];
			if (next === undefined) {
				found.add('dangling');
				break;
			}
			current = next;
		}
	}

	return SLOT_ERROR_ORDER.filter((code) => found.has(code));
}

/**
 * The id to give the next cell the user adds.
 *
 * Ids are never reused — a removed one stays in the retirement record for ever,
 * because that record is what reads old files — so this counts up from the ids
 * that are in use either way rather than looking for a free number.
 */
export function nextSlotId(slots: readonly Slot[], retired: RetiredSlots): string {
	const taken = new Set<string>([
		...slots.map((slot) => slot.id),
		...Object.keys(retired),
		...Object.values(retired),
	]);
	let n = 1;
	while (taken.has(`s${n}`)) {
		n += 1;
	}
	return `s${n}`;
}

/**
 * The cell a user is adding.
 *
 * Three things are decided here, and each of them is a rule rather than a
 * formality: the key is one no cell has ever had, because a removed one stays in
 * the retirement record for ever and reusing it would file old weeks under the
 * wrong cell; the colour is the one for the position the cell lands in, so a
 * fifth cell is drawn in a colour of its own rather than the first one over
 * again; and the name is worded by the caller — the settings tab, which is the
 * only place that knows what to call a cell nobody has named — bumped until it
 * is one nothing answers to, since two cells answering to one wording are two
 * cells a week could not tell apart.
 *
 * The bumping is bounded, because the wording is out of this function's hands:
 * one that did not change with the count would spin for ever. Running out of
 * attempts is not a failure of its own — the name landed on is then one already
 * in use, and `validateSlots` answers `duplicate`, which is a message where a
 * hang would be a bug.
 */
export function nextSlot(
	slots: readonly Slot[],
	retired: RetiredSlots,
	nameFor: (count: number) => string,
): Slot {
	const taken = new Set(slots.map((slot) => normalizeHeading(slot.name ?? '')));
	let count = slots.length + 1;
	// One name per cell is taken at the very most, so a wording that varies with
	// the count is certain to be free within a step each.
	const limit = count + taken.size + 1;
	while (count < limit && taken.has(normalizeHeading(nameFor(count)))) {
		count += 1;
	}
	return {
		id: nextSlotId(slots, retired),
		name: nameFor(count),
		tone: slots.length % TONE_COUNT,
	};
}

/**
 * The record of removals once a cell has been removed into `target`.
 *
 * Two changes rather than one, and the second is the one worth writing down:
 * the removed cell points at the cell that takes its work over, and *anything
 * already pointing at the removed cell is pointed at that same cell instead*.
 * Both resolve to the same place, but only the second keeps the chains short —
 * a vault collects one of these per removal, and `q3 → q1 → q2` says no more
 * than `q3 → q2` while costing every read an extra hop.
 *
 * Nothing is dropped: the wording of a cell removed long ago is the only thing
 * that reads a week written back then.
 */
export function retireSlot(
	retired: RetiredSlots,
	id: string,
	target: string,
): Record<string, string> {
	const next: Record<string, string> = {};
	for (const [from, to] of Object.entries(retired)) {
		next[from] = to === id ? target : to;
	}
	next[id] = target;
	return next;
}

/** The cells a stored settings file describes, and where the removed ones went. */
export interface SlotConfig {
	slots: Slot[];
	retiredSlots: RetiredSlots;
}

/**
 * One cell read off a settings file, or `null` when the entry is not a cell at
 * all.
 *
 * `fallbackTone` is used when the stored colour is not one the palette has: the
 * cell's position, which is the colour a cell that was never given one of its
 * own would have had. An id is the one field that cannot be replaced — a cell
 * without one cannot be reached by anything — so an entry that has no usable id
 * is not a cell and is dropped rather than guessed at.
 */
function readSlot(value: unknown, fallbackTone: number): Slot | null {
	if (!isRecord(value)) {
		return null;
	}
	const id = typeof value.id === 'string' ? value.id.trim() : '';
	if (id.length === 0) {
		return null;
	}
	const name = typeof value.name === 'string' ? value.name.trim() : '';
	const tone = value.tone;
	return {
		id,
		name: name.length > 0 ? name : null,
		tone:
			typeof tone === 'number' && Number.isInteger(tone) && tone >= 0 && tone < TONE_COUNT
				? tone
				: fallbackTone,
	};
}

/**
 * The cells a settings file holds, made safe to use.
 *
 * A stored settings object is data rather than code: it can be older than the
 * fields being read out of it, written by hand, or left half written by a
 * crash. So a value that cannot be honoured is *replaced* — an entry that is not
 * a cell is dropped, a colour off the palette becomes the cell's position, a
 * name of nothing but spaces becomes no name at all — while every value that can
 * be honoured is kept exactly as it was. Nothing is invented beyond that: a cell
 * whose colour cannot be read is still a cell, and the first cell is still the
 * first.
 *
 * Of two cells sharing an id the first is kept. The second can never be reached
 * by a heading or by a week, so keeping it would only put a row in the settings
 * tab that no file could ever name.
 *
 * A layout left with no cells at all — no list, an empty list, every entry
 * unreadable — falls back to the four the plugin ships with. That is the one
 * state the board cannot come back from on its own, and it is not a state the
 * settings tab can produce: it will not remove the last cell.
 *
 * More cells than the board lays out well is *not* corrected. Those are the
 * user's cells and dropping them here would hide their work; `validateSlots`
 * reports it where it can be acted on instead.
 */
function readSlots(value: unknown): Slot[] {
	const slots: Slot[] = [];
	if (Array.isArray(value)) {
		const seen = new Set<string>();
		for (const entry of value) {
			const slot = readSlot(entry, slots.length % TONE_COUNT);
			if (slot !== null && !seen.has(slot.id)) {
				seen.add(slot.id);
				slots.push(slot);
			}
		}
	}
	return slots.length > 0 ? slots : DEFAULT_SLOTS.map((slot) => ({ ...slot }));
}

/**
 * The record of removed cells, with the entries that no longer lead anywhere
 * taken out.
 *
 * A removal is read by following it until it reaches a cell the layout has. An
 * entry that never does — one pointing at nothing, or two pointing at each
 * other — already resolves to nothing and so changes no week either way; what
 * keeping it would do is stop `nextSlotId` from ever handing that id out again,
 * which is a cost with no benefit.
 *
 * An entry whose id *is* a cell of the layout goes too, and more plainly: the
 * layout answers for a cell it holds without consulting this record at all, so
 * such an entry can never be read.
 *
 * Entries that do lead somewhere are kept exactly as they are, chains and all.
 * Following one to the end is `resolve`'s job, and shortening the chains here
 * would put a second answer to the same question in a second place.
 */
function readRetired(value: unknown, slots: readonly Slot[]): RetiredSlots {
	if (!isRecord(value)) {
		return {};
	}

	const present = new Set(slots.map((slot) => slot.id));
	const candidates = new Map<string, string>();
	for (const [from, to] of Object.entries(value)) {
		if (typeof to === 'string' && to.length > 0 && !present.has(from)) {
			candidates.set(from, to);
		}
	}

	const kept: Record<string, string> = {};
	for (const [from, to] of candidates) {
		const walked = new Set<string>();
		let current = from;
		let reached = false;
		while (!walked.has(current)) {
			if (present.has(current)) {
				reached = true;
				break;
			}
			walked.add(current);
			const next = candidates.get(current);
			if (next === undefined) {
				break;
			}
			current = next;
		}
		if (reached) {
			kept[from] = to;
		}
	}
	return kept;
}

/**
 * The cells a stored settings object describes, and the removals that still
 * mean something, as the one object every reader and writer wants.
 *
 * The removals are read *against the cells that survived*, which is why the two
 * are answered together: an entry that would have led to a cell dropped as a
 * duplicate leads nowhere now.
 */
export function normalizeSlotConfig(stored: unknown): SlotConfig {
	const record = isRecord(stored) ? stored : {};
	const slots = readSlots(record.slots);
	return { slots, retiredSlots: readRetired(record.retiredSlots, slots) };
}
