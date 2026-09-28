import { Notice, Plugin, moment } from 'obsidian';
import {
	DAY_POLL_MS,
	LOCALE_POLL_MS,
	VIEW_TYPE_WEEKLY_SCHEDULE,
	VIEW_TYPE_WEEKLY_SCHEDULE_YEAR,
} from './constants';
import { getLocale, getLocaleRevision, syncLocale, t, tp } from './i18n';
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
import {
	applyCarryOver,
	applyDayCarryOver,
	markCarried,
	planCarryOver,
	planDayCarryOver,
	previousDayId,
} from './carry-over';
import { ScheduleStore } from './store';
import { CarryOverModal } from './ui/carry-over-modal';
import { WeeklyScheduleView } from './ui/weekly-schedule-view';
import { YEAR_VIEW_ICON, WeeklyScheduleYearView } from './ui/weekly-schedule-year-view';
import { formatShortDate } from './i18n/format';
import { dateKey, dayIdOf, shiftWeek, startOfWeek, weekFilePath, weekKey } from './utils/date';
import { watchDayChange } from './utils/day-watch';
import type { Command, IconName, TAbstractFile, WorkspaceLeaf } from 'obsidian';
import type { CarryOverItem } from './carry-over';
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

		this.addLocalizedCommand('carry-over-last-week', 'command.carryOver', () =>
			void this.carryOverFromLastWeek(),
		);

		this.addLocalizedCommand('carry-over-yesterday', 'command.carryOverDay', () =>
			void this.carryOverFromYesterday(),
		);

		this.settingTab = new WeeklyScheduleSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		// Obsidian switches language in place, without reloading the app and
		// without an event a plugin can subscribe to, so the language is checked
		// on a slow interval. `syncLocale()` only reports an actual change, and
		// every render checks it too, so a freshly opened pane is never stale.
		this.registerInterval(window.setInterval(() => this.applyLocale(), LOCALE_POLL_MS));

		// A pane can stay open for days, and nothing else would tell it that the
		// day it drew as today is over. The date is polled, and re-checked the
		// moment the window is looked at again — a laptop opened the next morning
		// then updates at once rather than on the next tick.
		const checkDay = watchDayChange(() => this.applyNewDay());
		this.registerInterval(window.setInterval(checkDay, DAY_POLL_MS));
		this.registerDomEvent(window, 'focus', checkDay);
		this.registerDomEvent(document, 'visibilitychange', checkDay);

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

	/**
	 * Adopts a new calendar date. A day change alters nothing a week holds, so
	 * both views only redraw what is drawn relative to today: the highlighted
	 * day on the board, and the current-week tile in the year overview.
	 */
	private applyNewDay(): void {
		this.viewOf()?.onDayChange();
		this.yearViewOf()?.onDayChange();
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

	/**
	 * Brings the unfinished tasks of the previous week into the week on screen.
	 *
	 * The previous week is the one before whatever the board shows, so this works
	 * on the week being looked at rather than only on the current one; with no
	 * board open it is the current week. Nothing is taken out of the previous
	 * week — the tasks are copied over — and a task the target cell already holds
	 * is skipped, so running this twice changes nothing.
	 *
	 * Which of those tasks still deserve a place in the new week is the user's
	 * call, so this asks before it moves anything.
	 *
	 * Public because the board's toolbar offers it as a button.
	 */
	async carryOverFromLastWeek(): Promise<void> {
		const view = this.viewOf();
		const targetStart =
			view?.currentWeekStart ?? dateKey(startOfWeek(moment(), this.settings.weekStartsOn));
		const sourceStart = dateKey(shiftWeek(this.momentOf(targetStart), -1));

		// Commit the board before reading the weeks: task text lives in the DOM
		// until the editor blurs, and both weeks are read from memory below.
		await view?.commitPendingEdits();

		const target = await this.store.load(
			targetStart,
			this.pathForWeek(this.momentOf(targetStart)),
		);
		const source = await this.store.load(
			sourceStart,
			this.pathForWeek(this.momentOf(sourceStart)),
		);
		const plan = planCarryOver(source, target);

		if (plan.items.length === 0) {
			new Notice(t('carry.none'));
			return;
		}

		const weeks = {
			from: weekKey(this.momentOf(sourceStart)),
			to: weekKey(this.momentOf(targetStart)),
		};
		new CarryOverModal(this.app, { ...weeks, items: plan.items }, (chosen) => {
			void this.applyCarryOverChoice(chosen, weeks, { source: sourceStart, target: targetStart });
		}).open();
	}

	/**
	 * Applies what the dialog confirmed: the chosen tasks are added to the week
	 * they were carried into, and the week they came from is marked with where
	 * they went.
	 *
	 * Both weeks are read from the store again rather than carried over from the
	 * planning above. The dialog can sit open while a week is edited underneath
	 * it, and what the store hands out is what a write serializes, so reading
	 * here is what keeps a stale plan from writing a stale week.
	 */
	private async applyCarryOverChoice(
		chosen: readonly CarryOverItem[],
		weeks: { from: string; to: string },
		start: { source: string; target: string },
	): Promise<void> {
		const view = this.viewOf();
		const sourcePath = this.pathForWeek(this.momentOf(start.source));
		const targetPath = this.pathForWeek(this.momentOf(start.target));

		const source = await this.store.load(start.source, sourcePath);
		const target = await this.store.load(start.target, targetPath);

		const added = applyCarryOver(target, chosen);
		// The mark goes on in the language the file is already written in, not the
		// interface language: a week's file keeps the language it was written in.
		markCarried(source, chosen, weeks.to, source.locale ?? getLocale());

		// The week the work went into is written first: a previous week marked as
		// carried, with nothing to show for it in the week it names, is the worse
		// half to be left holding.
		if (!(await this.store.flush(targetPath))) {
			// The file could not be written. Take the change back rather than leave
			// a board showing work that no file holds; the source never changed, so
			// nothing else has to be undone.
			this.store.forget(targetPath);
			this.store.forget(sourcePath);
			await view?.reloadWeek();
			new Notice(t('carry.failed'));
			return;
		}

		if (!(await this.store.flush(sourcePath))) {
			new Notice(t('carry.markFailed', weeks));
			return;
		}

		// Counted apart because the two differ in what the target week gained: a
		// task that was already there gained it nothing, and only picked up a mark.
		const there = chosen.length - added;
		if (added === 0) {
			new Notice(tp('carry.allThere', chosen.length, weeks));
			return;
		}
		new Notice(
			there > 0
				? tp('carry.resultSkipped', added, { ...weeks, skipped: there })
				: tp('carry.result', added, weeks),
		);
	}

	/**
	 * Brings yesterday's unfinished tasks into today, in one step.
	 *
	 * The daily counterpart of the weekly move, and deliberately unlike it: the
	 * tasks are taken out of yesterday rather than copied, so a day that is over
	 * holds only what is still open on it. There is nothing to confirm — a single
	 * day's leftovers are already a short list — and nothing to mark, because
	 * nothing is left behind.
	 *
	 * Both days live in the same week's file, and only there: on a Monday the day
	 * before is the previous week's Sunday, which this does not reach. The week
	 * to move within is the one today falls in, whatever the board is showing.
	 *
	 * Public because the board's toolbar offers it as a button.
	 */
	async carryOverFromYesterday(): Promise<void> {
		const view = this.viewOf();

		// Commit the board before rewriting its week: today's text lives in the
		// DOM until the editor blurs, and the day is read from memory below.
		await view?.commitPendingEdits();

		const today = moment();
		const to = dayIdOf(today);
		const from = previousDayId(to);
		if (from === null) {
			// Monday. Yesterday is in another file, which is the weekly move's
			// business rather than this one's.
			new Notice(t('carry.dayCrossesWeek'));
			return;
		}

		const weekStart = dateKey(startOfWeek(today, this.settings.weekStartsOn));
		const path = this.pathForWeek(this.momentOf(weekStart));
		const schedule = await this.store.load(weekStart, path);
		const plan = planDayCarryOver(schedule, from, to);
		const days = {
			from: formatShortDate(today.clone().subtract(1, 'day')),
			to: formatShortDate(today),
		};

		if (plan.moves.length === 0) {
			// Both cases read as "nothing to move", but they differ in why: one
			// day is empty, the other already holds everything.
			new Notice(
				plan.alreadyThere > 0
					? tp('carry.dayAllThere', plan.alreadyThere, days)
					: t('carry.dayNone'),
			);
			return;
		}

		const moved = applyDayCarryOver(schedule, plan);

		if (!(await this.store.flush(path))) {
			// The file could not be written. Take the move back rather than leave
			// a board showing days no file holds.
			this.store.forget(path);
			if (view && view.activePath === path) {
				await view.reloadWeek();
			}
			new Notice(t('carry.dayFailed'));
			return;
		}

		// The board holds the schedule it drew, and this is one of the few cases
		// where the plugin rewrote that very week itself. A board on another week
		// has nothing to redraw, and its own week is not the one that changed.
		if (view && view.activePath === path) {
			await view.reloadWeek();
		}

		new Notice(
			plan.alreadyThere > 0
				? tp('carry.dayResultSkipped', moved, { ...days, skipped: plan.alreadyThere })
				: tp('carry.dayResult', moved, days),
		);
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
