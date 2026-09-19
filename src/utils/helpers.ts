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
