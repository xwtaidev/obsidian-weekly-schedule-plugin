import { ItemView, moment, setIcon } from 'obsidian';
import { VIEW_TYPE_WEEKLY_SCHEDULE_YEAR } from '../constants';
import {
	dateKey,
	formatWeekRange,
	isoWeeksOfYear,
	isoYearOf,
	startOfWeek,
} from '../utils/date';
import type { WorkspaceLeaf } from 'obsidian';
import type WeeklySchedulePlugin from '../main';
import type { Moment } from '../utils/date';
import type { WeekStats } from '../store';

export const YEAR_VIEW_ICON = 'calendar-range';

/** Persisted with the workspace so the browsed year survives a restart. */
interface YearViewState extends Record<string, unknown> {
	isoYear?: number;
}

interface WeekCell {
	week: number;
	start: Moment;
	path: string;
	stats: WeekStats;
}

/**
 * A year at a glance: one tile per ISO week, 13 per row. Selecting a tile opens
 * that week in the board, which is far quicker than stepping week by week.
 */
export class WeeklyScheduleYearView extends ItemView {
	private isoYear: number;
	private cells: WeekCell[] = [];
	private selectedIndex = 0;
	private loadToken = 0;
	private isOpen = false;
	private boardEl: HTMLElement | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: WeeklySchedulePlugin,
	) {
		super(leaf);
		this.isoYear = isoYearOf(startOfWeek(moment(), this.plugin.settings.weekStartsOn));
	}

	getViewType(): string {
		return VIEW_TYPE_WEEKLY_SCHEDULE_YEAR;
	}

	getDisplayText(): string {
		return 'Weekly schedule: year';
	}

	getIcon(): string {
		return YEAR_VIEW_ICON;
	}

	getState(): YearViewState {
		return { isoYear: this.isoYear };
	}

	async setState(state: unknown, result: Parameters<ItemView['setState']>[1]): Promise<void> {
		const next = (state ?? {}) as YearViewState;
		if (typeof next.isoYear === 'number' && Number.isFinite(next.isoYear)) {
			this.isoYear = next.isoYear;
		}
		await super.setState(state, result);
		if (this.isOpen) {
			await this.render();
		}
	}

	async onOpen(): Promise<void> {
		this.isOpen = true;
		this.contentEl.addClass('weekly-schedule-year-container');
		this.containerEl.addClass('weekly-schedule-leaf');
		await this.render();
	}

	async onClose(): Promise<void> {
		this.isOpen = false;
		this.contentEl.removeClass('weekly-schedule-year-container');
		this.containerEl.removeClass('weekly-schedule-leaf');
		this.contentEl.empty();
	}

	/** Moves the selection to the week currently open in the board. */
	async syncToCurrentWeek(): Promise<void> {
		const index = this.cells.findIndex((cell) => cell.path === this.plugin.activeBoardPath);
		if (index === -1) {
			return;
		}
		this.selectedIndex = index;
		this.updateSelection();
	}

	async refresh(): Promise<void> {
		await this.render();
	}

	async shiftYear(delta: number): Promise<void> {
		this.isoYear += delta;
		this.selectedIndex = 0;
		await this.render();
		this.app.workspace.requestSaveLayout();
	}

	async goToCurrentYear(): Promise<void> {
		const year = isoYearOf(startOfWeek(moment(), this.plugin.settings.weekStartsOn));
		if (year === this.isoYear) {
			await this.syncToCurrentWeek();
			return;
		}
		this.isoYear = year;
		await this.render();
		await this.syncToCurrentWeek();
		this.app.workspace.requestSaveLayout();
	}

	/** Handles a vault change for a file this overview may be showing. */
	async handleFileChange(path: string): Promise<void> {
		const index = this.cells.findIndex((cell) => cell.path === path);
		if (index === -1) {
			this.plugin.store.forget(path);
			return;
		}

		const cell = this.cells[index];
		if (!cell) {
			return;
		}

		// Only one tile can have changed, so refresh that tile rather than
		// rebuilding all fifty-odd of them.
		cell.stats = await this.plugin.store.loadWeekStats(dateKey(cell.start), cell.path);
		this.updateTile(index);
	}

	/** Rewrites a single tile's progress readout in place. */
	private updateTile(index: number): void {
		const cell = this.cells[index];
		const tile = this.tileAt(index);
		const meta = tile?.querySelector('.weekly-schedule-year-meta');
		if (!cell || !tile || !meta) {
			return;
		}

		tile.toggleClass('is-empty', cell.stats.total === 0);
		meta.empty();

		if (cell.stats.total === 0) {
			meta.setText('—');
			tile.removeAttribute('aria-label');
			return;
		}

		meta.createDiv({ cls: 'weekly-schedule-year-bar' })
			.createDiv({ cls: 'weekly-schedule-year-bar-fill' })
			.style.width = `${cell.stats.percent ?? 0}%`;
		meta.createSpan({
			cls: 'weekly-schedule-year-percent',
			text: `${cell.stats.percent ?? 0}%`,
		});
		tile.setAttribute(
			'aria-label',
			`第 ${cell.week} 周，${formatWeekRange(cell.start)}，完成 ${cell.stats.done}/${cell.stats.total}`,
		);
	}

	private async render(): Promise<void> {
		const token = ++this.loadToken;
		const weeks = isoWeeksOfYear(this.isoYear);

		const cells = await Promise.all(
			weeks.map(async (entry): Promise<WeekCell> => {
				const path = this.plugin.pathForWeek(entry.start);
				return {
					week: entry.week,
					start: entry.start,
					path,
					stats: await this.plugin.store.loadWeekStats(dateKey(entry.start), path),
				};
			}),
		);

		if (token !== this.loadToken) {
			return;
		}

		this.cells = cells;
		this.selectedIndex = Math.min(this.selectedIndex, cells.length - 1);
		this.renderBoard();
	}

	private renderBoard(): void {
		this.contentEl.empty();
		this.renderToolbar();

		this.boardEl = this.contentEl.createDiv({ cls: 'weekly-schedule-year-grid' });
		this.boardEl.setAttribute('role', 'grid');
		this.boardEl.tabIndex = 0;
		this.registerDomEvent(this.boardEl, 'keydown', (event) => this.handleKeydown(event));

		const currentWeekStart = dateKey(
			startOfWeek(moment(), this.plugin.settings.weekStartsOn),
		);
		const openPath = this.plugin.activeBoardPath;

		this.cells.forEach((cell, index) => {
			const tile = this.boardEl?.createEl('button', {
				cls: 'weekly-schedule-year-tile',
				attr: { type: 'button', role: 'gridcell' },
			});
			if (!tile) {
				return;
			}

			tile.toggleClass('is-current', dateKey(cell.start) === currentWeekStart);
			tile.toggleClass('is-open', cell.path === openPath);
			tile.toggleClass('is-empty', cell.stats.total === 0);
			tile.toggleClass('is-selected', index === this.selectedIndex);
			tile.dataset.index = String(index);

			tile.createDiv({ cls: 'weekly-schedule-year-week', text: `W${cell.week}` });
			tile.createDiv({
				cls: 'weekly-schedule-year-range',
				text: formatWeekRange(cell.start),
			});

			const meta = tile.createDiv({ cls: 'weekly-schedule-year-meta' });
			if (cell.stats.total === 0) {
				meta.setText('—');
			} else {
				// A quiet bar plus the numbers: the bar is for scanning, the
				// numbers are for precision.
				const bar = meta.createDiv({ cls: 'weekly-schedule-year-bar' });
				bar.createDiv({ cls: 'weekly-schedule-year-bar-fill' }).style.width =
					`${cell.stats.percent ?? 0}%`;
				meta.createSpan({
					cls: 'weekly-schedule-year-percent',
					text: `${cell.stats.percent ?? 0}%`,
				});
				tile.setAttribute(
					'aria-label',
					`第 ${cell.week} 周，${formatWeekRange(cell.start)}，完成 ${cell.stats.done}/${cell.stats.total}`,
				);
			}

			tile.addEventListener('click', () => {
				this.selectedIndex = index;
				void this.openWeek(index);
			});
			tile.addEventListener('focus', () => {
				this.selectedIndex = index;
				this.updateSelection();
			});
		});
	}

	private renderToolbar(): void {
		const toolbar = this.contentEl.createDiv({ cls: 'weekly-schedule-toolbar' });
		const nav = toolbar.createDiv({ cls: 'weekly-schedule-nav' });
		this.addIconButton(nav, 'chevron-left', '上一年', () => void this.shiftYear(-1));
		nav.createDiv({ cls: 'weekly-schedule-week-label', text: `${this.isoYear} 年` });
		this.addIconButton(nav, 'chevron-right', '下一年', () => void this.shiftYear(1));

		const actions = toolbar.createDiv({ cls: 'weekly-schedule-actions' });
		this.addTextButton(actions, '本年', () => void this.goToCurrentYear());

		const total = this.cells.reduce((sum, cell) => sum + cell.stats.total, 0);
		const done = this.cells.reduce((sum, cell) => sum + cell.stats.done, 0);
		const summary = toolbar.createDiv({ cls: 'weekly-schedule-year-summary' });
		summary.setText(
			total === 0 ? '本年还没有待办' : `共 ${total} 项 · 已完成 ${done} 项（${Math.round((done / total) * 100)}%）`,
		);
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

	private handleKeydown(event: KeyboardEvent): void {
		const columns = 13;
		const deltas: Record<string, number> = {
			ArrowLeft: -1,
			ArrowRight: 1,
			ArrowUp: -columns,
			ArrowDown: columns,
		};

		const delta = deltas[event.key];
		if (delta === undefined) {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				void this.openWeek(this.selectedIndex);
			}
			return;
		}

		event.preventDefault();
		const next = this.selectedIndex + delta;
		if (next < 0 || next >= this.cells.length) {
			return;
		}
		this.selectedIndex = next;
		this.updateSelection();
		this.tileAt(next)?.focus();
	}

	private updateSelection(): void {
		this.boardEl
			?.querySelectorAll('.weekly-schedule-year-tile')
			.forEach((tile, index) => tile.toggleClass('is-selected', index === this.selectedIndex));
	}

	private tileAt(index: number): HTMLElement | null {
		const tiles = this.boardEl?.querySelectorAll<HTMLElement>('.weekly-schedule-year-tile');
		return tiles?.[index] ?? null;
	}

	private async openWeek(index: number): Promise<void> {
		const cell = this.cells[index];
		if (!cell) {
			return;
		}
		await this.plugin.openWeek(dateKey(cell.start));
	}
}
