import { PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_FOLDER, WEEK_START_OPTIONS } from './constants';
import { normalizeFolder } from './utils/helpers';
import type { App, SettingDefinitionItem } from 'obsidian';
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

const FOLDER_KEY = 'folder';
const WEEK_START_KEY = 'weekStartsOn';

export class WeeklyScheduleSettingTab extends PluginSettingTab {
	plugin: WeeklySchedulePlugin;

	constructor(app: App, plugin: WeeklySchedulePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Declarative settings, so the board's options are reachable from
	 * Obsidian's settings search.
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Schedule folder',
				desc: 'Vault folder for the weekly files. The plugin writes one file per week, named after its ISO week, for example 2026-W12.md.',
				aliases: ['path', 'directory', 'weekly files'],
				control: {
					type: 'text',
					key: FOLDER_KEY,
					placeholder: DEFAULT_FOLDER,
				},
			},
			{
				name: 'Week starts on',
				desc: 'Which day the board starts with. Week numbers in file names stay ISO-based either way.',
				control: {
					type: 'dropdown',
					key: WEEK_START_KEY,
					options: Object.fromEntries(
						WEEK_START_OPTIONS.map((option) => [String(option.value), option.label]),
					),
				},
			},
			{
				name: 'Open board',
				desc: 'Open the weekly board in a tab, or focus it when it is already open.',
				action: (el) => {
					new Setting(el).addButton((button) =>
						button.setButtonText('Open board').onClick(() => {
							void this.plugin.activateView();
						}),
					);
				},
			},
			{
				name: 'Open year overview',
				desc: 'Open the year overview, where a week can be picked from a whole year at once.',
				action: (el) => {
					new Setting(el).addButton((button) =>
						button.setButtonText('Open overview').onClick(() => {
							void this.plugin.activateYearView();
						}),
					);
				},
			},
		];
	}

	getControlValue(key: string): unknown {
		if (key === FOLDER_KEY) {
			return this.plugin.settings.folder;
		}
		if (key === WEEK_START_KEY) {
			return String(this.plugin.settings.weekStartsOn);
		}
		return undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === FOLDER_KEY) {
			const folder = normalizeFolder(typeof value === 'string' ? value : '');
			if (folder === this.plugin.settings.folder) {
				return;
			}
			this.plugin.settings.folder = folder;
		} else if (key === WEEK_START_KEY) {
			const weekStartsOn = Number(value);
			if (weekStartsOn === this.plugin.settings.weekStartsOn) {
				return;
			}
			this.plugin.settings.weekStartsOn = weekStartsOn;
		} else {
			return;
		}

		await this.plugin.saveSettings();
		await this.plugin.handleSettingsChange();
	}
}
