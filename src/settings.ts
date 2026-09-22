import { PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_FOLDER, WEEK_START_OPTIONS } from './constants';
import { dayLabel, t } from './i18n';
import { normalizeFolder } from './utils/helpers';
import type { App } from 'obsidian';
import type WeeklySchedulePlugin from './main';

export interface WeeklyScheduleSettings {
	/** Vault folder holding the weekly Markdown files. */
	folder: string;
	/** First day of the week: 1 = Monday, 0 = Sunday. */
	weekStartsOn: number;
}

export const DEFAULT_SETTINGS: WeeklyScheduleSettings = {
	folder: DEFAULT_FOLDER,
	weekStartsOn: 1,
};

/**
 * Settings tab.
 *
 * Built with the imperative `Setting` API rather than the declarative one added
 * in Obsidian 1.13. The declarative API would put these options into Obsidian's
 * settings search, which is a real nicety, but it lifts minAppVersion to 1.13.0
 * and so shuts out everyone on an older release. Two settings and three buttons
 * do not justify that.
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
