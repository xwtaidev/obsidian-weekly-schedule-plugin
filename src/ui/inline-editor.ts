/**
 * Inline plain-text editing helpers for the task rows. These are deliberately
 * free of plugin state: the board passes a callback and owns the data.
 */

import { normalizeTaskText } from '../markdown';
import type { TaskCommitKey } from '../types';

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export interface InlineEditorOptions {
	/** The keystroke that commits; the other Enter starts a new line. */
	commitKey: TaskCommitKey;
}

/**
 * Makes an element editable as plain text: pasted rich content is reduced to
 * text, leaving the field commits the current value, and the two Enter
 * keystrokes split between committing and starting a new line.
 *
 * A task is usually one line, so committing on Enter is what keeps a column of
 * them quick to fill in; a task may also run over several lines, so the other
 * Enter — Shift+Enter, unless the user has swapped them — starts one. Cmd/Ctrl
 * commits in either case, which keeps a commit from ever being out of reach.
 */
export function registerInlineEditor(
	element: HTMLElement,
	onChange: (value: string) => void,
	options: InlineEditorOptions,
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
		// An Enter that picks a candidate in an input method belongs to the input
		// method, not to the task: committing or breaking the line while a
		// candidate list is open would cut a word being typed in half.
		if (event.isComposing) {
			return;
		}

		if (event.key === 'Enter') {
			const modifier = event.metaKey || event.ctrlKey;
			const commits = modifier || event.shiftKey === (options.commitKey === 'shiftEnter');
			event.preventDefault();
			if (commits) {
				commit();
				element.blur();
				return;
			}
			// The break is inserted as a newline character rather than left to the
			// browser: `plaintext-only` may produce either a newline or a `<br>`,
			// and the text a task holds has to be one thing.
			insertText(element, '\n');
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
		// A pasted line break is part of the task rather than a second task, so
		// the text goes in as it came — but without the blank lines a task cannot
		// hold: dropped here rather than written out and lost on the next read.
		insertText(element, normalizeTaskText(text));
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
function insertText(element: HTMLElement, text: string): void {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) {
		return;
	}
	const range = selection.getRangeAt(0);
	range.deleteContents();

	// The `<br>` holding the line under the last break open is an anchor rather
	// than text, so the insertion goes in front of it: left behind the inserted
	// text it would sit between two lines and every line after it would gain a
	// blank one.
	const anchor = trailingAnchor(element, range);
	if (anchor) {
		range.setStartBefore(anchor);
		range.collapse(true);
	}

	const node = document.createTextNode(text);
	range.insertNode(node);
	range.setStartAfter(node);
	range.collapse(true);

	// A line break at the very end of the field needs that anchor, because the
	// last break in a block is not rendered: the empty line it starts has no box
	// to exist in, so the break would look like it never happened and would
	// leave the caret on the line above — it would take a second break to put a
	// line on screen. An empty `<br>` gives the line somewhere to be, which is
	// the same anchor Chromium keeps in an editable of its own; it holds no
	// text, so the value is unaffected, and Chromium takes it back the moment
	// something is typed on the line.
	if (!anchor && text.endsWith('\n') && endsField(node, element)) {
		const br = element.createEl('br');
		range.setStartAfter(br);
		range.collapse(true);
	}
}

/**
 * The anchor `<br>` at the end of the field, if the caret is past everything
 * else. A `<br>` as an editable's last child can only be that anchor: there is
 * no other way for one to get there.
 */
function trailingAnchor(element: HTMLElement, range: Range): HTMLElement | null {
	const last = element.lastChild;
	if (!last || last.nodeName !== 'BR') {
		return null;
	}
	const probe = range.cloneRange();
	probe.setEnd(element, element.childNodes.length);
	return probe.toString().length === 0 ? (last as HTMLElement) : null;
}

/** Whether nothing that shows text follows `node` inside `element`. */
function endsField(node: Node, element: HTMLElement): boolean {
	const probe = document.createRange();
	probe.setStartAfter(node);
	probe.setEnd(element, element.childNodes.length);
	return probe.toString().length === 0;
}
