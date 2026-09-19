import { Plugin } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	WeeklyScheduleSettings,
	WeeklyScheduleSettingTab,
} from './settings';

export default class WeeklySchedulePlugin extends Plugin {
	settings!: WeeklyScheduleSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new WeeklyScheduleSettingTab(this.app, this));
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
