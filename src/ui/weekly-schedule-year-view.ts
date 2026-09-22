import { ItemView, moment, setIcon } from 'obsidian';
import { VIEW_TYPE_WEEKLY_SCHEDULE_YEAR } from '../constants';
import { formatWeekRange } from '../i18n/format';
import { syncLocale, t, tp } from '../i18n';
import { dateKey, isoWeeksOfYear, isoYearOf, startOfWeek } from '../utils/date';
import { fitColumns } from '../utils/helpers';
import type { WorkspaceLeaf } from 'obsidian';
import type WeeklySchedulePlugin from '../main';
import type { Moment } from '../utils/date';
import type { WeekStats } from '../store';

export const YEAR_VIEW_ICON = 'calendar-range';

/**
 * Layout targets for the tile grid.
 *
 * 10 columns is the intended shape. A narrow pane gives up columns so tiles keep
 * their date range, but only down to a floor: below roughly five columns a year
 * of 53 tiles turns into a long scroll, which is worse than slightly small tiles.
 */
const TILE_MIN_WIDTH = 118;
const MIN_COLUMNS = 5;
const MAX_COLUMNS = 10;
const GRID_GAP = 10;
/** Grid padding: 18px each side, and 36px total as used in the fit above. */
const GRID_PADDING = 36;
/** Tile width divided by tile height. 1 would be square; 1.35 is noticeably shorter. */
const TILE_ASPECT = 1.35;
/** Grid padding (36px) plus the scrollbar Obsidian may keep on the pane. */
const PANE_SLACK = 62;

/** Completion percentage -> heat step 0..5, matching the ramp in styles.css. */
function heatStep(percent: number | null): number {
	return percent === null ? 0 : Math.min(5, Math.round(percent / 16.67));
}

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
		return t('view.year');
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

	/**
	 * Redraws the labels after the interface language changed. Both the tiles and
	 * the totals come from data this view already holds, so nothing is re-read.
	 */
	onLocaleChange(): void {
		if (this.isOpen) {
			this.renderBoard();
		}
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
			tile.querySelector<HTMLElement>('.weekly-schedule-year-inner')?.removeAttribute('data-heat');
			tile.style.removeProperty('--ws-heat-current');
			return;
		}

		meta.setText(`${cell.stats.percent ?? 0}%`);
		const inner = tile.querySelector<HTMLElement>('.weekly-schedule-year-inner');
		if (this.isPastWeek(cell) && inner) {
			const step = heatStep(cell.stats.percent);
			inner.dataset.heat = String(step);
			tile.style.setProperty('--ws-heat-current', `var(--ws-heat-${step})`);
		} else {
			inner?.removeAttribute('data-heat');
			tile.style.removeProperty('--ws-heat-current');
		}
		tile.setAttribute('aria-label', this.tileLabel(cell));
	}

	/** Spoken description of a tile: week number, date range and progress. */
	private tileLabel(cell: WeekCell): string {
		return t('year.tile', {
			week: cell.week,
			range: formatWeekRange(cell.start),
			done: cell.stats.done,
			total: cell.stats.total,
		});
	}

	private async render(): Promise<void> {
		// A pane can be opened in the moment between a language change and the
		// next check, so every render reads the language for itself.
		syncLocale();
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
	 */
	private updateColumns(): void {
		const width = this.contentEl.clientWidth;
		if (width === 0) {
			return;
		}

		const fitted = fitColumns(
			width - 36 - PANE_SLACK,
			TILE_MIN_WIDTH,
			MAX_COLUMNS,
			GRID_GAP,
			this.cells.length,
		);
		const columns = Math.max(MIN_COLUMNS, fitted);
		if (columns === this.columns) {
			return;
		}
		this.columns = columns;
		this.contentEl.style.setProperty('--ws-year-columns', String(columns));

		// Give each row the exact width of a column, which is what makes a tile a
		// square. Deriving it in CSS was tried and rejected: `aspect-ratio` did not
		// produce height in the app, and `width: fit-content` from an app-level
		// button rule beat `justify-self: stretch`.
		const rows = Math.ceil(this.cells.length / columns);
		const columnWidth = (this.contentEl.clientWidth - GRID_PADDING - (columns - 1) * GRID_GAP) / columns;
		this.contentEl.style.setProperty('--ws-year-rows', String(rows));
		// Slightly wider than tall. A tile holds three short lines, so a square left
		// a band of empty space under the percentage; this keeps the text and gives
		// back the rest. The content needs about 72px, so the ratio never goes below
		// that at the column widths the fitting produces.
		this.contentEl.style.setProperty(
			'--ws-year-tile',
			`${Math.floor(columnWidth / TILE_ASPECT)}px`,
		);
	}

	/** Column count the grid was last laid out with, for keyboard navigation. */
	private columns = MAX_COLUMNS;

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

			// The tile itself is the ratio box (a ::before owns its square), so all
			// content lives in this inner element.
			const inner = tile.createDiv({ cls: 'weekly-schedule-year-inner' });
			inner.createDiv({ cls: 'weekly-schedule-year-week', text: `W${cell.week}` });
			inner.createDiv({
				cls: 'weekly-schedule-year-range',
				text: formatWeekRange(cell.start),
			});

			const meta = inner.createDiv({ cls: 'weekly-schedule-year-meta' });
			if (cell.stats.total === 0) {
				meta.setText('—');
			} else {
				meta.setText(`${cell.stats.percent ?? 0}%`);
				tile.setAttribute('aria-label', this.tileLabel(cell));
				// Fill depth carries completion. Only finished weeks are filled:
				// a week that has not happened yet has no completion to show.
				if (this.isPastWeek(cell)) {
					const step = heatStep(cell.stats.percent);
					inner.dataset.heat = String(step);
					tile.style.setProperty('--ws-heat-current', `var(--ws-heat-${step})`);
				}
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
		this.addIconButton(nav, 'chevron-left', t('year.previous'), () => void this.shiftYear(-1));
		nav.createDiv({
			cls: 'weekly-schedule-week-label',
			text: t('year.label', { year: this.isoYear }),
		});
		this.addIconButton(nav, 'chevron-right', t('year.next'), () => void this.shiftYear(1));

		// Only navigation and its action live here. The totals go in a footer,
		// because a third child in a space-between toolbar floats in the middle.
		const actions = toolbar.createDiv({ cls: 'weekly-schedule-actions' });
		this.addTextButton(actions, t('year.thisYear'), () => void this.goToCurrentYear());
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
			summary.setText(t('year.noFinishedWeeks'));
			return;
		}

		// Three parts, so the percentage keeps its own accent.
		summary.createSpan({
			text: `${tp('year.weeksDone', withTasks)} · ${tp('year.tasksTotal', total)} · ${t('year.donePrefix')}`,
		});
		summary.createSpan({
			cls: 'weekly-schedule-year-summary-value',
			text: `${Math.round((done / total) * 100)}%`,
		});
		summary.createSpan({ text: t('year.doneSuffix', { done, total }) });
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
