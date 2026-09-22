/**
 * A stand-in for Obsidian's runtime, so `src/` can be exercised outside the app.
 *
 * It implements exactly what the localization and Markdown modules touch:
 * `moment.locale()`, the handful of moment methods the date helpers call, and a
 * way to pretend the interface language is something else. It is a dev-tool
 * stand-in, not a moment implementation — anything it cannot do throws rather
 * than returning a plausible wrong answer.
 */

let language = 'en';

/** Sets the language `moment.locale()` reports, i.e. the app's language. */
export function setStubLanguage(next: string): void {
	language = next;
}

type StartUnit = 'day' | 'year' | 'isoWeek';

class StubMoment {
	constructor(private readonly date: Date) {}

	clone(): StubMoment {
		return new StubMoment(new Date(this.date.getTime()));
	}

	add(count: number, unit: string): StubMoment {
		if (unit !== 'days') {
			throw new Error(`stub moment: unsupported add unit ${unit}`);
		}
		const next = new Date(this.date.getTime());
		next.setDate(next.getDate() + count);
		return new StubMoment(next);
	}

	subtract(count: number, unit: string): StubMoment {
		return this.add(-count, unit);
	}

	startOf(unit: StartUnit): StubMoment {
		const next = new Date(this.date.getTime());
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
		return this.date.getDay();
	}

	month(): number {
		return this.date.getMonth();
	}

	date(): number {
		return this.date.getDate();
	}

	year(): number {
		return this.date.getFullYear();
	}

	diff(other: StubMoment, unit: string): number {
		if (unit !== 'days') {
			throw new Error(`stub moment: unsupported diff unit ${unit}`);
		}
		return Math.round((this.date.getTime() - other.date.getTime()) / 86400000);
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
		return new Date(this.date.getTime());
	}
}

type MomentInput = Date | [number, number, number];

export const moment = Object.assign(
	(input: MomentInput): StubMoment =>
		new StubMoment(Array.isArray(input) ? new Date(input[0], input[1], input[2]) : input),
	{ locale: (): string => language },
);
