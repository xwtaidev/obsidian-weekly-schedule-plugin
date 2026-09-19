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
