import { Plugin, moment } from 'obsidian';
import { VIEW_TYPE_WEEKLY_SCHEDULE, VIEW_TYPE_WEEKLY_SCHEDULE_YEAR } from './constants';
import {
	DEFAULT_SETTINGS,
	WeeklyScheduleSettings,
	WeeklyScheduleSettingTab,
} from './settings';
import { ScheduleStore } from './store';
import { WeeklyScheduleView } from './ui/weekly-schedule-view';
import { WeeklyScheduleYearView } from './ui/weekly-schedule-year-view';
import { weekFilePath } from './utils/date';
import type { TAbstractFile } from 'obsidian';
import type { Moment } from './utils/date';

export default class WeeklySchedulePlugin extends Plugin {
	settings!: WeeklyScheduleSettings;
	store!: ScheduleStore;

	async onload() {
		await this.loadSettings();

		this.store = new ScheduleStore(this.app.vault);

		this.registerView(
			VIEW_TYPE_WEEKLY_SCHEDULE,
			(leaf) => new WeeklyScheduleView(leaf, this),
		);
		this.registerView(
			VIEW_TYPE_WEEKLY_SCHEDULE_YEAR,
			(leaf) => new WeeklyScheduleYearView(leaf, this),
		);

		this.addRibbonIcon('calendar-days', 'Open weekly schedule', () => {
			void this.activateView();
		});

		this.addCommand({
			id: 'open-board',
			name: 'Open weekly board',
			callback: () => void this.activateView(),
		});

		this.addCommand({
			id: 'open-year-overview',
			name: 'Open year overview',
			callback: () => void this.activateYearView(),
		});

		this.addCommand({
			id: 'current-week',
			name: 'Go to the current week',
			callback: () => void this.navigateToToday(),
		});

		this.addCommand({
			id: 'previous-week',
			name: 'Go to the previous week',
			callback: () => void this.navigateBy(-1),
		});

		this.addCommand({
			id: 'next-week',
			name: 'Go to the next week',
			callback: () => void this.navigateBy(1),
		});

		this.addSettingTab(new WeeklyScheduleSettingTab(this.app, this));

		// Keep the board in sync when its file is edited outside the plugin,
		// for example in a note or by a sync service.
		this.registerEvent(
			this.app.vault.on('modify', (file: TAbstractFile) => {
				void this.handleFileChange(file.path);
			}),
		);
		this.registerEvent(
			this.app.vault.on('delete', (file: TAbstractFile) => {
				void this.viewOf()?.handleFileDeleted(file.path);
				void this.yearViewOf()?.handleFileChange(file.path);
			}),
		);

		// Make sure a pending write lands before Obsidian closes.
		this.registerEvent(
			this.app.workspace.on('quit', () => {
				void this.store.flushAll();
			}),
		);
	}

	onunload() {
		void this.store.flushAll();
	}

	/** Opens the board, or focuses it when it is already open. */
	async activateView(focus = true): Promise<void> {
		const existing = this.viewOf();
		if (existing) {
			if (focus) {
				this.app.workspace.setActiveLeaf(existing.leaf, { focus: true });
			}
			return;
		}

		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({
			type: VIEW_TYPE_WEEKLY_SCHEDULE,
			active: focus,
		});
	}

	/** Opens the year overview, or focuses it when it is already open. */
	async activateYearView(focus = true): Promise<void> {
		const existing = this.yearViewOf();
		if (existing) {
			if (focus) {
				this.app.workspace.setActiveLeaf(existing.leaf, { focus: true });
			}
			await existing.syncToCurrentWeek();
			return;
		}

		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({
			type: VIEW_TYPE_WEEKLY_SCHEDULE_YEAR,
			active: focus,
		});
	}

	/** Switches the board to the week starting at `weekStart` and reveals it. */
	async openWeek(weekStart: string): Promise<void> {
		const view = this.viewOf();
		if (view) {
			await view.setWeekStart(weekStart);
			this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
			return;
		}

		await this.activateView();
		await this.viewOf()?.setWeekStart(weekStart);
	}

	/** Vault path of the file backing the week that starts at `date`. */
	pathForWeek(date: Moment): string {
		return weekFilePath(this.settings.folder, date);
	}

	/** Path currently shown by the board, or null when no board is open. */
	get activeBoardPath(): string | null {
		const view = this.viewOf();
		return view ? weekFilePath(this.settings.folder, this.momentOf(view.currentWeekStart)) : null;
	}

	private momentOf(weekStart: string): Moment {
		return moment(weekStart, 'YYYY-MM-DD').startOf('day');
	}

	/** Applies changed settings to any open board or year overview. */
	async handleSettingsChange(): Promise<void> {
		await this.viewOf()?.refresh();
		await this.yearViewOf()?.refresh();
	}

	private async navigateBy(weeks: number): Promise<void> {
		const view = this.viewOf();
		if (view) {
			await view.navigate(weeks);
			return;
		}
		await this.activateView();
	}

	private async navigateToToday(): Promise<void> {
		const view = this.viewOf();
		if (view) {
			await view.goToToday();
			return;
		}
		await this.activateView();
	}

	private viewOf(): WeeklyScheduleView | null {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_WEEKLY_SCHEDULE)) {
			const view = leaf.view;
			if (view instanceof WeeklyScheduleView) {
				return view;
			}
		}
		return null;
	}

	private yearViewOf(): WeeklyScheduleYearView | null {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_WEEKLY_SCHEDULE_YEAR)) {
			const view = leaf.view;
			if (view instanceof WeeklyScheduleYearView) {
				return view;
			}
		}
		return null;
	}

	private async handleFileChange(path: string): Promise<void> {
		const view = this.viewOf();
		const yearView = this.yearViewOf();
		if (!view && !yearView) {
			this.store.forget(path);
			return;
		}

		await view?.handleFileChange(path);
		await yearView?.handleFileChange(path);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<WeeklyScheduleSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
