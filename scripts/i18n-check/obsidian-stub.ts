/**
 * A stand-in for Obsidian's runtime, so `src/` can be exercised outside the app.
 *
 * It implements exactly what the localization and Markdown modules touch:
 * `moment.locale()`, the handful of moment methods the date helpers call, and a
 * way to pretend the interface language is something else; plus the two classes
 * a settings tab is declared with, so the module that holds the settings model
 * can be loaded beside them. It is a dev-tool stand-in, not an Obsidian
 * implementation — anything it cannot do throws rather than returning a
 * plausible wrong answer, and that includes building a tab or a row.
 */

let language = 'en';

/** Sets the language `moment.locale()` reports, i.e. the app's language. */
export function setStubLanguage(next: string): void {
	language = next;
}

/**
 * The base class a settings tab extends.
 *
 * Only its existence matters here: a tab is declared in the same file as the
 * settings it edits, so the file has to be loadable, but a tab is never built
 * outside the app. Constructing one throws rather than producing something that
 * looks like a tab and is not.
 */
export class PluginSettingTab {
	constructor() {
		throw new Error('obsidian stub: a settings tab cannot be built outside the app');
	}
}

/** A row of a settings tab. Never built here, for the same reason. */
export class Setting {
	constructor(_containerEl: unknown) {
		throw new Error('obsidian stub: a settings row cannot be built outside the app');
	}
}

/** The base class a dialog extends. Never built here, for the same reason. */
export class Modal {
	constructor(_app: unknown) {
		throw new Error('obsidian stub: a dialog cannot be built outside the app');
	}
}

/**
 * Draws a Lucide icon into an element.
 *
 * The settings tab draws its own buttons and so reaches for this; the tab is
 * never built here, but the module that holds the settings model imports it,
 * so it has to exist. Throwing keeps the stub honest: an icon that appeared out
 * of nowhere would mean a pane had been built outside the app after all.
 */
export function setIcon(_el: unknown, _icon: string): void {
	throw new Error('obsidian stub: icons cannot be drawn outside the app');
}

/**
 * A file in the vault, as far as the store's two `instanceof` checks go.
 *
 * Those checks are the whole of what a write does with a path: whether the file
 * is there decides between creating it and overwriting it. A base class with
 * the same identity is enough to answer that, and it lets a check drive the
 * store against a vault made of a `Map`.
 */
export class TFile {
	constructor(readonly path: string) {}
}

/** A folder in the vault, for the same reason. */
export class TFolder {
	constructor(readonly path: string) {}
}

type StartUnit = 'day' | 'year' | 'isoWeek';

class StubMoment {
	// The field is not named `date`: a field of that name shadows the `date()`
	// accessor below, and `format()` calls it.
	constructor(private readonly value: Date) {}

	clone(): StubMoment {
		return new StubMoment(new Date(this.value.getTime()));
	}

	add(count: number, unit: string): StubMoment {
		if (unit !== 'days') {
			throw new Error(`stub moment: unsupported add unit ${unit}`);
		}
		const next = new Date(this.value.getTime());
		next.setDate(next.getDate() + count);
		return new StubMoment(next);
	}

	subtract(count: number, unit: string): StubMoment {
		return this.add(-count, unit);
	}

	startOf(unit: StartUnit): StubMoment {
		const next = new Date(this.value.getTime());
		if (unit === 'day') {
			next.setHours(0, 0, 0, 0);
		}
		if (unit === 'year') {
			next.setMonth(0, 1);
			next.setHours(0, 0, 0, 0);
		}
		if (unit === 'isoWeek') {
			// getDay(): Sunday is 0, so Monday is the first day of the week.
			next.setDate(next.getDate() - ((next.getDay() + 6) % 7));
			next.setHours(0, 0, 0, 0);
		}
		return new StubMoment(next);
	}

	day(): number {
		return this.value.getDay();
	}

	month(): number {
		return this.value.getMonth();
	}

	date(): number {
		return this.value.getDate();
	}

	year(): number {
		return this.value.getFullYear();
	}

	diff(other: StubMoment, unit: string): number {
		if (unit !== 'days') {
			throw new Error(`stub moment: unsupported diff unit ${unit}`);
		}
		return Math.round((this.value.getTime() - other.value.getTime()) / 86400000);
	}

	format(pattern: string): string {
		const pad = (value: number): string => String(value).padStart(2, '0');
		if (pattern === 'YYYY-MM-DD') {
			return `${this.year()}-${pad(this.month() + 1)}-${pad(this.date())}`;
		}
		if (pattern === 'YYYY') {
			return String(this.year());
		}
		throw new Error(`stub moment: unsupported format ${pattern}`);
	}

	toDate(): Date {
		return new Date(this.value.getTime());
	}
}

type MomentInput = Date | [number, number, number];

export const moment = Object.assign(
	(input: MomentInput): StubMoment =>
		new StubMoment(Array.isArray(input) ? new Date(input[0], input[1], input[2]) : input),
	{ locale: (): string => language },
);
