import { ItemView, Menu, moment, setIcon } from 'obsidian';
import {
	REVIEW_SECTIONS,
	REVIEW_SECTION_LETTERS,
	VIEW_TYPE_WEEKLY_SCHEDULE,
	isReviewSectionId,
} from '../constants';
import { formatWeekLabel } from '../i18n/format';
import {
	dayLabel,
	getLocale,
	reviewQuestion,
	reviewStepName,
	syncLocale,
	t,
	tp,
} from '../i18n';
import { hasTaskText, normalizeTaskText } from '../markdown';
import { countTasks } from '../store';
import { slotHeading } from '../slots';
import {
	dateKey,
	isSameDay,
	shiftWeek,
	startOfWeek,
	weekDays,
	weekFilePath,
} from '../utils/date';
import { createTaskId, fitColumns, reviewSpan } from '../utils/helpers';
import { placeCaretAtEnd, registerInlineEditor, sleep } from './inline-editor';
import { YEAR_VIEW_ICON } from './weekly-schedule-year-view';
import type { Moment } from '../utils/date';
import type { WorkspaceLeaf } from 'obsidian';
import type WeeklySchedulePlugin from '../main';
import type { Day, Quadrant, ReviewSectionId, Task, WeekSchedule } from '../types';

export const VIEW_ICON = 'calendar-days';

/**
 * What the daily move's button draws.
 *
 * Two earlier tries missed. `arrow-down-to-line` said "download" — a downward
 * arrow above a bar is what every download button looks like — and
 * `arrow-right-from-line` kept its bar on the left, which still read as a glyph
 * landing in a tray. This one hooks down out of the row above and runs on in
 * the same stroke: the leftovers leaving the day before and arriving here, with
 * no bar left to be mistaken for the edge of a container.
 */
const DAY_CARRY_ICON = 'corner-down-right';

/**
 * Layout targets for the day grid.
 *
 * Three days per row is the intended shape and therefore the ceiling. A day
 * narrower than MIN_DAY_WIDTH squeezes four priority cells into a strip too
 * tight to read, so the grid gives up columns instead.
 */
const MAX_COLUMNS = 3;
const MIN_DAY_WIDTH = 232;
/** Column gap, matching --ws-gap-column in styles.css. */
const GRID_GAP = 32;
/** Grid padding (36px) plus the scrollbar Obsidian may keep on the pane. */
const PANE_SLACK = 62;

/** Which way the review panel's fold indicator points. */
const REVIEW_OPEN_ICON = 'chevron-down';
const REVIEW_FOLDED_ICON = 'chevron-right';

/**
 * A field on the board that can hold the caret, and what it is editing.
 *
 * Two kinds of field take one — a task's text and one item of the review — and
 * both keep what has been typed in the DOM rather than in the model until they
 * are committed. So both have to be readable back into the model before a
 * re-render, and both have to be findable again after one.
 *
 * A task is found by its id, an item by where it sits: a task is a thing the
 * board moves and deletes, while an item is a line of a section and the section
 * is what holds it.
 */
type FocusedEditor =
	| { kind: 'task'; id: string; text: string }
	| { kind: 'review'; section: ReviewSectionId; index: number; text: string };

/** Persisted with the workspace, so the open week survives an app restart. */
interface ScheduleViewState extends Record<string, unknown> {
	weekStart?: string;
	showCompleted?: boolean;
}

export class WeeklyScheduleView extends ItemView {
	/** Monday (`YYYY-MM-DD`) of the week currently displayed. */
	private weekStart: string;
	private showCompleted = true;
	private schedule: WeekSchedule | null = null;
	/** Week start the board was last rendered for, to detect week changes. */
	private renderedWeekStart: string | null = null;
	private loadToken = 0;
	private isOpen = false;

	private toolbarEl: HTMLElement | null = null;
	private boardEl: HTMLElement | null = null;
	/** Totals strip below the board, rewritten in place as the week changes. */
	private statsEl: HTMLElement | null = null;
	/** Column count the grid was last laid out with. */
	private columns = MAX_COLUMNS;
	/** The rate in the review panel's heading, rewritten as the week changes. */
	private reviewCountEl: HTMLElement | null = null;
	/**
	 * Whether the review panel is unfolded, or null to leave it at its default.
	 *
	 * The default is open. A week is reviewed by writing four sections, so a
	 * panel folded down to its own title — which is every week, for as long as
	 * nobody has written one — is a panel nobody opens. Once the user folds or
	 * unfolds it, that is what they get until another week is opened, rather
	 * than the panel deciding again under the pointer.
	 */
	private reviewOpen: boolean | null = null;

	/** The panel's state: the choice last made, or open by default. */
	private reviewIsOpen(): boolean {
		return this.reviewOpen ?? true;
	}

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: WeeklySchedulePlugin,
	) {
		super(leaf);
		this.weekStart = this.defaultWeekStart();
	}

	getViewType(): string {
		return VIEW_TYPE_WEEKLY_SCHEDULE;
	}

	getDisplayText(): string {
		return t('view.board');
	}

	getIcon(): string {
		return VIEW_ICON;
	}

	getState(): ScheduleViewState {
		return { weekStart: this.weekStart, showCompleted: this.showCompleted };
	}

	async setState(state: unknown, result: Parameters<ItemView['setState']>[1]): Promise<void> {		const next = (state ?? {}) as ScheduleViewState;
		if (typeof next.weekStart === 'string' && next.weekStart.length > 0) {
			this.weekStart = next.weekStart;
		}
		if (typeof next.showCompleted === 'boolean') {
			this.showCompleted = next.showCompleted;
		}
		await super.setState(state, result);
		if (this.isOpen) {
			await this.render();
		}
	}

	async onOpen(): Promise<void> {
		this.isOpen = true;
		this.contentEl.addClass('weekly-schedule-container');
		this.containerEl.addClass('weekly-schedule-leaf');
		// Inline editing commits on blur, so a slow poll keeps the in-memory
		// board (and therefore the next write) close to what is on screen.
		this.registerInterval(window.setInterval(() => this.syncFocusedEditor(), 1000));

		// Size the grid from the pane rather than the window: a pane is often a
		// sidebar or half a split, so viewport breakpoints would be wrong.
		const observer = new ResizeObserver(() => this.updateColumns());
		observer.observe(this.contentEl);
		this.register(() => observer.disconnect());

		await this.render();
	}

	async onClose(): Promise<void> {
		this.isOpen = false;
		this.contentEl.removeClass('weekly-schedule-container');
		this.containerEl.removeClass('weekly-schedule-leaf');
		this.contentEl.empty();
		await this.plugin.store.flush(this.pathFor(this.weekStart));
	}

	/** Moves the board by whole weeks. */
	async navigate(weeks: number): Promise<void> {
		const target = shiftWeek(this.momentOf(this.weekStart), weeks);
		await this.setWeekStart(dateKey(target));
	}

	async goToToday(): Promise<void> {
		await this.setWeekStart(dateKey(startOfWeek(moment(), this.weekStartDay)));
	}

	async setWeekStart(next: string): Promise<void> {
		if (next === this.weekStart && this.schedule !== null) {
			return;
		}

		await this.plugin.store.flush(this.pathFor(this.weekStart));
		this.weekStart = next;
		await this.render();
		this.app.workspace.requestSaveLayout();
	}

	/** Path of the file backing the currently displayed week. */
	get activePath(): string {
		return this.pathFor(this.weekStart);
	}

	/** Monday (`YYYY-MM-DD`) of the week currently displayed. */
	get currentWeekStart(): string {
		return this.weekStart;
	}

	/** Handles a vault `modify` event for a schedule file. */
	async handleFileChange(path: string): Promise<void> {
		if (path !== this.activePath) {
			this.plugin.store.forget(path);
			return;
		}

		// Pull in whatever is still only in the focused editor, and remember
		// what the user was editing: re-rendering replaces the DOM, so the
		// caret has to be restored afterwards.
		this.syncFocusedEditor();
		const focused = this.focusedEditor();

		// The file changed elsewhere while this board held an unflushed edit.
		// Reloading now would discard that edit, so the in-memory board wins and
		// the pending debounced save writes it out.
		if (this.plugin.store.hasLocalEdits(path)) {
			return;
		}

		if (await this.plugin.store.reloadIfChanged(path)) {
			await this.render();
			if (focused) {
				await this.restoreFocus(focused);
			}
		}
	}

	async handleFileDeleted(path: string): Promise<void> {
		if (path !== this.activePath || this.schedule === null) {
			this.plugin.store.forget(path);
			return;
		}

		// The file was removed outside the plugin (deleted, renamed, or its
		// folder was renamed). Show an empty board; the next edit recreates it.
		this.schedule = null;
		await this.render();
	}

	/** Re-renders after settings changed. */
	async refresh(): Promise<void> {
		await this.plugin.store.invalidate();
		this.schedule = null;
		await this.render();
	}

	/**
	 * Commits whatever the inline editor holds and writes the week out.
	 *
	 * Meant to be called before the plugin rewrites this week itself, which reads
	 * the week from memory: task text lives in the DOM until the editor blurs, so
	 * a rewrite that skipped this could write the week without it. Writing the
	 * week out as well is what lets the caller take a failed rewrite back without
	 * losing that text with it.
	 */
	async commitPendingEdits(): Promise<void> {
		this.syncFocusedEditor();
		await this.plugin.store.flush(this.activePath);
	}

	/**
	 * Takes the displayed week from the file again and redraws it.
	 *
	 * Used after the plugin itself rewrote this week — carrying last week's
	 * unfinished work over is the one case of that. Forgetting the week rather
	 * than redrawing from memory is deliberate: the board must not keep showing a
	 * schedule the store may have replaced while the pane was open.
	 */
	async reloadWeek(): Promise<void> {
		this.plugin.store.forget(this.activePath);
		this.schedule = null;
		await this.render();
	}

	/**
	 * Redraws the labels after the interface language changed.
	 *
	 * Nothing is reloaded and nothing is written: wording is derived from ids at
	 * render time, so the board can simply draw itself again — which also leaves
	 * the file's own heading language untouched.
	 */
	onLocaleChange(): void {
		if (this.isOpen && this.schedule) {
			this.renderBoard(this.schedule);
		}
	}

	/**
	 * Moves the highlight — and the daily button with it — to the day that just
	 * started. Called when the calendar date rolls over while the board is open.
	 *
	 * Nothing is reloaded and the board is not redrawn: a new date never changes
	 * the week on screen, and replacing the DOM would throw away whatever a caret
	 * was sitting in. When the new day falls outside the week on screen — the
	 * board is then showing a week that is over — no column is marked at all.
	 */
	onDayChange(): void {
		if (!this.isOpen || !this.boardEl) {
			return;
		}

		const today = moment();
		const dates = this.datesOfWeek();
		this.boardEl.querySelectorAll<HTMLElement>('.weekly-schedule-day').forEach((column, index) => {
			const date = dates[index] ?? null;
			this.applyToday(column, date !== null && isSameDay(date, today));
		});
	}

	private get weekStartDay(): number {
		return this.plugin.settings.weekStartsOn;
	}

	private defaultWeekStart(): string {
		return dateKey(startOfWeek(moment(), this.plugin.settings.weekStartsOn));
	}

	private pathFor(weekStart: string): string {
		return weekFilePath(this.plugin.settings.folder, this.momentOf(weekStart));
	}

	private momentOf(weekStart: string): Moment {
		return moment(weekStart, 'YYYY-MM-DD').startOf('day');
	}

	private async render(): Promise<void> {
		// A pane can be opened in the moment between a language change and the
		// next check, so every render reads the language for itself.
		syncLocale();
		const token = ++this.loadToken;
		const path = this.pathFor(this.weekStart);
		const weekChanged = this.renderedWeekStart !== this.weekStart;

		if (!weekChanged && this.schedule !== null) {
			this.renderBoard(this.schedule);
			return;
		}

		const schedule = await this.plugin.store.load(this.weekStart, path);
		if (token !== this.loadToken) {
			return;
		}

		this.schedule = schedule;
		this.renderedWeekStart = this.weekStart;
		// A newly loaded week decides for itself whether its review opens; which
		// state the last one was left in is no answer for this one.
		this.reviewOpen = null;
		this.renderBoard(schedule);
	}

	private renderBoard(schedule: WeekSchedule): void {
		this.contentEl.empty();
		this.renderToolbar();
		this.boardEl = this.contentEl.createDiv({ cls: 'weekly-schedule-board' });
		schedule.days.forEach((day, index) => this.renderDay(day, index));
		// The eighth cell of the grid, after the seven days: with three days per
		// row it lands under the week's last day and takes the two cells that day
		// leaves over.
		this.renderReview(schedule);
		this.renderStats(schedule);

		// Now that the grid exists, fit it to the pane.
		this.updateColumns();
	}

	/**
	 * The week's totals, in the strip pinned below the board.
	 *
	 * Counted from the schedule in memory rather than from the file, so an edit
	 * moves the numbers at once instead of waiting for the debounced write.
	 */
	private renderStats(schedule: WeekSchedule): void {
		this.statsEl = this.contentEl.createDiv({ cls: 'weekly-schedule-stats' });
		this.updateStats(schedule);
	}

	/** Rewrites the totals after an edit changed them. */
	private updateStats(schedule: WeekSchedule | null = this.schedule): void {
		if (!this.statsEl || !schedule) {
			return;
		}

		const { total, done, percent } = countTasks(schedule);
		this.statsEl.empty();
		if (total === 0) {
			this.statsEl.setText(t('board.stats.empty'));
			return;
		}

		// One line, with the rate carrying the emphasis: the counts are context for
		// it, not three separate readings.
		this.statsEl.appendText(
			`${tp('board.stats.tasks', total)} · ${t('board.stats.done', { count: done })} · `,
		);
		this.statsEl.createSpan({
			cls: 'weekly-schedule-stats-value',
			text: t('board.stats.percent', { percent: percent ?? 0 }),
		});
	}

	/**
	 * The week's own review, in the grid's last cell.
	 *
	 * Drawn as a column like a day's — a heading rule over what it holds — so it
	 * reads as part of the board rather than as a surface laid over it. The
	 * heading is also the whole handle: folding the panel leaves it, and that
	 * one line is what the board then shows in place of two empty cells.
	 *
	 * The heading names the frame (PDCA) and each section opens with its letter,
	 * so the four read as the four steps of one cycle rather than as four notes
	 * that happen to sit together.
	 */
	private renderReview(schedule: WeekSchedule): void {
		const board = this.boardEl;
		if (!board) {
			return;
		}

		const expanded = this.reviewIsOpen();
		const panel = board.createDiv({ cls: 'weekly-schedule-review' });
		panel.dataset.folded = expanded ? 'false' : 'true';

		const header = panel.createEl('button', {
			cls: 'weekly-schedule-review-header',
			attr: { type: 'button', 'aria-expanded': String(expanded) },
		});
		header.createSpan({ cls: 'weekly-schedule-review-name', text: t('board.reviewPanel') });

		// The rate and not the counts: the strip below the board already reads
		// the week out in full, and what the panel wants beside its own heading
		// is the one figure that says how the week went.
		this.reviewCountEl = header.createSpan({ cls: 'weekly-schedule-review-count' });
		this.updateReviewStats(schedule);
		const chevron = header.createSpan({ cls: 'weekly-schedule-review-chevron' });
		setIcon(chevron, expanded ? REVIEW_OPEN_ICON : REVIEW_FOLDED_ICON);
		header.addEventListener('click', () => this.toggleReview());

		if (!expanded) {
			return;
		}

		// All four sections are drawn in the order they are written, whether or
		// not they hold anything: PDCA is a frame whose parts keep their places,
		// the same way the four priority cells of a day do, and a step you can
		// only reach once you have written something is a step you cannot write.
		const body = panel.createDiv({ cls: 'weekly-schedule-review-body' });
		for (const id of REVIEW_SECTIONS) {
			this.renderReviewSection(body, schedule, id);
		}
	}

	/**
	 * One step of PDCA: its letter and name, the items written under it, and —
	 * while it holds none — the row that opens the first.
	 *
	 * The shape a priority cell has, add row included: a section that shows an
	 * item does not get one, because there the way to the next item is Enter at
	 * the end of the one being written, and the row would cost a line in every
	 * section of every week to say what a keystroke can.
	 *
	 * The question a step asks lives on that row, so an empty section asks it
	 * once, where the answer would go, instead of printing it again over every
	 * item — and the click that adds the first item hands the question over to
	 * the line the answer is written on.
	 */
	private renderReviewSection(
		parent: HTMLElement,
		schedule: WeekSchedule,
		section: ReviewSectionId,
	): void {
		const block = parent.createDiv({ cls: 'weekly-schedule-review-section' });
		const label = block.createDiv({ cls: 'weekly-schedule-review-label' });
		// The letter first and set apart from the name, because it is the letter
		// and not the name that says which step of PDCA this is.
		label.createSpan({
			cls: 'weekly-schedule-review-letter',
			text: REVIEW_SECTION_LETTERS[section],
		});
		// No class on the name: it is the label's own typography, and the
		// heading's class would make it read as a heading.
		label.createSpan({ text: reviewStepName(section) });

		const items = schedule.review[section];
		if (items.length === 0) {
			const add = block.createEl('button', {
				cls: 'weekly-schedule-add',
				attr: { type: 'button' },
			});
			add.createSpan({ cls: 'weekly-schedule-add-icon', text: '+' });
			add.createSpan({ cls: 'weekly-schedule-add-label', text: reviewQuestion(section) });
			add.addEventListener('click', () => void this.addReviewItem(section));
			return;
		}

		const list = block.createDiv({ cls: 'weekly-schedule-review-list' });
		items.forEach((text, index) => this.renderReviewItem(list, section, index, text));
	}

	/**
	 * One item of a section: the dot that marks it as one, the field it is
	 * written in, and the controls that move or drop it.
	 *
	 * The dot is drawn beside the text rather than written into it, which is what
	 * holds an item running over several lines indented under its own first line,
	 * the way a task's continuation line does.
	 */
	private renderReviewItem(
		parent: HTMLElement,
		section: ReviewSectionId,
		index: number,
		text: string,
	): void {
		const item = parent.createDiv({ cls: 'weekly-schedule-review-item' });
		item.createSpan({ cls: 'weekly-schedule-review-bullet', text: '•' });

		const field = item.createDiv({
			cls: 'weekly-schedule-review-text',
			attr: { contenteditable: 'plaintext-only', spellcheck: 'false' },
		});
		field.dataset.reviewSection = section;
		field.dataset.reviewIndex = String(index);
		// The question the step asks, on the line being written into it: the row
		// that carried it was replaced by this one a click ago.
		field.dataset.placeholder = reviewQuestion(section);
		field.setText(text);
		// A line like any other on this board, so Enter commits and opens the next
		// one underneath — the same keystroke, from the same setting, as a task's.
		registerInlineEditor(field, (value) => this.setReviewItem(section, index, value), {
			commitKey: this.plugin.settings.taskCommitKey,
			onCommit: (next) => this.finishReviewItem(section, index, next),
		});

		// The controls a task row carries, for the same reason: an item is a line
		// of the week, and one that cannot be put in another place or taken out
		// again is one that has to be retyped to change. Where it can move to is
		// the section it was written under and nowhere else — see `moveReviewItem`.
		const controls = item.createDiv({ cls: 'weekly-schedule-row-controls' });
		const up = this.addRowControl(controls, 'chevron-up', t('board.moveUp'));
		up.addEventListener('click', (event) => {
			event.stopPropagation();
			this.moveReviewItem(section, index, -1);
		});
		const down = this.addRowControl(controls, 'chevron-down', t('board.moveDown'));
		down.addEventListener('click', (event) => {
			event.stopPropagation();
			this.moveReviewItem(section, index, 1);
		});
		const remove = this.addRowControl(controls, 'x', t('board.delete'));
		remove.addEventListener('click', (event) => {
			event.stopPropagation();
			this.removeReviewItem(section, index);
		});

		this.addRowMenu(
			item,
			(delta) => this.moveReviewItem(section, index, delta),
			() => this.removeReviewItem(section, index),
		);
	}

	/**
	 * Moves one item a place up or down within its own section.
	 *
	 * Within the section and no further: `计划` and `检查` are not two halves of
	 * one list but two different questions, and an item that slid across is an
	 * answer that changed under the writer. An item at either end of its section
	 * stays where it is, which is what its own buttons do too.
	 */
	private moveReviewItem(section: ReviewSectionId, index: number, delta: number): void {
		const items = this.schedule?.review[section];
		const target = index + delta;
		if (
			!items ||
			index < 0 ||
			index >= items.length ||
			target < 0 ||
			target >= items.length
		) {
			return;
		}

		const [item] = items.splice(index, 1);
		if (item !== undefined) {
			items.splice(target, 0, item);
		}
		this.renderBoard(this.requireSchedule());
		this.save();
		void this.focusReviewItem(section, target);
	}

	/**
	 * Drops one item.
	 *
	 * The section keeps its heading and whatever else it holds; one left holding
	 * nothing goes back to the row that opens its first — which is where it
	 * started, and how a section is emptied for good.
	 */
	private removeReviewItem(section: ReviewSectionId, index: number): void {
		const items = this.schedule?.review[section];
		if (!items || index < 0 || index >= items.length) {
			return;
		}

		items.splice(index, 1);
		this.renderBoard(this.requireSchedule());
		this.save();
	}

	/**
	 * Opens or folds the review panel.
	 *
	 * Nothing is focused on the way in: an empty step holds no field to put a
	 * caret in, only the row that opens its first item, and unfolding is a look
	 * at the week rather than a decision to start writing.
	 */
	private toggleReview(): void {
		const schedule = this.schedule;
		if (!schedule) {
			return;
		}

		this.reviewOpen = !this.reviewIsOpen();
		this.renderBoard(schedule);
	}

	/**
	 * Keeps the panel's heading in step with what the board holds.
	 *
	 * Called from `save`, so a week whose tasks changed under the pointer moves
	 * this figure at once rather than waiting for the next re-render — and so a
	 * week whose last task just went shows no rate at all.
	 */
	private updateReviewStats(schedule: WeekSchedule | null = this.schedule): void {
		if (!this.reviewCountEl || !schedule) {
			return;
		}
		const { total, percent } = countTasks(schedule);
		this.reviewCountEl.setText(
			total > 0 ? t('board.stats.percent', { percent: percent ?? 0 }) : '',
		);
	}

	/**
	 * Gives a section its first item. This is the only thing the add row does,
	 * since a section that already shows an item does not have one: there, the
	 * way to the next item is Enter at the end of the one being written.
	 */
	private async addReviewItem(section: ReviewSectionId): Promise<void> {
		await this.insertReviewItem(section, this.requireSchedule().review[section].length);
	}

	/** Draws a new empty item at `index` and puts the caret in it. */
	private async insertReviewItem(section: ReviewSectionId, index: number): Promise<void> {
		const schedule = this.requireSchedule();
		schedule.review[section].splice(index, 0, '');
		this.renderBoard(schedule);
		await this.focusReviewItem(section, index);
	}

	/**
	 * What a finished edit leaves behind — `finishTask`'s question, asked of an
	 * item.
	 *
	 * An item with text stays where it is. An empty one goes: it is never written
	 * to the file, so a keystroke that ended the edit would otherwise leave a
	 * bullet on the board that the week does not hold. And the keystroke that
	 * asked for another item gets one directly below — at the line just written
	 * rather than at the foot of the section, so a list grows out of the item
	 * being written.
	 */
	private finishReviewItem(section: ReviewSectionId, index: number, next: boolean): void {
		const items = this.schedule?.review[section];
		const item = items?.[index];
		if (!items || item === undefined) {
			return;
		}

		if (normalizeTaskText(item).length === 0) {
			items.splice(index, 1);
			this.renderBoard(this.requireSchedule());
			return;
		}
		if (next) {
			void this.insertReviewItem(section, index + 1);
		}
	}

	/**
	 * Stores what one item's editor holds.
	 *
	 * Normalized the way a task's text is — every line trimmed, blank lines
	 * dropped — because that is what the file can hold: an item is a bullet, and
	 * there is no blank line inside one. Keeping the model to the same shape as
	 * the file means the board never shows a line the week would not save.
	 */
	private setReviewItem(section: ReviewSectionId, index: number, value: string): void {
		const items = this.schedule?.review[section];
		if (!items || index < 0 || index >= items.length) {
			return;
		}
		const text = normalizeTaskText(value);
		if (items[index] === text) {
			return;
		}
		items[index] = text;
		this.save();
	}

	/**
	 * Fits the day columns to the pane.
	 *
	 * Three per row is the intended shape, so that is the ceiling. On a narrow
	 * pane the columns give way instead, which also holds a day wide enough for
	 * its task text to read.
	 */
	private updateColumns(): void {
		const width = this.contentEl.clientWidth;
		if (width === 0) {
			return;
		}

		const columns = fitColumns(
			width - 36 - PANE_SLACK,
			MIN_DAY_WIDTH,
			MAX_COLUMNS,
			GRID_GAP + 22,
			this.schedule?.days.length ?? 7,
		);
		if (columns === this.columns) {
			return;
		}
		this.columns = columns;
		this.contentEl.style.setProperty('--ws-columns', String(columns));
		this.contentEl.style.setProperty('--ws-review-span', String(reviewSpan(columns)));
	}

	private renderToolbar(): void {
		this.toolbarEl = this.contentEl.createDiv({ cls: 'weekly-schedule-toolbar' });

		const navigation = this.toolbarEl.createDiv({ cls: 'weekly-schedule-nav' });
		this.addIconButton(navigation, 'chevron-left', t('board.previousWeek'), () =>
			void this.navigate(-1),
		);
		const label = navigation.createDiv({ cls: 'weekly-schedule-week-label' });
		label.setText(formatWeekLabel(this.momentOf(this.weekStart)));
		this.addIconButton(navigation, 'chevron-right', t('board.nextWeek'), () =>
			void this.navigate(1),
		);

		const actions = this.toolbarEl.createDiv({ cls: 'weekly-schedule-actions' });
		this.addTextButton(actions, t('board.thisWeek'), () => void this.goToToday());
		// What the previous week left unfinished is the first thing a new week
		// needs, so it sits beside the week it lands in rather than behind a menu.
		this.addIconButton(actions, 'arrow-down', t('command.carryOver'), () =>
			void this.plugin.carryOverFromLastWeek(),
		);
		// The daily half of the same idea lives on the day it lands on rather
		// than here: see `renderDay`. It is a move onto one particular day, so
		// it belongs to that day's column, not to the week's toolbar.
		// Steps are fine for a week or two; this is the way to a distant one.
		this.addIconButton(actions, YEAR_VIEW_ICON, t('board.yearOverview'), () =>
			void this.plugin.activateYearView(),
		);
		this.addIconButton(
			actions,
			this.showCompleted ? 'eye' : 'eye-off',
			t(this.showCompleted ? 'board.hideCompleted' : 'board.showCompleted'),
			() => {
				this.showCompleted = !this.showCompleted;
				if (this.schedule) {
					this.renderBoard(this.schedule);
				}
				this.app.workspace.requestSaveLayout();
			},
		);
		this.addIconButton(actions, 'file-text', t('board.openNote'), () => void this.openFile());
	}

	/**
	 * The class defaults to the toolbar's, since that is where most of these
	 * live; a caller placing one elsewhere passes its own instead of overriding
	 * sizes the toolbar's class sets.
	 *
	 * `aria-label` is what draws the hover hint — Obsidian tooltips an element
	 * by that attribute alone, below the pointer by default — so the label is
	 * not just there for a screen reader, and `setTooltip` would add nothing.
	 */
	private addIconButton(
		parent: HTMLElement,
		icon: string,
		tooltip: string,
		onClick: () => void,
		cls = 'clickable-icon weekly-schedule-button',
	): HTMLElement {
		const button = parent.createEl('button', {
			cls,
			attr: { type: 'button', 'aria-label': tooltip },
		});
		setIcon(button, icon);
		button.addEventListener('click', onClick);
		return button;
	}

	private addTextButton(parent: HTMLElement, label: string, onClick: () => void): HTMLElement {
		const button = parent.createEl('button', {
			cls: 'weekly-schedule-text-button',
			text: label,
			attr: { type: 'button' },
		});
		button.addEventListener('click', onClick);
		return button;
	}

	private renderDay(day: Day, index: number): void {
		const board = this.boardEl;
		if (!board) {
			return;
		}

		const column = board.createDiv({ cls: 'weekly-schedule-day' });
		const header = column.createDiv({ cls: 'weekly-schedule-day-header' });
		header.createSpan({ cls: 'weekly-schedule-day-name', text: dayLabel(day.id) });
		const dateEl = header.createSpan({ cls: 'weekly-schedule-day-date' });
		const date = this.datesOfWeek()[index] ?? null;
		if (date) {
			dateEl.setText(date.format('M/D'));
		}

		// Remaining work for the day, so a full week is scannable at a glance. A
		// task the board has only just opened counts once it holds something: a
		// row waiting for its first keystroke is not work left over.
		const count = header.createSpan({ cls: 'weekly-schedule-day-count' });
		const open = day.quadrants.reduce(
			(total, quadrant) =>
				total + quadrant.tasks.filter((task) => !task.done && hasTaskText(task)).length,
			0,
		);
		count.setText(open > 0 ? t('day.openCount', { count: open }) : '');

		this.applyToday(column, date !== null && isSameDay(date, moment()));

		const cells = column.createDiv({ cls: 'weekly-schedule-cells' });
		for (const quadrant of day.quadrants) {
			this.renderQuadrant(cells, quadrant);
		}
	}

	/**
	 * Marks a day column as today's — one accent rule under its heading — and
	 * gives it the button that moves yesterday's unfinished tasks onto it.
	 *
	 * The mark and the button are decided in one place, and this is called both
	 * when the board is drawn and when the date rolls over: a board left open
	 * past midnight would otherwise keep the button on the day that has just
	 * ended, next to a highlight that had already moved on.
	 *
	 * The styling hangs off the column, and the header carries the class too
	 * because a theme may target either. The button is worn by today's column
	 * and no other — there is one today in a week, and it is where the work
	 * lands — and it shows itself only under the pointer (styles.css). A column
	 * that is not today is given no button rather than a hidden one, since a
	 * hidden button is still a stop for the keyboard.
	 */
	private applyToday(column: HTMLElement, today: boolean): void {
		column.toggleClass('is-today', today);

		const header = column.querySelector<HTMLElement>('.weekly-schedule-day-header');
		header?.toggleClass('is-today', today);

		const button = header?.querySelector('.weekly-schedule-day-carry');
		if (!today) {
			button?.remove();
			return;
		}
		if (button || !header) {
			return;
		}

		const carried = this.addIconButton(
			header,
			DAY_CARRY_ICON,
			t('command.carryOverDay'),
			() => void this.plugin.carryOverFromYesterday(),
			'weekly-schedule-day-carry',
		);
		// Placed just before the day's remaining count, and the two travel to the
		// right edge together: the button takes the free space rather than the
		// count doing it alone (styles.css). Appending would leave it on the far
		// side of the count, which is where the eye reads the count's own number.
		const count = header.querySelector('.weekly-schedule-day-count');
		if (count) {
			header.insertBefore(carried, count);
		}
	}

	/** Calendar dates of the displayed week, in column order. */
	private datesOfWeek(): Moment[] {
		return weekDays(this.momentOf(this.weekStart), this.weekStartDay);
	}

	private renderQuadrant(parent: HTMLElement, quadrant: Quadrant): void {
		const layout = this.plugin.slotLayout();
		const slot = layout.slotById(quadrant.id);
		// The colour is the cell's own, by position in the palette rather than by
		// id: an id is chosen by the user and no stylesheet can be written for a
		// word it has never seen. `data-slot-id` carries the id for the tests and
		// for anyone looking at the DOM.
		const cell = parent.createDiv({
			cls: slot
				? `weekly-schedule-cell weekly-schedule-cell-tone-${slot.tone}`
				: 'weekly-schedule-cell',
			attr: { 'data-slot-id': quadrant.id },
		});

		const header = cell.createDiv({ cls: 'weekly-schedule-cell-header' });
		// One name rather than the two halves of a priority, because a cell is
		// whatever the user calls it. A name they typed reads the same in every
		// language; a cell they left alone keeps the plugin's own wording for one
		// of its quadrants, read in the *interface* language, because this is the
		// board and not the file; a cell they added and have not named yet shows
		// the id it is written under.
		header.createSpan({
			cls: 'weekly-schedule-cell-label',
			text: slotHeading(layout, quadrant.id, getLocale()),
		});

		// An empty cell stays empty: the add row below already says the cell can
		// take a task, and repeating a placeholder in all 28 cells is noise.
		const list = cell.createDiv({ cls: 'weekly-schedule-list' });
		// What a cell can show is not what it holds: completed tasks are hidden
		// while the eye is off, and a cell whose tasks are all hidden has to keep
		// offering the way in.
		const shown = quadrant.tasks.filter((task) => this.showCompleted || !task.done);
		for (const task of shown) {
			this.renderTask(list, quadrant, task);
		}

		// The add row belongs to a cell that cannot show a task. One that can
		// gives it up for good: the way to the next task is Enter, at the end of
		// the task being written, and that costs no line — the button would cost
		// one in every cell of the week, every week, to say what a keystroke can.
		if (shown.length === 0) {
			const add = cell.createEl('button', {
				cls: 'weekly-schedule-add',
				attr: { type: 'button' },
			});
			add.createSpan({ cls: 'weekly-schedule-add-icon', text: '+' });
			add.createSpan({ cls: 'weekly-schedule-add-label', text: t('board.addTask') });
			add.addEventListener('click', () => void this.addTask(quadrant));
		}
	}

	private renderTask(parent: HTMLElement, quadrant: Quadrant, task: Task): void {
		const row = parent.createDiv({ cls: 'weekly-schedule-task' });
		row.toggleClass('is-done', task.done);

		const checkbox = row.createEl('input', {
			cls: 'weekly-schedule-checkbox',
			attr: { type: 'checkbox' },
		});
		checkbox.checked = task.done;
		checkbox.addEventListener('change', () => {
			// The board is only re-rendered when the row is about to disappear,
			// so the completed look has to be applied to this row directly.
			row.toggleClass('is-done', checkbox.checked);
			this.setTaskDone(quadrant, task.id, checkbox.checked);
		});

		const text = row.createDiv({
			cls: 'weekly-schedule-task-text',
			attr: { contenteditable: 'plaintext-only', spellcheck: 'false' },
		});
		text.dataset.taskId = task.id;
		// The hint an empty row shows. It comes from the locale rather than from
		// the stylesheet, where it used to be Chinese in every language.
		text.dataset.placeholder = t('board.taskPlaceholder');
		text.setText(task.text);
		// Read per row rather than captured once: changing the setting re-renders
		// the board, and every row has to be drawn with the new keystroke.
		registerInlineEditor(
			text,
			(value) => {
				this.setTaskText(quadrant, task.id, value);
			},
			{
				commitKey: this.plugin.settings.taskCommitKey,
				onCommit: (next) => this.finishTask(quadrant, task.id, next),
			},
		);

		const controls = row.createDiv({ cls: 'weekly-schedule-row-controls' });
		// "↑ ↓" in the row matches the button hint: reorder, do not delete.
		const up = this.addRowControl(controls, 'chevron-up', t('board.moveUp'));
		up.addEventListener('click', (event) => {
			event.stopPropagation();
			this.moveTask(quadrant, task.id, -1);
		});
		const down = this.addRowControl(controls, 'chevron-down', t('board.moveDown'));
		down.addEventListener('click', (event) => {
			event.stopPropagation();
			this.moveTask(quadrant, task.id, 1);
		});
		const remove = this.addRowControl(controls, 'x', t('board.delete'));
		remove.addEventListener('click', (event) => {
			event.stopPropagation();
			this.removeTask(quadrant, task.id);
		});

		this.addRowMenu(
			row,
			(delta) => this.moveTask(quadrant, task.id, delta),
			() => this.removeTask(quadrant, task.id),
		);
	}

	private addRowControl(parent: HTMLElement, icon: string, tooltip: string): HTMLElement {
		const button = parent.createEl('button', {
			cls: 'clickable-icon weekly-schedule-row-button',
			attr: { type: 'button', 'aria-label': tooltip },
		});
		setIcon(button, icon);
		return button;
	}

	/**
	 * The menu a row offers on a right-click: the three things its own controls
	 * do, for a pointer that would rather not aim at an 18px target and for one
	 * of a keyboard, which has no hover to reveal them with.
	 *
	 * One menu for both kinds of row, because they are one thing — a line of the
	 * board that can be put in another place or dropped — and two menus would be
	 * two places for the same three items to drift apart.
	 */
	private addRowMenu(
		row: HTMLElement,
		move: (delta: number) => void,
		remove: () => void,
	): void {
		row.addEventListener('contextmenu', (event) => {
			event.preventDefault();
			const menu = new Menu();
			menu.addItem((item) =>
				item
					.setTitle(t('board.moveUp'))
					.setIcon('chevron-up')
					.onClick(() => move(-1)),
			);
			menu.addItem((item) =>
				item
					.setTitle(t('board.moveDown'))
					.setIcon('chevron-down')
					.onClick(() => move(1)),
			);
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle(t('board.delete'))
					.setIcon('trash')
					.onClick(() => remove()),
			);
			menu.showAtMouseEvent(event);
		});
	}

	/**
	 * Gives a cell its first task and moves the cursor into it. This is the only
	 * thing the add row does, since a cell that already shows a task does not
	 * have one: there, the way to the next task is Enter at the end of the one
	 * being written.
	 */
	private async addTask(quadrant: Quadrant): Promise<void> {
		// An empty task is invisible while completed tasks are hidden, which
		// would make the click look like it did nothing.
		if (!this.showCompleted) {
			this.showCompleted = true;
		}

		await this.insertTask(quadrant, quadrant.tasks.length);
	}

	/**
	 * What a finished edit leaves behind.
	 *
	 * A task with text stays where it is. An empty one goes: it is never written
	 * to the file, so a keystroke that ended the edit would otherwise leave a row
	 * on the board that the week does not hold. And the keystroke that asked for
	 * another task gets one directly below — at the caret rather than at the foot
	 * of the cell, so a list grows out of the task being written.
	 */
	private finishTask(quadrant: Quadrant, taskId: string, next: boolean): void {
		const index = quadrant.tasks.findIndex((task) => task.id === taskId);
		const task = quadrant.tasks[index];
		if (!task) {
			return;
		}

		// The same question the counts and the file ask, so it is asked the same
		// way: a task holding nothing but a break is a row, not work.
		if (!hasTaskText(task)) {
			quadrant.tasks.splice(index, 1);
			this.renderBoard(this.requireSchedule());
			return;
		}
		if (next) {
			void this.insertTask(quadrant, index + 1);
		}
	}

	/** Draws a new empty task at `index` and puts the caret in it. */
	private async insertTask(quadrant: Quadrant, index: number): Promise<void> {
		const task: Task = { id: createTaskId(), text: '', done: false };
		quadrant.tasks.splice(index, 0, task);
		this.renderBoard(this.requireSchedule());
		await this.focusTask(task.id);
	}

	/**
	 * Stores what a task's editor holds.
	 *
	 * The text is normalized on the way in — lines trimmed, blank lines dropped —
	 * because that is what the file can hold: keeping the model to the same shape
	 * as the file means the board never shows a line the week would not save.
	 */
	private setTaskText(quadrant: Quadrant, taskId: string, value: string): void {
		const text = normalizeTaskText(value);
		const task = quadrant.tasks.find((item) => item.id === taskId);
		if (!task || task.text === text) {
			return;
		}
		task.text = text;
		this.save();
	}

	private setTaskDone(quadrant: Quadrant, taskId: string, done: boolean): void {
		const task = quadrant.tasks.find((item) => item.id === taskId);
		if (!task || task.done === done) {
			return;
		}
		task.done = done;
		this.save();

		if (!this.showCompleted && done && this.schedule) {
			this.renderBoard(this.schedule);
		}
	}

	private removeTask(quadrant: Quadrant, taskId: string): void {
		if (!this.schedule) {
			return;
		}
		quadrant.tasks = quadrant.tasks.filter((task) => task.id !== taskId);
		this.renderBoard(this.schedule);
		this.save();
	}

	private moveTask(quadrant: Quadrant, taskId: string, delta: number): void {
		const index = quadrant.tasks.findIndex((task) => task.id === taskId);
		const target = index + delta;
		if (index === -1 || target < 0 || target >= quadrant.tasks.length) {
			return;
		}

		const [task] = quadrant.tasks.splice(index, 1);
		if (task) {
			quadrant.tasks.splice(target, 0, task);
		}
		this.renderBoard(this.requireSchedule());
		this.save();
		void this.focusTask(taskId);
	}

	private save(): void {
		if (this.schedule) {
			this.plugin.store.markDirty(this.schedule.path);
			this.updateStats(this.schedule);
			this.updateReviewStats(this.schedule);
		}
	}

	private requireSchedule(): WeekSchedule {
		if (!this.schedule) {
			throw new Error('Weekly schedule: board rendered before its data was loaded');
		}
		return this.schedule;
	}

	/**
	 * Focuses a task's inline editor. The browser may not honour `focus()` on a
	 * contenteditable inside a freshly attached element, so this retries briefly.
	 */
	private async focusTask(taskId: string): Promise<void> {
		for (let attempt = 0; attempt < 20; attempt += 1) {
			const rows = this.contentEl.querySelectorAll<HTMLElement>('.weekly-schedule-task');
			for (const row of Array.from(rows)) {
				const editor = row.querySelector<HTMLElement>('.weekly-schedule-task-text');
				if (editor?.dataset.taskId !== taskId) {
					continue;
				}
				editor.focus();
				if (document.activeElement === editor) {
					placeCaretAtEnd(editor);
					return;
				}
			}
			await sleep(25);
		}
	}

	private async openFile(): Promise<void> {
		const path = this.activePath;
		await this.plugin.store.flush(path);
		const file = this.app.vault.getFileByPath(path);
		if (!file) {
			return;
		}
		await this.app.workspace.getLeaf('tab').openFile(file);
	}

	/** The inline editor that currently holds the caret, if any. */
	private focusedEditor(): FocusedEditor | null {
		const active = document.activeElement;
		if (!(active instanceof HTMLElement) || !this.contentEl.contains(active)) {
			return null;
		}
		const text = active.textContent ?? '';
		const taskId = active.dataset.taskId;
		if (taskId) {
			return { kind: 'task', id: taskId, text };
		}
		const section = active.dataset.reviewSection;
		const index = Number(active.dataset.reviewIndex);
		if (section && isReviewSectionId(section) && Number.isInteger(index)) {
			return { kind: 'review', section, index, text };
		}
		return null;
	}

	/** Puts the caret back in the editor it was in before a re-render. */
	private async restoreFocus(editor: FocusedEditor): Promise<void> {
		if (editor.kind === 'review') {
			await this.focusReviewItem(editor.section, editor.index);
			return;
		}
		await this.focusTask(editor.id);
	}

	/**
	 * Focuses one item's editor. Retried for the same reason a task's is: the
	 * browser may not honour `focus()` on a contenteditable inside an element
	 * that has only just been attached.
	 *
	 * Found by where it sits rather than by a name of its own: an item is a line
	 * of a section, and a section's list is drawn in the order it holds.
	 */
	private async focusReviewItem(section: ReviewSectionId, index: number): Promise<void> {
		const selector = `.weekly-schedule-review-text[data-review-section="${section}"]`;
		for (let attempt = 0; attempt < 20; attempt += 1) {
			const fields = this.contentEl.querySelectorAll<HTMLElement>(selector);
			for (const field of Array.from(fields)) {
				if (Number(field.dataset.reviewIndex) !== index) {
					continue;
				}
				field.focus();
				if (document.activeElement === field) {
					placeCaretAtEnd(field);
					return;
				}
			}
			await sleep(25);
		}
	}

	/**
	 * Copies the focused editor's current value into the board. Text typed into
	 * a `contenteditable` lives in the DOM until blur, which would otherwise let
	 * a re-render (for example after an external edit) discard it.
	 *
	 * The value is normalized exactly as a commit would normalize it, so a
	 * re-render while the caret is still in the row cannot bring back a shape the
	 * model had already dropped.
	 */
	private syncFocusedEditor(): void {
		const editor = this.focusedEditor();
		if (!editor || !this.schedule) {
			return;
		}

		if (editor.kind === 'review') {
			this.setReviewItem(editor.section, editor.index, editor.text);
			return;
		}

		const text = normalizeTaskText(editor.text);
		for (const day of this.schedule.days) {
			for (const quadrant of day.quadrants) {
				const task = quadrant.tasks.find((item) => item.id === editor.id);
				if (task && task.text !== text) {
					task.text = text;
					this.save();
					return;
				}
			}
		}
	}
}
