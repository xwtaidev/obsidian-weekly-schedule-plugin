import { Modal } from 'obsidian';
import { normalizeColor } from '../utils/color';
import { syncLocale, t } from '../i18n';
import type { App } from 'obsidian';

/**
 * A colour chosen by hand, confirmed before it reaches a cell.
 *
 * The system colour panel answers the first half of picking a colour — the
 * dragging — and none of the second half: it is drawn by the browser, it takes
 * no styling, and it has no button that says "this one". A colour that becomes
 * a heading on a board the user looks at every day deserves both halves, so
 * this dialog wraps the panel in one: the swatch opens the system panel for the
 * dragging, the field takes the colour as text, and nothing reaches the cell
 * until it is confirmed.
 *
 * The field accepts anything and says no rather than guessing: `#abc` is a
 * colour, `abc` is a colour, `red` is not, and an answer the stylesheet cannot
 * take is a disabled button rather than a silently different one.
 */
export class CustomColorModal extends Modal {
	constructor(
		app: App,
		private readonly initial: string,
		private readonly onConfirm: (color: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		syncLocale();
		this.modalEl.addClass('weekly-schedule-color-modal');
		this.titleEl.setText(t('settings.slots.colorCustom.title'));
		this.contentEl.empty();

		let color = this.initial;

		// The swatch is the real control, drawn large: clicking it opens the
		// system panel, and a drag there updates the field as it goes.
		const swatch = this.contentEl.createEl('input', {
			type: 'color',
			cls: 'weekly-schedule-color-swatch',
		});
		swatch.value = color;

		const hexRow = this.contentEl.createDiv({ cls: 'weekly-schedule-color-hex' });
		hexRow.createSpan({
			cls: 'weekly-schedule-color-hex-label',
			text: t('settings.slots.colorCustom.hexLabel'),
		});
		const hex = hexRow.createEl('input', {
			type: 'text',
			cls: 'weekly-schedule-color-hex-field',
		});
		hex.value = color;
		hex.spellcheck = false;

		const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
		const cancel = actions.createEl('button', {
			text: t('common.cancel'),
			attr: { type: 'button' },
		});
		const confirm = actions.createEl('button', {
			cls: 'mod-cta',
			text: t('settings.slots.colorCustom.confirm'),
			attr: { type: 'button' },
		});

		cancel.addEventListener('click', () => this.close());

		/** Answers the colour as the stylesheet may take it, and says when it may not. */
		const settled = (): string | null => {
			const value = normalizeColor(color);
			confirm.disabled = value === null;
			hex.toggleClass('has-error', value === null);
			return value;
		};

		const accept = (): void => {
			const value = settled();
			if (value !== null) {
				this.close();
				this.onConfirm(value);
			}
		};

		swatch.addEventListener('input', () => {
			color = swatch.value;
			hex.value = color;
			settled();
		});
		hex.addEventListener('input', () => {
			color = hex.value;
			settled();
		});
		hex.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				accept();
			}
		});
		confirm.addEventListener('click', accept);

		settled();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
