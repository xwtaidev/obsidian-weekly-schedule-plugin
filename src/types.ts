
import type { Locale } from './i18n';

/**
 * Identifier of one priority cell of a day.
 *
 * It used to be one of exactly four quadrants, which is why the name says so;
 * a cell is now whatever the user keeps in their layout, so an id is an opaque
 * key rather than a fixed word. The four the plugin ships with keep the ids
 * they have always had, and that is the whole of what makes a file written by
 * an older version read back into the cell it came from.
 */
export type QuadrantId = string;

/** One of the seven columns of the board. */
export type DayId = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/**
 * A priority cell as the user has it set up: a key that never changes, a name
 * of their own that may be missing, and the colour it is drawn in.
 *
 * The id is a key and nothing else. It is never shown and never written to a
 * week's file — what a file says is the *heading* a cell answers to, which is
 * either the user's name or the wording the plugin derives for one of its own
 * cells. That is what keeps a cell nobody renamed reading and writing exactly
 * as it did before cells became configurable.
 */
export interface Slot {
	id: QuadrantId;
	/** The user's own name for the cell; `null` keeps the built-in wording. */
	name: string | null;
	/** Which colour to draw it in, `0..TONE_COUNT-1`. */
	tone: number;
}

/**
 * A cell the plugin ships with, and the two flags its default wording is read
 * off. The flags are not part of the model any more: they are what says a
 * quadrant is `重要 · 紧急` rather than something the user typed, and they are
 * the fixed point every historical heading is resolved against.
 */
export interface BuiltInSlot {
	id: QuadrantId;
	tone: number;
	important: boolean;
	urgent: boolean;
}

/**
 * Cells that were removed, as `removed id → the cell that took over`.
 *
 * Nothing is ever taken out of this record, which is what lets a week written
 * before a cell was removed go on being read: the heading still names the id,
 * and the id still says where its work went. A chain is followed to its end,
 * so removing two cells in turn is as correct as removing one.
 */
export type RetiredSlots = Readonly<Record<string, string>>;

/**
 * What the cells used to be called, as `wording → the cell that answered to it`.
 *
 * The other half of the record above, and it exists because a cell of the user's
 * own is named by them: the id tells the layout nothing about the words its
 * weeks were written with, and a name that is dropped when the cell is removed
 * or renamed is a name the weeks written under it can no longer be read by —
 * their tasks would be read into no cell at all, and a week that is then saved
 * would be saved without them.
 *
 * Only names the user typed are worth keeping here. A cell nobody named is
 * written as a wording the plugin derives, and those are known without this
 * record — the four built-ins in every language, and a user's own unnamed cell
 * by its id.
 */
export type RetiredHeadings = Readonly<Record<string, string>>;

/**
 * A priority cell of one day. Wording is deliberately not stored: a label is
 * derived from the id and the current language when it is shown or written, so
 * switching languages cannot leave a stale label behind.
 */
export interface Quadrant {
	id: QuadrantId;
	tasks: Task[];
}

export interface Day {
	id: DayId;
	quadrants: Quadrant[];
}

/**
 * One task, serialized as `- [ ] text` / `- [x] text` — or, when its text runs
 * over several lines, as the checkbox line followed by the remaining lines
 * indented under it.
 *
 * `text` holds those lines joined with `\n`, and is normalized on the way in and
 * out (`normalizeTaskText`) rather than kept exactly as typed: a task cannot
 * hold a blank line or a line's own leading space, and dropping them where the
 * text is stored is what keeps the board and the file saying the same thing.
 */
export interface Task {
	id: string;
	text: string;
	done: boolean;
}

/** Which keystroke saves a task's text rather than starting a new line in it. */
export type TaskCommitKey = 'enter' | 'shiftEnter';

/**
 * The four sections of a week's review, in the order they are written to the
 * file: plan, do, check, act.
 *
 * Wording is deliberately not stored, exactly as it is not for a quadrant: a
 * section is recognized by its id, and its heading is derived from the id and
 * the file's language when it is written.
 */
export type ReviewSectionId = 'plan' | 'do' | 'check' | 'act';

/**
 * A week's review: a list of items per section, empty when nothing has been
 * written there.
 *
 * An item is a line, or a few lines run together — the shape a task's text has,
 * and held to the same rule (`normalizeTaskText`), because it is the same thing:
 * one thing to be read on a line of its own. Nothing else is kept. Items are not
 * tasks and are not counted as work, and an item holding nothing is never
 * written: a section holding none of those earns no heading in the file either.
 */
export type WeekReview = Record<ReviewSectionId, string[]>;

export interface WeekSchedule {
	/** Monday of the week, formatted `YYYY-MM-DD`. */
	weekStart: string;
	/** Vault path of the file backing this schedule. */
	path: string;
	days: Day[];
	/**
	 * The week's own review, looked back on once the week is over. Written after
	 * the days, and always present — a week with nothing written holds four empty
	 * sections rather than a missing field.
	 */
	review: WeekReview;
	/**
	 * Language the file's headings are written in, so editing a file keeps the
	 * wording it already uses instead of translating it on every save. A file
	 * with no recognizable heading — a new week, or one written by hand without
	 * them — adopts the interface language at the time it is loaded.
	 */
	locale: Locale;
}
