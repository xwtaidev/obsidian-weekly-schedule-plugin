import { PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_FOLDER, WEEK_START_OPTIONS } from './constants';
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

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Schedule folder')
			.setDesc(
				'Vault folder for the weekly files. The plugin writes one file per week, grouped in a folder per year. Example: weekly-schedule/2026/2026-W12.md',
			)
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
			.setName('Week starts on')
			.setDesc(
				'Which day the board starts with. Week numbers in file names are unaffected by this.',
			)
			.addDropdown((dropdown) => {
				for (const option of WEEK_START_OPTIONS) {
					dropdown.addOption(String(option.value), option.label);
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
			.setName('Open board')
			.setDesc('Open the weekly board in a tab, or focus it when it is already open.')
			.addButton((button) =>
				button.setButtonText('Open board').onClick(() => {
					void this.plugin.activateView();
				}),
			);

		new Setting(containerEl)
			.setName('Open year overview')
			.setDesc('Pick a week from a whole year at once.')
			.addButton((button) =>
				button.setButtonText('Open overview').onClick(() => {
					void this.plugin.activateYearView();
				}),
			);

		new Setting(containerEl)
			.setName('Year folders')
			.setDesc(
				'Move week files that sit directly in the schedule folder into a folder per year.',
			)
			.addButton((button) =>
				button.setButtonText('Move files').onClick(() => {
					void this.plugin.moveWeeksIntoYearFolders();
				}),
			);
	}
}
