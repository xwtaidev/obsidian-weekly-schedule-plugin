import { Modal } from 'obsidian';
import { syncLocale, t, tp } from '../i18n';
import type { App } from 'obsidian';

/**
 * Asks whether to bring the weeks already written up to date, and says how many
 * of them there are.
 *
 * The offer exists because a rename is the moment the user still remembers which
 * weeks say the old wording, and because the alternative — a button nobody
 * presses — leaves a vault saying two things at once. It is only ever an offer:
 * a week written before a cell was renamed reads correctly as it stands, so
 * declining costs a vault nothing but consistency.
 *
 * Both buttons close the dialog. Aligning is the settings' job rather than the
 * dialog's, so all this answers is whether to do it now.
 */
export class SlotAlignModal extends Modal {
	constructor(
		app: App,
		private readonly count: number,
		private readonly onConfirm: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		syncLocale();

		this.modalEl.addClass('weekly-schedule-slot-modal');
		this.titleEl.setText(t('settings.slots.align.title'));
		this.contentEl.empty();
		this.contentEl.createEl('p', {
			cls: 'weekly-schedule-slot-desc',
			text: tp('settings.slots.align.body', this.count),
		});

		const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
		const later = actions.createEl('button', {
			text: t('settings.slots.align.later'),
			attr: { type: 'button' },
		});
		later.addEventListener('click', () => this.close());

		const confirm = actions.createEl('button', {
			cls: 'mod-cta',
			text: t('settings.slots.align.confirm'),
			attr: { type: 'button' },
		});
		confirm.addEventListener('click', () => {
			this.close();
			this.onConfirm();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
