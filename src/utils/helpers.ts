let taskCounter = 0;

/**
 * Stable-per-session identifier for a task. Task identity is only used for DOM
 * bookkeeping, never for persistence, so a counter is enough and no randomness
 * (or crypto API) is required.
 */
export function createTaskId(): string {
	taskCounter += 1;
	return `task-${taskCounter}`;
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * Whether a value is a plain object: something fields can be read off, as
 * opposed to an array, a scalar, or null.
 *
 * Used where data comes from a file rather than from code — a stored settings
 * object is shaped like whatever last wrote it, and reading `value.id` off a
 * number is a runtime error rather than the `undefined` a type would promise.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Coalesces bursts of calls into one trailing invocation, which keeps file
 * writes off the keystroke path.
 */
export function debounce<Args extends unknown[]>(
	fn: (...args: Args) => void,
	delay: number,
): (...args: Args) => void {
	let timer: number | null = null;

	return (...args: Args): void => {
		if (timer !== null) {
			window.clearTimeout(timer);
		}
		timer = window.setTimeout(() => {
			timer = null;
			fn(...args);
		}, delay);
	};
}

/** Sanitizes user input for use as a vault folder path. */
export function normalizeFolder(value: string): string {
	return value
		.trim()
		.replace(/^\/+/, '')
		.replace(/\/+$/, '')
		.replace(/\/{2,}/g, '/');
}

/**
 * How many columns of `minColumnWidth` fit in `availableWidth`.
 *
 * Both views size their grid from the pane they are actually in rather than from
 * the window, because an Obsidian pane is often a sidebar or half a split.
 * `availableWidth` should exclude the grid's own horizontal padding.
 */
export function fitColumns(
	availableWidth: number,
	minColumnWidth: number,
	maxColumns: number,
	gap: number,
	itemCount: number,
): number {
	if (availableWidth <= 0 || minColumnWidth <= 0) {
		return Math.max(1, Math.min(maxColumns, itemCount));
	}
	const fitting = Math.floor((availableWidth + gap) / (minColumnWidth + gap));
	return Math.max(1, Math.min(maxColumns, itemCount, fitting));
}

/**
 * How many day columns the week's review panel takes.
 *
 * Three days per row is the shape the board is built around, and the week is
 * seven days plus this one panel: spanning two is what makes 9 cells land as a
 * full 3x3, so the board ends on a complete row instead of on the two empty
 * cells the seventh day leaves over. A two-column pane is closed by one cell
 * instead — a panel spanning two there would not fit beside the seventh day,
 * would be pushed onto a row of its own, and would leave that same gap behind.
 */
export function reviewSpan(columns: number): number {
	return columns >= 3 ? 2 : 1;
}
