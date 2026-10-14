import { PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_FOLDER, DEFAULT_SLOTS, WEEK_START_OPTIONS } from './constants';
import { dayLabel, t } from './i18n';
import { normalizeSlotConfig } from './slots';
import { isRecord, normalizeFolder } from './utils/helpers';
import type { App } from 'obsidian';
import type { TranslationKey } from './i18n';
import type { RetiredSlots, Slot, TaskCommitKey } from './types';
import type WeeklySchedulePlugin from './main';

export interface WeeklyScheduleSettings {
	/** Vault folder holding the weekly Markdown files. */
	folder: string;
	/** First day of the week: 1 = Monday, 0 = Sunday. */
	weekStartsOn: number;
	/**
	 * Which Enter commits a task's text. A task may run over several lines, so
	 * the other Enter has to be free to start one.
	 */
	taskCommitKey: TaskCommitKey;
	/**
	 * The cells a day has, in the order the board draws them — one to eight of
	 * them, and never none.
	 *
	 * This is the one setting that decides what a week's *file* looks like, so
	 * it is the one that has to be changed in the right order; see
	 * `WeeklySchedulePlugin.applySlotChange`.
	 */
	slots: Slot[];
	/**
	 * Where the work of a removed cell went, as `removed id → the cell that took
	 * over`. Kept for ever: it is what reads a week written before the cell was
	 * removed, and the heading in that week still names the id.
	 */
	retiredSlots: RetiredSlots;
}

/**
 * What a vault has before any of it is configured.
 *
 * **Copied, never handed out as it stands.** `slots` is the first reference
 * type in these settings, so a caller given this object directly would share
 * its array with every other caller — and a settings tab that reordered a cell
 * would reorder the default for the rest of the session, in every pane. Build
 * settings with `normalizeSettings`, which always answers with its own array.
 */
export const DEFAULT_SETTINGS: WeeklyScheduleSettings = {
	folder: DEFAULT_FOLDER,
	weekStartsOn: 1,
	taskCommitKey: 'enter',
	slots: DEFAULT_SLOTS.map((slot) => ({ ...slot })),
	retiredSlots: {},
};

/**
 * Settings as they should be used, from whatever `loadData()` returned.
 *
 * The one place settings are built, so that everything downstream can trust the
 * shape it is handed — where `Object.assign({}, DEFAULT_SETTINGS, loaded)` used
 * to stand, and could not: it copies arrays and objects *by reference*, so the
 * settings a vault loaded and the defaults they fell back to would have been
 * the same array, and one pane editing a cell would edit it for every pane and
 * for every vault opened afterwards in that session.
 *
 * The two structured fields go through `normalizeSlotConfig`, which is the rule
 * for what a file may say about cells; the scalars are read the way a shallow
 * assign read them — present and of the right type wins, missing or nonsensical
 * falls back to the default. A field of the wrong type is not trusted as a
 * near-miss: a settings file is data, and a `taskCommitKey` of `42` means the
 * key the plugin knows rather than one the inline editor has never heard of.
 */
export function normalizeSettings(stored: unknown): WeeklyScheduleSettings {
	const file: Record<string, unknown> = isRecord(stored) ? stored : {};
	const { slots, retiredSlots } = normalizeSlotConfig(file);
	const taskCommitKey = file.taskCommitKey;
	return {
		folder: typeof file.folder === 'string' ? file.folder : DEFAULT_SETTINGS.folder,
		weekStartsOn:
			typeof file.weekStartsOn === 'number' ? file.weekStartsOn : DEFAULT_SETTINGS.weekStartsOn,
		taskCommitKey:
			typeof taskCommitKey === 'string' && isTaskCommitKey(taskCommitKey)
				? taskCommitKey
				: DEFAULT_SETTINGS.taskCommitKey,
		slots,
		retiredSlots,
	};
}

/**
 * The two Enter keystrokes, in the order the dropdown offers them, each with the
 * dictionary key that words it. The default comes first.
 */
export const TASK_COMMIT_KEY_OPTIONS: readonly {
	value: TaskCommitKey;
	labelKey: TranslationKey;
}[] = [
	{ value: 'enter', labelKey: 'settings.taskCommitKey.enter' },
	{ value: 'shiftEnter', labelKey: 'settings.taskCommitKey.shiftEnter' },
];

export function isTaskCommitKey(value: string): value is TaskCommitKey {
	return TASK_COMMIT_KEY_OPTIONS.some((option) => option.value === value);
}

/**
 * Settings tab.
 *
 * Built with the imperative `Setting` API rather than the declarative one added
 * in Obsidian 1.13. The declarative API would put these options into Obsidian's
 * settings search, which is a real nicety, but it lifts minAppVersion to 1.13.0
 * and so shuts out everyone on an older release. Three settings and three
 * buttons do not justify that.
 */
// The declarative settings API would add these options to Obsidian's settings
// search, but it requires Obsidian 1.13 and would raise minAppVersion with it.
// The lint rule that asks for it must not be disabled (the config blocks that),
// so it reports a warning here; it is a deliberate trade-off, not an oversight.
export class WeeklyScheduleSettingTab extends PluginSettingTab {
	plugin: WeeklySchedulePlugin;

	constructor(app: App, plugin: WeeklySchedulePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Rebuilds the tab, which is how a language change reaches an open settings
	 * pane. `display()` is deprecated in Obsidian 1.13 in favour of the declarative
	 * settings API, but that API is exactly what this tab does without, so calling
	 * it is the imperative equivalent — and Obsidian's own typings keep it for
	 * plugins that support releases older than 1.13.0.
	 */
	refresh(): void {
		if (this.containerEl.isConnected) {
			this.display();
		}
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName(t('settings.folder.name'))
			.setDesc(t('settings.folder.desc'))
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_FOLDER)
					.setValue(this.plugin.settings.folder)
					.onChange(async (value) => {
						const folder = normalizeFolder(value);
						if (folder === this.plugin.settings.folder) {
							return;
						}
						this.plugin.settings.folder = folder;
						await this.plugin.saveSettings();
						await this.plugin.handleSettingsChange();
					}),
			);

		new Setting(containerEl)
			.setName(t('settings.weekStart.name'))
			.setDesc(t('settings.weekStart.desc'))
			.addDropdown((dropdown) => {
				for (const option of WEEK_START_OPTIONS) {
					dropdown.addOption(String(option.value), dayLabel(option.day));
				}
				dropdown.setValue(String(this.plugin.settings.weekStartsOn));
				dropdown.onChange(async (value) => {
					const weekStartsOn = Number(value);
					if (weekStartsOn === this.plugin.settings.weekStartsOn) {
						return;
					}
					this.plugin.settings.weekStartsOn = weekStartsOn;
					await this.plugin.saveSettings();
					await this.plugin.handleSettingsChange();
				});
			});

		new Setting(containerEl)
			.setName(t('settings.taskCommitKey.name'))
			.setDesc(t('settings.taskCommitKey.desc'))
			.addDropdown((dropdown) => {
				for (const option of TASK_COMMIT_KEY_OPTIONS) {
					dropdown.addOption(option.value, t(option.labelKey));
				}
				dropdown.setValue(this.plugin.settings.taskCommitKey);
				dropdown.onChange(async (value) => {
					if (!isTaskCommitKey(value) || value === this.plugin.settings.taskCommitKey) {
						return;
					}
					this.plugin.settings.taskCommitKey = value;
					await this.plugin.saveSettings();
					await this.plugin.handleSettingsChange();
				});
			});

		new Setting(containerEl)
			.setName(t('settings.openBoard.name'))
			.setDesc(t('settings.openBoard.desc'))
			.addButton((button) =>
				button.setButtonText(t('settings.openBoard.button')).onClick(() => {
					void this.plugin.activateView();
				}),
			);

		new Setting(containerEl)
			.setName(t('settings.openYear.name'))
			.setDesc(t('settings.openYear.desc'))
			.addButton((button) =>
				button.setButtonText(t('settings.openYear.button')).onClick(() => {
					void this.plugin.activateYearView();
				}),
			);

		new Setting(containerEl)
			.setName(t('settings.yearFolders.name'))
			.setDesc(t('settings.yearFolders.desc'))
			.addButton((button) =>
				button.setButtonText(t('settings.yearFolders.button')).onClick(() => {
					void this.plugin.moveWeeksIntoYearFolders();
				}),
			);
	}
}
