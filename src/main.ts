import { Notice, Plugin, moment } from 'obsidian';
import {
	LOCALE_POLL_MS,
	VIEW_TYPE_WEEKLY_SCHEDULE,
	VIEW_TYPE_WEEKLY_SCHEDULE_YEAR,
} from './constants';
import { getLocaleRevision, syncLocale, t } from './i18n';
import {
	DEFAULT_SETTINGS,
	WeeklyScheduleSettings,
	WeeklyScheduleSettingTab,
} from './settings';
import {
	applyYearFolders,
	describeYearFolderMove,
	notifyYearFolderResult,
	planYearFolders,
} from './migrate';
import { ScheduleStore } from './store';
import { WeeklyScheduleView } from './ui/weekly-schedule-view';
import { YEAR_VIEW_ICON, WeeklyScheduleYearView } from './ui/weekly-schedule-year-view';
import { weekFilePath } from './utils/date';
import type { Command, IconName, TAbstractFile, WorkspaceLeaf } from 'obsidian';
import type { TranslationKey } from './i18n';
import type { Moment } from './utils/date';

/**
 * Redraws a view's tab title after a language change.
 *
 * `updateHeader` is what Obsidian itself uses for this, but it is not in the
 * public typings, so it is called only when the runtime provides it. Without it
 * a title keeps the wording it was created with until the pane is reopened.
 */
function refreshLeafTitle(leaf: WorkspaceLeaf): void {
	const updatable = leaf as unknown as { updateHeader?: () => void };
	updatable.updateHeader?.();
}

export default class WeeklySchedulePlugin extends Plugin {
	settings!: WeeklyScheduleSettings;
	store!: ScheduleStore;

	/** Registered commands and ribbon buttons, kept so their names can follow the language. */
	private readonly localizedCommands: { command: Command; key: TranslationKey }[] = [];
	private readonly localizedRibbons: { element: HTMLElement; key: TranslationKey }[] = [];
	/**
	 * Language revision Obsidian's own surfaces were last titled with. The plugin
	 * registers them with the current language, so revision 0 — the revision at
	 * load — needs no pass, and the first check is a no-op.
	 */
	private localizedRevision = 0;
	private settingTab!: WeeklyScheduleSettingTab;

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

		this.addLocalizedRibbon('calendar-days', 'command.openBoard', () => {
			void this.activateView();
		});
		this.addLocalizedRibbon(YEAR_VIEW_ICON, 'command.openYear', () => {
			void this.activateYearView();
		});

		this.addLocalizedCommand('open-board', 'command.openBoard', () => void this.activateView());

		this.addLocalizedCommand('open-year-overview', 'command.openYear', () =>
			void this.activateYearView(),
		);

		this.addLocalizedCommand('move-weeks-into-year-folders', 'command.moveWeeks', () =>
			void this.moveWeeksIntoYearFolders(),
		);

		this.addLocalizedCommand('current-week', 'command.currentWeek', () =>
			void this.navigateToToday(),
		);

		this.addLocalizedCommand('previous-week', 'command.previousWeek', () =>
			void this.navigateBy(-1),
		);

		this.addLocalizedCommand('next-week', 'command.nextWeek', () => void this.navigateBy(1));

		this.settingTab = new WeeklyScheduleSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		// Obsidian switches language in place, without reloading the app and
		// without an event a plugin can subscribe to, so the language is checked
		// on a slow interval. `syncLocale()` only reports an actual change, and
		// every render checks it too, so a freshly opened pane is never stale.
		this.registerInterval(window.setInterval(() => this.applyLocale(), LOCALE_POLL_MS));

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

	/**
	 * Registers a ribbon button whose tooltip follows the interface language.
	 */
	private addLocalizedRibbon(icon: IconName, key: TranslationKey, onClick: () => void): void {
		const element = this.addRibbonIcon(icon, t(key), onClick);
		this.localizedRibbons.push({ element, key });
	}

	/**
	 * Registers a command whose name follows the interface language. The name is
	 * read when a surface shows the command, so retitling is enough; there is no
	 * need to re-register, which would risk duplicate command ids.
	 */
	private addLocalizedCommand(id: string, key: TranslationKey, callback: () => void): void {
		const command = this.addCommand({ id, name: t(key), callback });
		this.localizedCommands.push({ command, key });
	}

	/**
	 * Adopts the interface language when it changed. Called on a slow interval
	 * and by anything that is about to draw text.
	 */
	private applyLocale(): void {
		syncLocale();
		const revision = getLocaleRevision();
		if (revision === this.localizedRevision) {
			return;
		}
		this.localizedRevision = revision;

		for (const { element, key } of this.localizedRibbons) {
			element.setAttribute('aria-label', t(key));
		}
		for (const { command, key } of this.localizedCommands) {
			command.name = t(key);
		}
		for (const leaf of this.localizedLeaves()) {
			refreshLeafTitle(leaf);
		}
		this.settingTab.refresh();

		// Both views redraw from what they already hold: every label is derived
		// from an id and the current language, so a language change needs no file
		// to be read — or rewritten.
		this.viewOf()?.onLocaleChange();
		this.yearViewOf()?.onLocaleChange();
	}

	/** Leaves of both views, the panes whose titles Obsidian draws for us. */
	private localizedLeaves(): WorkspaceLeaf[] {
		return [
			...this.app.workspace.getLeavesOfType(VIEW_TYPE_WEEKLY_SCHEDULE),
			...this.app.workspace.getLeavesOfType(VIEW_TYPE_WEEKLY_SCHEDULE_YEAR),
		];
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

	/**
	 * Moves week files that sit directly in the schedule folder into per-year
	 * folders. Writes are flushed first so the move cannot race a pending save,
	 * and the store is invalidated afterwards because every path changed.
	 *
	 * Public because the settings tab offers it as a button.
	 */
	async moveWeeksIntoYearFolders(): Promise<void> {
		await this.store.flushAll();

		const moves = planYearFolders(this.app.vault, this.settings.folder);
		if (moves.length === 0) {
			new Notice(describeYearFolderMove(moves, false));
			return;
		}

		const { moved, failed } = await applyYearFolders(this.app.vault, moves);
		await this.store.invalidate();
		await this.viewOf()?.refresh();
		await this.yearViewOf()?.refresh();
		notifyYearFolderResult(moved.length, failed.length);
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
