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

/**
 * Layout targets for the tile grid.
 *
 * 13 columns is the intended shape: about a quarter per row, four rows to a
 * 52-week year. A narrow pane gives up columns so tiles keep their date range,
 * but a wide pane never adds more, which would break that row structure.
 */
const TILE_MIN_WIDTH = 78;
const MAX_COLUMNS = 13;
const GRID_GAP = 6;
/** Width of the scrollbar Obsidian may keep on the pane. */
const PANE_SLACK = 26;

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

		// Re-derive the column count whenever the pane is resized; the initial
		// measurement happens at the end of renderBoard.
		const observer = new ResizeObserver(() => this.updateColumns());
		observer.observe(this.contentEl);
		this.register(() => observer.disconnect());

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

	/**
	 * Picks how many tiles go in a row.
	 *
	 * Driven by width only. Squeezing the column count to also fit the height was
	 * tried and rejected: in a short pane it produced very wide tiles with clipped
	 * date ranges, and losing columns costs more than letting the pane scroll.
	 * The count is clamped so a tile is never narrower than its content needs.
	 */
	private updateColumns(): void {
		const width = this.contentEl.clientWidth;
		if (width === 0) {
			return;
		}

		const usable = width - 36 - PANE_SLACK;
		const byWidth = Math.floor((usable + GRID_GAP) / (TILE_MIN_WIDTH + GRID_GAP));
		const columns = Math.max(1, Math.min(this.cells.length, MAX_COLUMNS, byWidth));

		if (columns === this.columns) {
			return;
		}
		this.columns = columns;
		this.contentEl.style.setProperty('--ws-year-columns', String(columns));
	}

	/** Column count the grid was last laid out with, for keyboard navigation. */
	private columns = 13;

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
			tile.toggleClass('is-past', this.isPastWeek(cell));
			tile.toggleClass('is-future', !this.isPastWeek(cell) && dateKey(cell.start) !== currentWeekStart);
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

		this.renderSummary();

		// Now that the grid exists, size it to the pane.
		this.updateColumns();
	}

	private renderToolbar(): void {
		const toolbar = this.contentEl.createDiv({ cls: 'weekly-schedule-toolbar' });
		const nav = toolbar.createDiv({ cls: 'weekly-schedule-nav' });
		this.addIconButton(nav, 'chevron-left', '上一年', () => void this.shiftYear(-1));
		nav.createDiv({ cls: 'weekly-schedule-week-label', text: `${this.isoYear} 年` });
		this.addIconButton(nav, 'chevron-right', '下一年', () => void this.shiftYear(1));

		// Only navigation and its action live here. The totals go in a footer,
		// because a third child in a space-between toolbar floats in the middle.
		const actions = toolbar.createDiv({ cls: 'weekly-schedule-actions' });
		this.addTextButton(actions, '本年', () => void this.goToCurrentYear());
	}

	/**
	 * Year totals, below the grid. The percentage counts only weeks that are
	 * already over: a year in progress always reads low otherwise, which makes
	 * the number useless for judging how the year is going.
	 */
	private renderSummary(): void {
		const summary = this.contentEl.createDiv({ cls: 'weekly-schedule-year-summary' });

		const past = this.cells.filter((cell) => this.isPastWeek(cell));
		const total = past.reduce((sum, cell) => sum + cell.stats.total, 0);
		const done = past.reduce((sum, cell) => sum + cell.stats.done, 0);
		const withTasks = past.filter((cell) => cell.stats.total > 0).length;

		if (total === 0) {
			summary.setText('本年还没有已结束的待办');
			return;
		}

		summary.createSpan({ text: `已结束 ${withTasks} 周 · 共 ${total} 项 · 完成 ` });
		summary.createSpan({
			cls: 'weekly-schedule-year-summary-value',
			text: `${Math.round((done / total) * 100)}%`,
		});
		summary.createSpan({ text: `（${done}/${total}）` });
	}

	/** Whether a week has finished, i.e. it is not the current or a future week. */
	private isPastWeek(cell: WeekCell): boolean {
		const currentStart = startOfWeek(moment(), this.plugin.settings.weekStartsOn);
		return dateKey(cell.start) < dateKey(currentStart);
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
		const deltas: Record<string, number> = {
			ArrowLeft: -1,
			ArrowRight: 1,
			ArrowUp: -this.columns,
			ArrowDown: this.columns,
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
