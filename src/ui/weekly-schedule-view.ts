import { ItemView, Menu, moment, setIcon } from 'obsidian';
import { QUADRANTS, VIEW_TYPE_WEEKLY_SCHEDULE } from '../constants';
import {
	dateKey,
	formatWeekLabel,
	isSameDay,
	shiftWeek,
	startOfWeek,
	weekDays,
	weekFilePath,
} from '../utils/date';
import { createTaskId } from '../utils/helpers';
import { placeCaretAtEnd, registerInlineEditor, sleep } from './inline-editor';
import type { Moment } from '../utils/date';
import type { WorkspaceLeaf } from 'obsidian';
import type WeeklySchedulePlugin from '../main';
import type { Day, Quadrant, Task, WeekSchedule } from '../types';

export const VIEW_ICON = 'calendar-days';

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
		return 'Weekly schedule';
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
		const focused = this.focusedEditor()?.taskId ?? null;

		// The file changed elsewhere while this board held an unflushed edit.
		// Reloading now would discard that edit, so the in-memory board wins and
		// the pending debounced save writes it out.
		if (this.plugin.store.hasLocalEdits(path)) {
			return;
		}

		if (await this.plugin.store.reloadIfChanged(path)) {
			await this.render();
			if (focused) {
				await this.focusTask(focused);
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
		this.renderBoard(schedule);
	}

	private renderBoard(schedule: WeekSchedule): void {
		this.contentEl.empty();
		this.renderToolbar();
		this.boardEl = this.contentEl.createDiv({ cls: 'weekly-schedule-board' });
		schedule.days.forEach((day, index) => this.renderDay(day, index));
	}

	private renderToolbar(): void {
		this.toolbarEl = this.contentEl.createDiv({ cls: 'weekly-schedule-toolbar' });

		const navigation = this.toolbarEl.createDiv({ cls: 'weekly-schedule-nav' });
		this.addIconButton(navigation, 'chevron-left', '上一周', () => void this.navigate(-1));
		const label = navigation.createDiv({ cls: 'weekly-schedule-week-label' });
		label.setText(formatWeekLabel(this.momentOf(this.weekStart)));
		this.addIconButton(navigation, 'chevron-right', '下一周', () => void this.navigate(1));

		const actions = this.toolbarEl.createDiv({ cls: 'weekly-schedule-actions' });
		this.addTextButton(actions, '本周', () => void this.goToToday());
		this.addIconButton(
			actions,
			this.showCompleted ? 'eye' : 'eye-off',
			this.showCompleted ? '隐藏已完成' : '显示已完成',
			() => {
				this.showCompleted = !this.showCompleted;
				if (this.schedule) {
					this.renderBoard(this.schedule);
				}
				this.app.workspace.requestSaveLayout();
			},
		);
		this.addIconButton(actions, 'file-text', '打开所在笔记', () => void this.openFile());
	}

	private addIconButton(
		parent: HTMLElement,
		icon: string,
		tooltip: string,
		onClick: () => void,
	): HTMLElement {
		const button = parent.createEl('button', {
			cls: 'clickable-icon weekly-schedule-button',
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
		header.createSpan({ cls: 'weekly-schedule-day-name', text: day.label });
		const dateEl = header.createSpan({ cls: 'weekly-schedule-day-date' });
		const date = this.datesOfWeek()[index] ?? null;
		if (date) {
			dateEl.setText(date.format('M/D'));
		}

		// Remaining work for the day, so a full week is scannable at a glance.
		const count = header.createSpan({ cls: 'weekly-schedule-day-count' });
		const open = day.quadrants.reduce(
			(total, quadrant) => total + quadrant.tasks.filter((task) => !task.done).length,
			0,
		);
		count.setText(open > 0 ? `${open} 项` : '');

		const today = date ? isSameDay(date, moment()) : false;
		column.toggleClass('is-today', today);
		header.toggleClass('is-today', today);

		const cells = column.createDiv({ cls: 'weekly-schedule-cells' });
		for (const quadrant of day.quadrants) {
			this.renderQuadrant(cells, day, quadrant);
		}
	}

	/** Calendar dates of the displayed week, in column order. */
	private datesOfWeek(): Moment[] {
		return weekDays(this.momentOf(this.weekStart), this.weekStartDay);
	}

	private renderQuadrant(parent: HTMLElement, day: Day, quadrant: Quadrant): void {
		const definition = QUADRANTS.find((item) => item.id === quadrant.id);
		const cell = parent.createDiv({
			cls: `weekly-schedule-cell weekly-schedule-cell-${quadrant.id}`,
		});

		const header = cell.createDiv({ cls: 'weekly-schedule-cell-header' });
		if (definition) {
			header.createSpan({
				cls: 'weekly-schedule-cell-label',
				text: definition.important ? '重要' : '不重要',
			});
			header.createSpan({ cls: 'weekly-schedule-cell-sep', text: '·' });
			header.createSpan({
				cls: 'weekly-schedule-cell-label',
				text: definition.urgent ? '紧急' : '不紧急',
			});
		}

		// An empty cell stays empty: the add row below already says the cell can
		// take a task, and repeating a placeholder in all 28 cells is noise.
		const list = cell.createDiv({ cls: 'weekly-schedule-list' });
		for (const task of quadrant.tasks) {
			if (!this.showCompleted && task.done) {
				continue;
			}
			this.renderTask(list, quadrant, task);
		}

		const add = cell.createEl('button', {
			cls: 'weekly-schedule-add',
			attr: { type: 'button' },
		});
		add.createSpan({ cls: 'weekly-schedule-add-icon', text: '+' });
		add.createSpan({ cls: 'weekly-schedule-add-label', text: '添加一个待办事项' });
		add.addEventListener('click', () => void this.addTask(day, quadrant));
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
			this.setTaskDone(quadrant, task.id, checkbox.checked);
		});

		const text = row.createDiv({
			cls: 'weekly-schedule-task-text',
			attr: { contenteditable: 'plaintext-only', spellcheck: 'false' },
		});
		text.dataset.taskId = task.id;
		text.setText(task.text);
		registerInlineEditor(text, (value) => {
			this.setTaskText(quadrant, task.id, value);
		});

		const controls = row.createDiv({ cls: 'weekly-schedule-task-controls' });
		// "↑ ↓" in the row matches the button hint: reorder, do not delete.
		const up = this.addTaskControl(controls, 'chevron-up', '上移');
		up.addEventListener('click', (event) => {
			event.stopPropagation();
			this.moveTask(quadrant, task.id, -1);
		});
		const down = this.addTaskControl(controls, 'chevron-down', '下移');
		down.addEventListener('click', (event) => {
			event.stopPropagation();
			this.moveTask(quadrant, task.id, 1);
		});
		const remove = this.addTaskControl(controls, 'x', '删除');
		remove.addEventListener('click', (event) => {
			event.stopPropagation();
			this.removeTask(quadrant, task.id);
		});

		row.addEventListener('contextmenu', (event) => {
			event.preventDefault();
			const menu = new Menu();
			menu.addItem((item) =>
				item
					.setTitle('上移')
					.setIcon('chevron-up')
					.onClick(() => this.moveTask(quadrant, task.id, -1)),
			);
			menu.addItem((item) =>
				item
					.setTitle('下移')
					.setIcon('chevron-down')
					.onClick(() => this.moveTask(quadrant, task.id, 1)),
			);
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle('删除')
					.setIcon('trash')
					.onClick(() => this.removeTask(quadrant, task.id)),
			);
			menu.showAtMouseEvent(event);
		});
	}

	private addTaskControl(parent: HTMLElement, icon: string, tooltip: string): HTMLElement {
		const button = parent.createEl('button', {
			cls: 'clickable-icon weekly-schedule-task-button',
			attr: { type: 'button', 'aria-label': tooltip },
		});
		setIcon(button, icon);
		return button;
	}

	/**
	 * Appends a task and moves the cursor into it. The task starts empty and is
	 * therefore not written to disk until it has text, so an accidental click
	 * leaves no trace in the file.
	 */
	private async addTask(day: Day, quadrant: Quadrant): Promise<void> {
		// An empty task is invisible while completed tasks are hidden, which
		// would make the click look like it did nothing.
		if (!this.showCompleted) {
			this.showCompleted = true;
		}

		const task: Task = { id: createTaskId(), text: '', done: false };
		quadrant.tasks.push(task);
		this.renderBoard(this.requireSchedule());
		await this.focusTask(task.id);
	}

	private setTaskText(quadrant: Quadrant, taskId: string, text: string): void {
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

	/** Id of the task whose inline editor currently has focus, if any. */
	private focusedEditor(): { taskId: string; text: string } | null {
		const active = document.activeElement;
		if (!(active instanceof HTMLElement) || !this.contentEl.contains(active)) {
			return null;
		}
		const taskId = active.dataset.taskId;
		if (!taskId) {
			return null;
		}
		return { taskId, text: active.textContent ?? '' };
	}

	/**
	 * Copies the focused editor's current value into the board. Text typed into
	 * a `contenteditable` lives in the DOM until blur, which would otherwise let
	 * a re-render (for example after an external edit) discard it.
	 */
	private syncFocusedEditor(): void {
		const editor = this.focusedEditor();
		if (!editor || !this.schedule) {
			return;
		}
		for (const day of this.schedule.days) {
			for (const quadrant of day.quadrants) {
				const task = quadrant.tasks.find((item) => item.id === editor.taskId);
				if (task && task.text !== editor.text) {
					task.text = editor.text;
					this.save();
					return;
				}
			}
		}
	}
}
