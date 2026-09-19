/**
 * Inline plain-text editing helpers for the task rows. These are deliberately
 * free of plugin state: the board passes a callback and owns the data.
 */

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Makes an element editable as plain text: pasted rich content is reduced to
 * text, Enter commits instead of inserting a line break, and leaving the field
 * commits the current value.
 */
export function registerInlineEditor(
	element: HTMLElement,
	onChange: (value: string) => void,
): void {
	let lastValue = element.textContent ?? '';

	const commit = (): void => {
		const value = element.textContent ?? '';
		if (value !== lastValue) {
			lastValue = value;
			onChange(value);
		}
	};

	element.addEventListener('keydown', (event) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			commit();
			element.blur();
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			element.setText(lastValue);
			commit();
			element.blur();
		}
	});

	element.addEventListener('paste', (event) => {
		event.preventDefault();
		const text = event.clipboardData?.getData('text/plain') ?? '';
		// A pasted newline would silently split one task into two.
		insertText(text.replace(/\s*\n+\s*/g, ' '));
	});

	element.addEventListener('blur', commit);
}

export function placeCaretAtEnd(element: HTMLElement): void {
	const range = document.createRange();
	range.selectNodeContents(element);
	range.collapse(false);
	const selection = window.getSelection();
	selection?.removeAllRanges();
	selection?.addRange(range);
}

/**
 * Inserts plain text at the caret by editing the range directly. Although
 * `document.execCommand('insertText')` keeps the native undo stack, it is
 * deprecated, and losing one paste action from the undo history is a smaller
 * cost than depending on a removed API.
 */
function insertText(text: string): void {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) {
		return;
	}
	const range = selection.getRangeAt(0);
	range.deleteContents();
	const node = document.createTextNode(text);
	range.insertNode(node);
	range.setStartAfter(node);
	range.collapse(true);
}
