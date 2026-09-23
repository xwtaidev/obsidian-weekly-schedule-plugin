import { moment } from 'obsidian';
import { dateKey } from './date';

/**
 * Watches the calendar date roll over, so anything drawn relative to "today"
 * can redraw itself when today stops being today.
 *
 * The date is compared rather than a timeout set for the next midnight: a
 * machine that was asleep, or an app that was in the background, then catches
 * up on the first check after it is looked at again, instead of having missed
 * midnight for good. Returns the check to call — it does nothing until the date
 * is no longer the one the watch started on, so calling it often is harmless.
 */
export function watchDayChange(onDayChange: () => void): () => void {
	let day = dateKey(moment());

	return () => {
		const today = dateKey(moment());
		if (today === day) {
			return;
		}
		day = today;
		onDayChange();
	};
}
