import { PluginSettingTab, Setting, setIcon } from 'obsidian';
import { DEFAULT_FOLDER, DEFAULT_SLOTS, SLOT_LIMITS, TONE_COUNT, WEEK_START_OPTIONS } from './constants';
import { dayLabel, getLocale, t } from './i18n';
import {
	nextSlot,
	normalizeSlotConfig,
	retireHeading,
	retireSlot,
	slotHeading,
	slotToneClass,
	validateSlots,
} from './slots';
import { SlotMergeModal } from './ui/slot-merge-modal';
import { isRecord, normalizeFolder } from './utils/helpers';
import { normalizeColor } from './utils/color';
import type { App } from 'obsidian';
import type { TranslationKey } from './i18n';
import type { SlotError } from './slots';
import type {
	QuadrantId,
	RetiredHeadings,
	RetiredSlots,
	Slot,
	TaskCommitKey,
} from './types';
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
	/**
	 * What the cells used to be called, as `wording → the cell that answered to
	 * it`. Kept for ever, for the same reason as the record above and for the
	 * gap it leaves: a cell of the user's own is written under the name they
	 * typed, so the id alone cannot read a week written before that name was
	 * changed or the cell removed.
	 */
	retiredHeadings: RetiredHeadings;
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
	retiredHeadings: {},
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
	const { slots, retiredSlots, retiredHeadings } = normalizeSlotConfig(file);
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
		retiredHeadings,
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
	color: 'settings.slots.error.color',
	dangling: 'settings.slots.error.dangling',
	cycle: 'settings.slots.error.cycle',
	empty: 'settings.slots.error.empty',
	tooLong: 'settings.slots.error.tooLong',
	invalid: 'settings.slots.error.invalid',
	reserved: 'settings.slots.error.reserved',
	duplicate: 'settings.slots.error.duplicate',
};

/**
 * What each palette position is called, in palette order.
 *
 * Named by hue rather than by number, because the list exists to choose a
 * colour and "the third one" is not a colour. Length is held to `TONE_COUNT` by
 * `check:slots`, so adding a position to the palette without a name for it
 * fails there rather than showing a dot with nothing to announce it.
 */
export const TONE_NAME_KEYS: readonly TranslationKey[] = [
	'settings.slots.colorName.rose',
	'settings.slots.colorName.violet',
	'settings.slots.colorName.blue',
	'settings.slots.colorName.grey',
	'settings.slots.colorName.amber',
	'settings.slots.colorName.teal',
	'settings.slots.colorName.magenta',
	'settings.slots.colorName.green',
];

/**
 * What the colour panel opens on the first time.
 *
 * A neutral mid grey, not a palette entry: opening on a colour that is already
 * in use would make "pick a colour of your own" start by handing back a colour
 * the palette has.
 */
const DEFAULT_CUSTOM_COLOR = '#888888';

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
			.addText((text) => {
				text.setPlaceholder(DEFAULT_FOLDER).setValue(this.plugin.settings.folder);
				// Committed on leaving the field or on Enter, not on every
				// keystroke: the folder decides where every week is written, so a
				// value that followed each letter typed would move the board to a
				// folder that does not exist yet — and, before the store stopped
				// creating files for empty weeks, made each of those half-typed
				// folders real. The cells' names are committed the same way, and
				// for the same reason.
				const commit = async (): Promise<void> => {
					const typed = text.getValue();
					const folder = normalizeFolder(typed);
					if (folder !== typed) {
						// Show what the plugin files weeks under, so a leading,
						// trailing or doubled slash does not outlive the visit.
						text.setValue(folder);
					}
					if (folder === this.plugin.settings.folder) {
						return;
					}
					this.plugin.settings.folder = folder;
					await this.plugin.saveSettings();
					await this.plugin.handleSettingsChange();
				};
				text.inputEl.addEventListener('blur', () => void commit());
				text.inputEl.addEventListener('keydown', (event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						text.inputEl.blur();
					}
				});
			});

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

		const cells = containerEl.createDiv({ cls: 'weekly-schedule-section' });
		const head = this.sectionHead(cells, t('settings.slots.name'), t('settings.slots.desc'));
		const countEl = head.createDiv({ cls: 'weekly-schedule-slot-count' });
		countEl.setText(`${slots.length} / ${SLOT_LIMITS.max}`);
		countEl.setAttribute(
			'aria-label',
			t('settings.slots.count', { count: slots.length, max: SLOT_LIMITS.max }),
		);

		const list = cells.createDiv({ cls: 'weekly-schedule-slot-list' });
		for (const [index, slot] of slots.entries()) {
			this.renderCell(list, slot, index, slots.length);
		}
		this.renderAddCell(list, slots.length);

		// The line is drawn empty and filled in later, so that a refused edit has
		// somewhere to be said without redrawing the fields above it.
		this.slotErrorEl = cells.createDiv({ cls: 'weekly-schedule-slot-error' });
		this.showSlotError(validateSlots(slots, retiredSlots)[0] ?? null);

		const align = containerEl.createDiv({ cls: 'weekly-schedule-section' });
		this.sectionHead(align, t('settings.slots.align.name'), t('settings.slots.align.desc'));
		const actions = align.createDiv({ cls: 'weekly-schedule-section-actions' });
		const alignButton = actions.createEl('button', { text: t('settings.slots.align.button') });
		alignButton.addEventListener('click', () => void this.plugin.alignSlotsAcrossWeeks());
	}

	/** A section's title and the sentence under it; the title's line comes back. */
	private sectionHead(parent: HTMLElement, title: string, desc: string): HTMLElement {
		const head = parent.createDiv({ cls: 'weekly-schedule-section-head' });
		head.createDiv({ cls: 'weekly-schedule-section-title', text: title });
		parent.createDiv({ cls: 'weekly-schedule-section-desc', text: desc });
		return head;
	}

	/**
	 * One cell: its name, and the three things that can be done to it.
	 *
	 * Built by hand rather than as a `Setting`, because a `Setting` is a card of
	 * its own — one option, its explanation and a control on the far side — and
	 * a cell is one line in a list of peers. As a `Setting` a row comes out
	 * empty on the left, its name field pushed to the right edge and the whole
	 * card padded for a description that is not there: four cells took 368px of
	 * the pane and read as four unrelated options.
	 */
	private renderCell(
		containerEl: HTMLElement,
		slot: Slot,
		index: number,
		count: number,
	): void {
		const layout = this.plugin.slotLayout();
		const row = containerEl.createDiv({
			cls: `weekly-schedule-slot-row ${slotToneClass('slot', slot)}`,
			attr: { 'data-slot-id': slot.id },
		});
		// A colour of the user's own travels on the row as a custom property, so
		// that the dot which shows it is painted by the same variable the board
		// paints a cell with.
		if (slot.color !== null) {
			row.style.setProperty('--ws-accent', slot.color);
		}

		row.createDiv({ cls: 'weekly-schedule-slot-index', text: String(index + 1) });

		const input = row.createEl('input', { type: 'text', cls: 'weekly-schedule-slot-name' });
		input.dataset.slotId = slot.id;
		input.value = slot.name ?? '';
		input.spellcheck = false;
		// What the cell is called until it is called something: the wording the
		// board prints for it, which follows the interface language, because a
		// cell nobody named has no wording of its own. It stays as the
		// placeholder once the field is emptied, which is what emptying it means.
		const derived = slotHeading(layout, slot.id, getLocale());
		input.placeholder = derived;
		input.setAttribute(
			'aria-label',
			slot.name === null
				? t('settings.slots.usingDefault', { name: derived })
				: t('settings.slots.field', { index: index + 1 }),
		);
		// Committed on leaving the field or on Enter, not on every keystroke:
		// the cells decide what every week's file looks like, and a layout that
		// followed each letter typed would rewrite weeks for a half-typed name.
		input.addEventListener('blur', () => {
			void this.commitCellName(index, input.value);
		});
		input.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				input.blur();
			}
		});

		this.renderColors(row, slot, index);

		this.actionButton(row, 'arrow-up', t('board.moveUp'), index === 0, () =>
			void this.moveCell(index, index - 1),
		);
		this.actionButton(row, 'arrow-down', t('board.moveDown'), index === count - 1, () =>
			void this.moveCell(index, index + 1),
		);
		this.actionButton(
			row,
			'x',
			t('board.delete'),
			// A day with no cells is a week no file can describe, so the last
			// one has no remove button to press.
			count <= SLOT_LIMITS.min,
			() => this.confirmRemoveCell(slot.id),
			'weekly-schedule-slot-remove',
		);
	}

	/**
	 * The colours a cell may wear: the eight the palette has, then a picker of
	 * the user's own.
	 *
	 * Radios rather than buttons, because a cell wears exactly one colour and
	 * the browser already knows what that means: arrow keys move between them,
	 * the chosen one is announced as chosen, and `:checked` is what draws the
	 * ring. A row of buttons would have to spell all of that out by hand and
	 * would still be a row of buttons.
	 *
	 * The picker is a button of its own with the real `<input type="color">`
	 * kept out of sight, because the native control cannot be drawn as a dot: it
	 * is a small rounded square with a system-drawn swatch inside it, and no
	 * amount of styling makes it a peer of the eight beside it.
	 */
	private renderColors(row: HTMLElement, slot: Slot, index: number): void {
		const group = row.createDiv({ cls: 'weekly-schedule-slot-colors' });
		group.setAttribute('role', 'radiogroup');
		group.setAttribute('aria-label', t('settings.slots.color', { index: index + 1 }));

		for (let tone = 0; tone < TONE_COUNT; tone += 1) {
			const dot = group.createEl('input', { type: 'radio', cls: 'weekly-schedule-slot-color' });
			dot.name = `weekly-schedule-slot-color-${slot.id}`;
			dot.value = String(tone);
			dot.checked = slot.color === null && slot.tone === tone;
			// The hue is read from the palette rather than repeated here: these
			// dots and the board have to be the same eight colours, and the
			// stylesheet is where that is decided.
			dot.style.backgroundColor = `var(--ws-tone-${tone}-rail)`;
			dot.setAttribute('aria-label', t(TONE_NAME_KEYS[tone] ?? 'settings.slots.colorName.grey'));
			dot.addEventListener('change', () => {
				if (dot.checked) {
					void this.applyCellColor(row, index, tone, null);
				}
			});
		}

		// Out of the tab order and out of sight: the button below is the control,
		// and this is only the system colour panel it opens.
		const picker = group.createEl('input', {
			type: 'color',
			cls: 'weekly-schedule-slot-color-picker',
		});
		picker.tabIndex = -1;
		picker.setAttribute('aria-hidden', 'true');
		picker.value = slot.color ?? DEFAULT_CUSTOM_COLOR;

		const custom = group.createEl('button', {
			type: 'button',
			cls: 'weekly-schedule-slot-color weekly-schedule-slot-color-custom',
		});
		custom.toggleClass('is-active', slot.color !== null);
		if (slot.color !== null) {
			custom.style.setProperty('--ws-accent', slot.color);
		}
		custom.setAttribute('aria-label', t('settings.slots.colorCustom'));
		custom.addEventListener('click', () => picker.click());

		// The dot follows the panel while it is being dragged, but nothing is
		// saved until it closes: a settings file written on every pixel of a
		// drag is a lot of writes for one decision.
		picker.addEventListener('input', () => {
			custom.style.setProperty('--ws-accent', picker.value);
			custom.addClass('is-active');
		});
		picker.addEventListener('change', () => {
			const color = normalizeColor(picker.value);
			if (color !== null) {
				void this.applyCellColor(row, index, slot.tone, color);
			}
		});
	}

	/**
	 * Takes the colour the user picked, and repaints the one row it belongs to.
	 *
	 * The palette position is kept even when a colour of the user's own is set:
	 * clearing that colour has to land somewhere, and the position the cell
	 * already holds is the one that changes nothing else.
	 *
	 * The page is not rebuilt. Rebuilding would move the scroll and drop the
	 * focus that a keyboard user has on the dot they just picked, and every
	 * other row is already drawn correctly — one row's colour is one row's
	 * change.
	 */
	private async applyCellColor(
		row: HTMLElement,
		index: number,
		tone: number,
		color: string | null,
	): Promise<void> {
		const { slots } = this.plugin.settings;
		const slot = slots[index];
		if (slot === undefined || (slot.tone === tone && slot.color === color)) {
			return;
		}
		const next = slots.map((item, at) => (at === index ? { ...item, tone, color } : item));
		await this.plugin.applySlotColor(next);
		const painted = next[index] ?? { ...slot, tone, color };
		this.paintCellColor(row, painted);
	}

	/** Repaints one row in place, so nothing on the page moves under the cursor. */
	private paintCellColor(row: HTMLElement, slot: Slot): void {
		row.className = `weekly-schedule-slot-row ${slotToneClass('slot', slot)}`;
		if (slot.color === null) {
			row.style.removeProperty('--ws-accent');
		} else {
			row.style.setProperty('--ws-accent', slot.color);
		}

		// The palette dots follow as well. A radio the browser checked stays
		// checked until something says otherwise, and a row where the hand-picked
		// colour wears the ring while an earlier choice still wears one too is a
		// row announcing two colours at once.
		for (const dot of Array.from(
			row.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
		)) {
			dot.checked = slot.color === null && dot.value === String(slot.tone);
		}

		const custom = row.querySelector<HTMLElement>('.weekly-schedule-slot-color-custom');
		if (custom !== null) {
			custom.toggleClass('is-active', slot.color !== null);
			if (slot.color === null) {
				custom.style.removeProperty('--ws-accent');
			}
		}
		const picker = row.querySelector<HTMLInputElement>('.weekly-schedule-slot-color-picker');
		if (picker !== null) {
			picker.value = slot.color ?? DEFAULT_CUSTOM_COLOR;
			if (slot.color !== null) {
				custom?.style.setProperty('--ws-accent', slot.color);
			}
		}
	}

	/**
	 * One of the small buttons at the end of a cell's row.
	 *
	 * Plain buttons rather than `Setting.addExtraButton`, for the reason the row
	 * itself is not a `Setting` — but they keep Obsidian's own `clickable-icon`
	 * class, so the hover square, the focus ring and the tooltip that every
	 * `aria-label` gets are the app's rather than this plugin's.
	 */
	private actionButton(
		row: HTMLElement,
		icon: string,
		label: string,
		disabled: boolean,
		onClick: () => void,
		extraClass?: string,
	): void {
		const button = row.createEl('button', {
			cls: extraClass === undefined ? 'clickable-icon' : `clickable-icon ${extraClass}`,
		});
		setIcon(button, icon);
		button.setAttribute('aria-label', label);
		button.disabled = disabled;
		button.addEventListener('click', onClick);
	}

	/** The line under the cells that adds one, and is spent at the limit. */
	private renderAddCell(list: HTMLElement, count: number): void {
		const button = list.createEl('button', { cls: 'weekly-schedule-slot-add' });
		const icon = button.createSpan({ cls: 'weekly-schedule-slot-add-icon' });
		setIcon(icon, 'plus');
		button.createSpan({ text: t('settings.slots.add') });
		button.disabled = count >= SLOT_LIMITS.max;
		button.addEventListener('click', () => void this.addCell());
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
		const { slots, retiredSlots, retiredHeadings } = this.plugin.settings;
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
		// The name it answered to until now is a heading in weeks already written,
		// and nothing else knows it: keep it, or those weeks stop being read.
		await this.applyCells(
			next,
			retiredSlots,
			slot.name === null ? retiredHeadings : retireHeading(retiredHeadings, slot.name, slot.id),
		);
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
		const { slots, retiredSlots, retiredHeadings } = this.plugin.settings;
		if (slots.length >= SLOT_LIMITS.max) {
			return;
		}

		const slot = nextSlot(slots, retiredSlots, (count) =>
			t('settings.slots.newName', { count }),
		);
		await this.applyCells([...slots, slot], retiredSlots, retiredHeadings);
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
		const { slots, retiredSlots, retiredHeadings } = this.plugin.settings;
		const moved = slots[from];
		const displaced = slots[to];
		if (moved === undefined || displaced === undefined) {
			return;
		}
		const next = [...slots];
		next[from] = displaced;
		next[to] = moved;
		await this.applyCells(next, retiredSlots, retiredHeadings);
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
	 * Two records have to be kept, not one: where the id's work went, and what
	 * the cell was called. The id is enough for a week written under a wording
	 * the plugin derived — its own four, or a bare `s1` for a cell nobody named
	 * — but a cell of the user's own was written under the name they typed, and
	 * that name is the only thing in the week that says which cell it was. Drop
	 * it and the tasks under it are read into no cell at all.
	 */
	private async removeCell(id: QuadrantId, target: QuadrantId): Promise<void> {
		const { slots, retiredSlots, retiredHeadings } = this.plugin.settings;
		const slot = slots.find((item) => item.id === id);
		await this.applyCells(
			slots.filter((item) => item.id !== id),
			retireSlot(retiredSlots, id, target),
			slot === undefined || slot.name === null
				? retiredHeadings
				: retireHeading(retiredHeadings, slot.name, id),
		);
	}

	/**
	 * Takes a layout the user asked for: applies it, or says what is wrong with
	 * it.
	 *
	 * Everything structural goes through here, so there is one rule about what a
	 * change may do and one order for doing it. Applying it is
	 * `applySlotChange`'s job — the committing, the flushing and the closing
	 * all have to happen in one order, and that order is the whole of that
	 * method. What follows is the offer to bring the weeks already written up to
	 * date, which is asked here because the settings tab is where a rename is
	 * made.
	 */
	private async applyCells(
		slots: readonly Slot[],
		retiredSlots: RetiredSlots,
		retiredHeadings: RetiredHeadings,
	): Promise<void> {
		const errors = validateSlots(slots, retiredSlots);
		if (errors.length > 0) {
			this.showSlotError(errors[0] ?? null);
			return;
		}
		await this.plugin.applySlotChange(slots, retiredSlots, retiredHeadings);
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
