import { Modal, Setting } from 'obsidian';
import { getLocale, syncLocale, t } from '../i18n';
import { slotHeading } from '../slots';
import type { App } from 'obsidian';
import type { SlotLayout } from '../slots';
import type { QuadrantId } from '../types';

export interface SlotMergeOptions {
	/** The cell being removed. */
	slotId: QuadrantId;
	/** The cells that could take its work over, in board order. */
	targets: readonly QuadrantId[];
	/** The cells as they are named now, so a row can say which is which. */
	layout: SlotLayout;
}

/**
 * Asks where the work of a cell that is being removed should go.
 *
 * A cell is not a container of tasks: it is a heading in a file, and the tasks
 * under it are the week's. So removing one is not a deletion but a redirection —
 * the wording it was written under stays on file for ever, resolved to whatever
 * took it over — and the work in weeks that are not open goes on being read
 * exactly where it was written.
 *
 * Which is why the question is asked at all: two weeks can hold work in the cell
 * being removed, and only the user knows which of the remaining cells it belongs
 * with. The dialog answers with the cell it should go to; the settings, the
 * file and the redraw stay with the plugin.
 */
export class SlotMergeModal extends Modal {
	/** The cell the work would go to; the first one offered until asked otherwise. */
	private target: QuadrantId;

	constructor(
		app: App,
		private readonly options: SlotMergeOptions,
		private readonly onConfirm: (target: QuadrantId) => void,
	) {
		super(app);
		this.target = options.targets[0] ?? options.slotId;
	}

	onOpen(): void {
		// The dialog lives for seconds, so it reads the language once, when it
		// opens, and draws every string from that reading.
		syncLocale();

		this.modalEl.addClass('weekly-schedule-slot-modal');
		this.titleEl.setText(
			t('settings.slots.merge.title', {
				name: slotHeading(this.options.layout, this.options.slotId, getLocale()),
			}),
		);
		this.contentEl.empty();
		this.contentEl.createEl('p', {
			cls: 'weekly-schedule-slot-desc',
			text: t('settings.slots.merge.desc'),
		});

		new Setting(this.contentEl)
			.setName(t('settings.slots.merge.choice'))
			.addDropdown((dropdown) => {
				for (const id of this.options.targets) {
					dropdown.addOption(id, slotHeading(this.options.layout, id, getLocale()));
				}
				dropdown.setValue(this.target);
				dropdown.onChange((value) => {
					this.target = value;
				});
			});

		this.renderFooter();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderFooter(): void {
		const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
		const cancel = actions.createEl('button', {
			text: t('common.cancel'),
			attr: { type: 'button' },
		});
		cancel.addEventListener('click', () => this.close());

		const confirm = actions.createEl('button', {
			cls: 'mod-cta',
			text: t('settings.slots.merge.confirm'),
			attr: { type: 'button' },
		});
		confirm.addEventListener('click', () => {
			const target = this.target;
			this.close();
			this.onConfirm(target);
		});
	}
}
