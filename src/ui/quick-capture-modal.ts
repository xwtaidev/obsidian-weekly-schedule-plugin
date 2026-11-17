import { Modal } from 'obsidian';
import { DAY_IDS } from '../constants';
import { dayLabel, getLocale, syncLocale, t } from '../i18n';
import { slotHeading, slotToneClass } from '../slots';
import type { App } from 'obsidian';
import type { DayId, QuadrantId } from '../types';
import type { SlotLayout } from '../slots';

export interface QuickCaptureOptions {
	/** The cells the week will have, so a chip can name the one it aims at. */
	layout: SlotLayout;
	/** The day preselected when the dialog opens: the one today falls in. */
	defaultDay: DayId;
}

/**
 * Adds a task to this week from anywhere.
 *
 * The dialog exists because a thought worth planning arrives while the board
 * is not the thing being looked at, and opening it — finding the day, finding
 * the cell, starting the first line — is a walk that costs more than the
 * thought. Here the walk is the dialog: the text goes in the field, the day
 * and the cell are one chip each, and the task is planned.
 *
 * The dialog stays open after a task is added. Capturing is rarely one thing,
 * and closing between tasks would put the cost back between them; the day and
 * the cell keep their selection, the field clears, and `Esc` or the button
 * ends it. The week a task lands in is decided by the plugin when the task is
 * submitted rather than when the dialog opens, so one open across midnight
 * adds to the week today falls in, not to yesterday's.
 *
 * The chips draw a cell the way the board and the carry-over dialog draw one
 * — the same words in the same colour — so which cell a task will land in is
 * legible before the words are read.
 */
export class QuickCaptureModal extends Modal {
	private day: DayId;
	private slot: QuadrantId;
	private inputEl: HTMLInputElement | null = null;
	private addButton: HTMLButtonElement | null = null;
	private submitting = false;

	constructor(
		app: App,
		private readonly options: QuickCaptureOptions,
		private readonly onSubmit: (day: DayId, slot: QuadrantId, text: string) => Promise<boolean>,
	) {
		super(app);
		this.day = options.defaultDay;
		this.slot = options.layout.slots[0]?.id ?? this.day;
	}

	onOpen(): void {
		// The dialog lives for seconds, so it reads the language once, when it
		// opens, and draws every string from that reading.
		syncLocale();

		this.modalEl.addClass('weekly-schedule-quick-modal');
		this.titleEl.setText(t('quick.title'));
		this.contentEl.empty();

		const input = this.contentEl.createEl('input', {
			cls: 'weekly-schedule-quick-input',
			attr: { type: 'text', placeholder: t('board.taskPlaceholder') },
		});
		input.addEventListener('input', () => this.updateAdd());
		input.addEventListener('keydown', (event) => {
			// The Enter that confirms an IME composition is not a submit.
			if (event.isComposing) {
				return;
			}
			if (event.key === 'Enter') {
				event.preventDefault();
				void this.submit();
			}
		});
		this.inputEl = input;

		this.renderDayChips();
		this.renderSlotChips();
		this.renderFooter();

		input.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** The days of the week, today preselected. */
	private renderDayChips(): void {
		const group = this.contentEl.createDiv({ cls: 'weekly-schedule-quick-group' });
		group.createDiv({ cls: 'weekly-schedule-quick-label', text: t('quick.day') });
		const row = group.createDiv({ cls: 'weekly-schedule-quick-row' });

		for (const id of DAY_IDS) {
			const chip = row.createEl('button', {
				cls: 'weekly-schedule-quick-chip weekly-schedule-quick-day',
				text: dayLabel(id),
				attr: { type: 'button' },
			});
			chip.toggleClass('is-selected', id === this.day);
			chip.addEventListener('click', () => {
				this.day = id;
				this.selectChip(row, chip);
			});
		}
	}

	/** The cells a day has, each in its own colour, the first preselected. */
	private renderSlotChips(): void {
		const group = this.contentEl.createDiv({ cls: 'weekly-schedule-quick-group' });
		group.createDiv({ cls: 'weekly-schedule-quick-label', text: t('quick.cell') });
		const row = group.createDiv({ cls: 'weekly-schedule-quick-row' });

		for (const slot of this.options.layout.slots) {
			const chip = row.createEl('button', {
				cls: `weekly-schedule-quick-chip weekly-schedule-quick-slot ${slotToneClass('carry-tag', slot)}`,
				text: slotHeading(this.options.layout, slot.id, getLocale()),
				attr: { type: 'button' },
			});
			if (slot.color !== null) {
				chip.style.setProperty('--ws-accent', slot.color);
			}
			chip.toggleClass('is-selected', slot.id === this.slot);
			chip.addEventListener('click', () => {
				this.slot = slot.id;
				this.selectChip(row, chip);
			});
		}
	}

	private renderFooter(): void {
		const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
		const cancel = actions.createEl('button', {
			text: t('common.cancel'),
			attr: { type: 'button' },
		});
		cancel.addEventListener('click', () => this.close());

		this.addButton = actions.createEl('button', {
			cls: 'mod-cta',
			text: t('quick.add'),
			attr: { type: 'button' },
		});
		this.addButton.addEventListener('click', () => void this.submit());
		this.updateAdd();
	}

	/** Marks `chip` as the row's selection, alone. */
	private selectChip(row: HTMLElement, chip: HTMLElement): void {
		row.querySelectorAll('.weekly-schedule-quick-chip').forEach((other) => {
			other.toggleClass('is-selected', other === chip);
		});
	}

	/** The button never offers to add a task that holds nothing. */
	private updateAdd(): void {
		if (!this.addButton) {
			return;
		}
		const text = this.inputEl?.value ?? '';
		this.addButton.disabled = this.submitting || text.trim().length === 0;
	}

	/**
	 * Adds one task and keeps the dialog ready for the next.
	 *
	 * The submission is awaited before the field is cleared, and a task that
	 * could not be written stays in the field: taking the words away after
	 * telling the user they went nowhere is losing them a second time.
	 */
	private async submit(): Promise<void> {
		const input = this.inputEl;
		const button = this.addButton;
		if (!input || !button || button.disabled) {
			return;
		}
		const raw = input.value;
		if (raw.trim().length === 0) {
			return;
		}

		this.submitting = true;
		button.disabled = true;

		const added = await this.onSubmit(this.day, this.slot, raw);

		this.submitting = false;
		// The dialog may have been closed while the week was being written.
		if (!this.inputEl) {
			return;
		}
		if (added) {
			this.inputEl.value = '';
		}
		this.updateAdd();
		this.inputEl.focus();
	}
}
