import { PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_FOLDER, DEFAULT_SLOTS, SLOT_LIMITS, WEEK_START_OPTIONS } from './constants';
import { dayLabel, getLocale, t } from './i18n';
import { nextSlot, normalizeSlotConfig, retireSlot, slotHeading, validateSlots } from './slots';
import { SlotMergeModal } from './ui/slot-merge-modal';
import { isRecord, normalizeFolder } from './utils/helpers';
import type { App } from 'obsidian';
import type { TranslationKey } from './i18n';
import type { SlotError } from './slots';
import type { QuadrantId, RetiredSlots, Slot, TaskCommitKey } from './types';
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
 * What each failure of a layout is called.
 *
 * A code rather than a sentence, because the rule is in the pure module and the
 * sentence is not: `validateSlots` answers in codes so that it can be checked
 * without a language, and this is where the two meet. A code added without a
 * wording here would not compile, which is the point — an error with nothing to
 * say is worse than the error.
 */
const SLOT_ERROR_KEYS: Record<SlotError, TranslationKey> = {
	limitMin: 'settings.slots.error.limitMin',
	limitMax: 'settings.slots.error.limitMax',
	duplicateId: 'settings.slots.error.duplicateId',
	unknown: 'settings.slots.error.unknown',
	dangling: 'settings.slots.error.dangling',
	cycle: 'settings.slots.error.cycle',
	empty: 'settings.slots.error.empty',
	tooLong: 'settings.slots.error.tooLong',
	invalid: 'settings.slots.error.invalid',
	reserved: 'settings.slots.error.reserved',
	duplicate: 'settings.slots.error.duplicate',
};

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

	/**
	 * The line that says what is wrong with the cells, or nothing.
	 *
	 * Held rather than looked up, because an edit that is refused must be
	 * answered without redrawing the tab: the field would be rebuilt from the
	 * settings, and the value that was typed — the one the message is about —
	 * would be the one thing on screen not shown any more.
	 */
	private slotErrorEl: HTMLElement | null = null;

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
		this.slotErrorEl = null;

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

		this.renderCells(containerEl);

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

	/**
	 * The cells, in the order the board draws them, and what to do about the
	 * weeks already written with the older wording.
	 *
	 * Two sections, because they are two decisions: what a day holds from now on,
	 * and whether the weeks that came before should be made to say the same. The
	 * second is offered again after every change, since a rename is the moment
	 * the user still knows which weeks say the old thing — but it is only ever an
	 * offer, because a week written before a cell was renamed goes on reading
	 * correctly either way.
	 */
	private renderCells(containerEl: HTMLElement): void {
		const { slots, retiredSlots } = this.plugin.settings;

		new Setting(containerEl)
			.setName(t('settings.slots.name'))
			.setDesc(t('settings.slots.desc'))
			.setHeading();

		for (const [index, slot] of slots.entries()) {
			this.renderCell(containerEl, slot, index, slots.length);
		}

		new Setting(containerEl).setClass('weekly-schedule-slot-add').addButton((button) =>
			button
				.setButtonText(t('settings.slots.add'))
				.setDisabled(slots.length >= SLOT_LIMITS.max)
				.onClick(() => void this.addCell()),
		);

		// The line is drawn empty and filled in later, so that a refused edit has
		// somewhere to be said without redrawing the fields above it.
		this.slotErrorEl = containerEl.createDiv({ cls: 'weekly-schedule-slot-error' });
		this.showSlotError(validateSlots(slots, retiredSlots)[0] ?? null);

		new Setting(containerEl)
			.setName(t('settings.slots.align.name'))
			.setDesc(t('settings.slots.align.desc'))
			.setHeading();

		new Setting(containerEl).addButton((button) =>
			button
				.setButtonText(t('settings.slots.align.button'))
				.onClick(() => void this.plugin.alignSlotsAcrossWeeks()),
		);
	}

	/** One cell: its name, and the three things that can be done to it. */
	private renderCell(
		containerEl: HTMLElement,
		slot: Slot,
		index: number,
		count: number,
	): void {
		const layout = this.plugin.slotLayout();
		const row = new Setting(containerEl).setClass('weekly-schedule-slot-row');

		row.addText((text) => {
			text.inputEl.addClass('weekly-schedule-slot-name');
			text.inputEl.dataset.slotId = slot.id;
			text.setValue(slot.name ?? '');
			if (slot.name === null) {
				// What the cell is called until it is called something: the wording
				// the board prints for it, which follows the interface language,
				// because a cell nobody named has no wording of its own.
				const name = slotHeading(layout, slot.id, getLocale());
				text.setPlaceholder(name);
				text.inputEl.setAttribute('aria-label', t('settings.slots.usingDefault', { name }));
			}
			// Committed on leaving the field or on Enter, not on every keystroke:
			// the cells decide what every week's file looks like, and a layout that
			// followed each letter typed would rewrite weeks for a half-typed name.
			text.inputEl.addEventListener('blur', () => {
				void this.commitCellName(index, text.inputEl.value);
			});
			text.inputEl.addEventListener('keydown', (event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					text.inputEl.blur();
				}
			});
		});

		row.addExtraButton((button) =>
			button
				.setIcon('arrow-up')
				.setTooltip(t('board.moveUp'))
				.setDisabled(index === 0)
				.onClick(() => void this.moveCell(index, index - 1)),
		);
		row.addExtraButton((button) =>
			button
				.setIcon('arrow-down')
				.setTooltip(t('board.moveDown'))
				.setDisabled(index === count - 1)
				.onClick(() => void this.moveCell(index, index + 1)),
		);
		row.addExtraButton((button) =>
			button
				.setIcon('x')
				.setTooltip(t('board.delete'))
				// A day with no cells is a week no file can describe, so the last
				// one has no remove button to press.
				.setDisabled(count <= SLOT_LIMITS.min)
				.onClick(() => this.confirmRemoveCell(slot.id)),
		);
	}

	/**
	 * Applies a name that was typed, or says why it cannot be applied.
	 *
	 * A name reaches further than this page: it is a heading in every week the
	 * cell appears in, so a name that could not be read back is refused rather
	 * than saved — two cells answering to one wording, a name that would break
	 * the heading line, one already taken by a day or by a step of the review.
	 * The field is left showing what was typed, since that is what the message
	 * is about.
	 */
	private async commitCellName(index: number, typed: string): Promise<void> {
		const { slots, retiredSlots } = this.plugin.settings;
		const slot = slots[index];
		if (slot === undefined) {
			return;
		}
		const name = typed.trim();
		if (name === (slot.name ?? '')) {
			// Nothing typed, or typed back to what it was. Clearing a name the
			// plugin derives is not nothing: it means the cell goes back to being
			// called what the plugin calls it, in whatever language a file is in.
			return;
		}
		const next = slots.map((item, at) =>
			at === index ? { ...item, name: name.length > 0 ? name : null } : item,
		);
		await this.applyCells(next, retiredSlots);
	}

	/**
	 * Adds a cell, already named.
	 *
	 * A cell the user adds has no wording of its own to fall back on, so it
	 * cannot be saved without a name: there would be no heading to write, and
	 * `validateSlots` refuses a layout that says otherwise. Rather than leave the
	 * button doing nothing until a name is typed somewhere, the cell is created
	 * under a count that is free of the names already in use, and the field is
	 * focused with that count selected — so the next keystroke replaces it, and
	 * leaving it alone leaves a cell called what it was created as.
	 *
	 * The words for that name are the tab's, not the model's: the count is
	 * written into the cell as the name it has from then on, so it stays as it
	 * was created whatever the language is later.
	 */
	private async addCell(): Promise<void> {
		const { slots, retiredSlots } = this.plugin.settings;
		if (slots.length >= SLOT_LIMITS.max) {
			return;
		}

		const slot = nextSlot(slots, retiredSlots, (count) =>
			t('settings.slots.newName', { count }),
		);
		await this.applyCells([...slots, slot], retiredSlots);
		this.focusCell(slot.id);
	}

	/** Puts the cursor in a cell's name field, over what is already in it. */
	private focusCell(id: QuadrantId): void {
		const input = this.containerEl.querySelector<HTMLInputElement>(
			`.weekly-schedule-slot-name[data-slot-id="${id}"]`,
		);
		input?.focus();
		input?.select();
	}

	/**
	 * Swaps a cell with the one above or below it.
	 *
	 * The order is the order the cells are written in, and each cell keeps its
	 * colour: the palette is keyed by a cell's own tone rather than by where it
	 * sits, so moving one moves everything about it.
	 */
	private async moveCell(from: number, to: number): Promise<void> {
		const { slots, retiredSlots } = this.plugin.settings;
		const moved = slots[from];
		const displaced = slots[to];
		if (moved === undefined || displaced === undefined) {
			return;
		}
		const next = [...slots];
		next[from] = displaced;
		next[to] = moved;
		await this.applyCells(next, retiredSlots);
	}

	/**
	 * Asks which cell should take over, before removing anything.
	 *
	 * The work in a removed cell is not on this page: it is in weeks that are not
	 * open, filed under the wording the cell had when they were written. So the
	 * cell is not removed until the dialog says where that work belongs.
	 */
	private confirmRemoveCell(id: QuadrantId): void {
		const targets = this.plugin.settings.slots
			.filter((slot) => slot.id !== id)
			.map((slot) => slot.id);
		if (targets.length === 0) {
			return;
		}
		new SlotMergeModal(
			this.app,
			{ slotId: id, targets, layout: this.plugin.slotLayout() },
			(target) => void this.removeCell(id, target),
		).open();
	}

	/**
	 * Removes a cell, with its work going to the cell the dialog named.
	 *
	 * What that does to the record of removals is `retireSlot`'s business: the
	 * wording the cell was written under stays on file for ever, which is what
	 * makes a week written last year still read into the right cell.
	 */
	private async removeCell(id: QuadrantId, target: QuadrantId): Promise<void> {
		const { slots, retiredSlots } = this.plugin.settings;
		await this.applyCells(
			slots.filter((slot) => slot.id !== id),
			retireSlot(retiredSlots, id, target),
		);
	}

	/**
	 * Takes a layout the user asked for: applies it, or says what is wrong with
	 * it.
	 *
	 * Everything structural goes through here, so there is one rule about what a
	 * change may do and one order for doing it. Applying it is
	 * `applySlotChange`'s job — the committing, the flushing and the redrawing
	 * all have to happen in one order, and that order is the whole of that
	 * method. What follows is the offer to bring the weeks already written up to
	 * date, which is asked here because the settings tab is where a rename is
	 * made.
	 */
	private async applyCells(
		slots: readonly Slot[],
		retiredSlots: RetiredSlots,
	): Promise<void> {
		const errors = validateSlots(slots, retiredSlots);
		if (errors.length > 0) {
			this.showSlotError(errors[0] ?? null);
			return;
		}
		await this.plugin.applySlotChange(slots, retiredSlots);
		this.refresh();
		await this.plugin.alignSlotsAcrossWeeks();
	}

	/** Says what is wrong with the cells, in one line, or clears it. */
	private showSlotError(code: SlotError | null): void {
		const line = this.slotErrorEl;
		if (line === null) {
			return;
		}
		line.setText(
			code === null
				? ''
				: t(SLOT_ERROR_KEYS[code], {
						max: SLOT_LIMITS.max,
						nameMax: SLOT_LIMITS.nameMax,
					}),
		);
		line.dataset.slotError = code ?? '';
	}
}
