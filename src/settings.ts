import { App, PluginSettingTab } from 'obsidian';
import type WeeklySchedulePlugin from './main';

export interface WeeklyScheduleSettings {
	/**
	 * Starts a new schedule year on this weekday.
	 * 1 = Monday … 7 = Sunday (ISO-8601).
	 */
	weekStartsOn: number;
}

export const DEFAULT_SETTINGS: WeeklyScheduleSettings = {
	weekStartsOn: 1,
};

export class WeeklyScheduleSettingTab extends PluginSettingTab {
	plugin: WeeklySchedulePlugin;

	constructor(app: App, plugin: WeeklySchedulePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// TODO: add settings with `new Setting(containerEl)` and persist
		// changes through `this.plugin.saveSettings()`.
	}
}
