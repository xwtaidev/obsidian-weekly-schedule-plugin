import { Modal } from 'obsidian';
import { QUADRANTS } from '../constants';
import { QUADRANT_SEPARATOR, dayLabel, quadrantParts, syncLocale, t, tp } from '../i18n';
import type { App } from 'obsidian';
import type { CarryOverItem } from '../carry-over';
import type { DayId } from '../types';

export interface CarryOverModalOptions {
	/** Week the work comes from, e.g. `2026-W39`. */
	from: string;
	/** Week it is carried into, e.g. `2026-W40`. */
	to: string;
	/** What the previous week still has to offer, in board order. */
	items: readonly CarryOverItem[];
}

/**
 * Asks which of the previous week's unfinished tasks to bring over.
 *
 * The dialog exists because carrying is a judgement rather than a rule: the
 * board can see what is unfinished, but not what is still worth doing. Every row
 * starts checked, since bringing the whole week over is the common case, and the
 * button follows the checkboxes — so the dialog never claims more than it will
 * do. A task the target week already holds is checked too, and tagged rather
 * than hidden: confirming it is how its mark gets written in the previous week,
 * and a week that quietly dropped a task from the list would look like it lost
 * one.
 *
 * The dialog is opened by the command and by the board's toolbar, and its result
 * is handed back as the chosen rows; reading, writing and reporting stay with
 * the plugin.
 */
export class CarryOverModal extends Modal {
	/** Indices into `options.items` of the rows still checked. */
	private readonly checked: Set<number>;
	private confirmButton: HTMLButtonElement | null = null;

	constructor(
		app: App,
		private readonly options: CarryOverModalOptions,
		private readonly onConfirm: (chosen: CarryOverItem[]) => void,
	) {
		super(app);
		this.checked = new Set(this.options.items.keys());
	}

	onOpen(): void {
		// The dialog lives for seconds, so it reads the language once, when it
		// opens, and draws every string from that reading.
		syncLocale();

		this.modalEl.addClass('weekly-schedule-carry-modal');
		this.titleEl.setText(
			t('carry.modalTitle', { from: this.options.from, to: this.options.to }),
		);
		this.contentEl.empty();
		this.contentEl.createEl('p', {
			cls: 'weekly-schedule-carry-desc',
			text: t('carry.modalDesc'),
		});
		this.renderItems();
		this.renderFooter();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** The tasks, grouped by the day column they were planned in. */
	private renderItems(): void {
		const list = this.contentEl.createDiv({ cls: 'weekly-schedule-carry-list' });
		let day: DayId | null = null;
		let group: HTMLElement | null = null;

		for (const [index, item] of this.options.items.entries()) {
			if (!group || day !== item.day) {
				day = item.day;
				group = list.createDiv({ cls: 'weekly-schedule-carry-group' });
				group.createDiv({ cls: 'weekly-schedule-carry-day', text: dayLabel(item.day) });
			}
			this.renderItem(group, item, index);
		}
	}

	private renderItem(parent: HTMLElement, item: CarryOverItem, index: number): void {
		// A label, so the whole row toggles the box instead of only the box.
		const row = parent.createEl('label', { cls: 'weekly-schedule-carry-item' });
		const checkbox = row.createEl('input', {
			cls: 'weekly-schedule-checkbox',
			attr: { type: 'checkbox' },
		});
		checkbox.checked = this.checked.has(index);
		checkbox.addEventListener('change', () => {
			if (checkbox.checked) {
				this.checked.add(index);
			} else {
				this.checked.delete(index);
			}
			this.updateConfirm();
		});

		row.createSpan({ cls: 'weekly-schedule-carry-text', text: item.text });

		const definition = QUADRANTS.find((entry) => entry.id === item.quadrant);
		if (definition) {
			// The cell the task will land in, since that is the one thing about
			// the move that cannot be read off the task itself. It is drawn the
			// way the board draws that cell's heading — the same two words in
			// the same quadrant colour — so which cell a row belongs to is
			// legible before the words are read.
			const [importance, urgency] = quadrantParts(definition.important, definition.urgent);
			const tag = row.createSpan({
				cls: `weekly-schedule-carry-tag weekly-schedule-carry-tag-${item.quadrant}`,
			});
			tag.createSpan({ text: importance });
			tag.createSpan({ cls: 'weekly-schedule-carry-tag-sep', text: QUADRANT_SEPARATOR });
			tag.createSpan({ text: urgency });
		}

		if (item.alreadyThere) {
			row.createSpan({
				cls: 'weekly-schedule-carry-flag',
				text: t('carry.alreadyThere'),
			});
		}
	}

	private renderFooter(): void {
		const there = this.options.items.filter((item) => item.alreadyThere).length;
		if (there > 0) {
			this.contentEl.createDiv({
				cls: 'weekly-schedule-carry-note',
				text: tp('carry.modalNote', there, { to: this.options.to }),
			});
		}

		const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
		const cancel = actions.createEl('button', {
			text: t('carry.cancel'),
			attr: { type: 'button' },
		});
		cancel.addEventListener('click', () => this.close());

		this.confirmButton = actions.createEl('button', {
			cls: 'mod-cta',
			attr: { type: 'button' },
		});
		this.confirmButton.addEventListener('click', () => {
			const chosen = this.options.items.filter((item, index) => this.checked.has(index));
			this.close();
			this.onConfirm(chosen);
		});
		this.updateConfirm();
	}

	/** Keeps the button in step with the boxes: it never offers to bring none. */
	private updateConfirm(): void {
		if (!this.confirmButton) {
			return;
		}
		const count = this.checked.size;
		this.confirmButton.setText(tp('carry.confirm', count));
		this.confirmButton.disabled = count === 0;
	}
}
