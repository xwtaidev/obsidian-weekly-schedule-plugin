/**
 * A stand-in for Obsidian's runtime, built for one purpose: to let the real
 * plugin class and the real board view run outside the app, so the
 * orchestration between them can be checked — the order in which a change of
 * cells commits, writes, closes and re-reads, which no store-level check can
 * see.
 *
 * The i18n stub is deliberately hostile — a pane built outside the app throws
 * there — and this one cannot be, because `onload` constructs a settings tab
 * and the align offer constructs a dialog. So it keeps that stub for the
 * pieces nothing here touches (`setIcon` above all) and shadows the rest with
 * versions that can exist: a `Plugin` whose registration members are no-ops,
 * an `ItemView` that hands out elements doing nothing, a `Notice` that
 * records, and a moment with the surface the date helpers use plus string
 * parsing. A file in this vault also knows its own name, because the
 * migration helpers read `extension` and `basename` to find the weeks.
 *
 * The DOM is the part that stays outside: no pane is ever drawn, so a check
 * reaches a board through the methods the app would call on it (`onload`,
 * `save`, `onClose`) with its private fields set the way `onOpen` and `render`
 * would have set them. The edit path that runs is the real one.
 */

export * from '../i18n-check/obsidian-stub.ts';

/** A DOM node that stands in for every element and never gets in the way. */
export function makeEl(): any {
	const el: any = {
		dataset: {},
		style: {},
		clientWidth: 900,
		clientHeight: 600,
		textContent: '',
		addClass: () => el,
		removeClass: () => el,
		toggleClass: () => el,
		hasClass: () => false,
		setText: () => el,
		appendText: () => el,
		empty: () => el,
		createDiv: () => makeEl(),
		createEl: () => makeEl(),
		createSpan: () => makeEl(),
		append: () => el,
		appendChild: () => el,
		insertAdjacentElement: () => el,
		detach: () => el,
		addEventListener: () => el,
		removeEventListener: () => el,
		dispatchEvent: () => false,
		setAttribute: () => el,
		removeAttribute: () => el,
		getAttribute: () => null,
		querySelector: () => null,
		querySelectorAll: () => [],
		contains: () => false,
		focus: () => el,
		select: () => el,
		click: () => el,
	};
	return el;
}

/** The plugin base class: the members the real plugin calls during onload. */
export class Plugin {
	private saved: unknown = null;
	constructor(
		public readonly app: any,
		public readonly manifest: any,
	) {}
	async loadData(): Promise<unknown> {
		return this.saved;
	}
	async saveData(data: unknown): Promise<void> {
		this.saved = JSON.parse(JSON.stringify(data));
	}
	register(_callback: () => any): void {}
	registerInterval(_id: number): void {}
	registerEvent(_ref: unknown): void {}
	registerDomEvent(..._args: unknown[]): void {}
	addRibbonIcon(..._args: unknown[]): any {
		return makeEl();
	}
	addCommand(_command: any): any {
		return { name: '' };
	}
	registerView(_type: string, _factory: (leaf: any) => unknown): void {}
	addSettingTab(_tab: unknown): void {}
}

/** Records what the user would have seen pop up. */
export class Notice {
	static readonly messages: string[] = [];
	constructor(message: string) {
		Notice.messages.push(message);
	}
}

/** A dialog that can exist, because the align offer constructs one. */
export class Modal {
	readonly modalEl: any = makeEl();
	readonly titleEl: any = makeEl();
	readonly contentEl: any = makeEl();
	constructor(_app: unknown) {}
	open(): void {}
	close(): void {}
}

/** A settings tab that can be registered, since onload constructs it. */
export class PluginSettingTab {
	readonly containerEl: any = makeEl();
	constructor(..._args: unknown[]) {}
}

/** A settings row that can exist, for the same reason. */
export class Setting {
	constructor(..._args: unknown[]) {}
}

/** The base class both views extend. No DOM until onOpen. */
export class ItemView {
	readonly app: any;
	readonly contentEl: any;
	readonly containerEl: any;
	constructor(readonly leaf: any) {
		this.app = leaf.app;
		this.contentEl = makeEl();
		this.containerEl = makeEl();
	}
	register(_callback: () => any): void {}
	registerInterval(_id: number): void {}
}

/** A context menu that is never opened here. */
export class Menu {
	addItem(_callback: (item: any) => void): Menu {
		return this;
	}
	addSeparator(): Menu {
		return this;
	}
	showAtMouseEvent(): Menu {
		return this;
	}
	showAtPosition(): Menu {
		return this;
	}
	hide(): void {}
}

/** A pane, so a view can sit in one. */
export class WorkspaceLeaf {
	view: unknown = null;
	constructor(public readonly app: any) {}
}

/** Obsidian's path helper: nothing under test needs it to do more. */
export function normalizePath(path: string): string {
	return path;
}

/**
 * A file in the vault. The i18n stub's file is only an `instanceof` target for
 * the store; this one also knows its own name, which is how the migration
 * helpers decide what a file is at all.
 */
export class TFile {
	constructor(readonly path: string) {}
	get name(): string {
		return this.path.slice(this.path.lastIndexOf('/') + 1);
	}
	get extension(): string {
		const dot = this.name.lastIndexOf('.');
		return dot === -1 ? '' : this.name.slice(dot + 1);
	}
	get basename(): string {
		const dot = this.name.lastIndexOf('.');
		return dot === -1 ? this.name : this.name.slice(0, dot);
	}
}

/** A folder in the vault, for the store's folder check. */
export class TFolder {
	constructor(readonly path: string) {}
}

class StubMoment {
	constructor(private readonly value: Date) {}
	clone(): StubMoment {
		return new StubMoment(new Date(this.value.getTime()));
	}
	add(count: number, unit: string): StubMoment {
		if (unit !== 'days') {
			throw new Error(`e2e stub moment: unsupported add unit ${unit}`);
		}
		const next = new Date(this.value.getTime());
		next.setDate(next.getDate() + count);
		return new StubMoment(next);
	}
	subtract(count: number, unit: string): StubMoment {
		return this.add(-count, unit);
	}
	startOf(unit: string): StubMoment {
		const next = new Date(this.value.getTime());
		if (unit === 'day') {
			next.setHours(0, 0, 0, 0);
		} else if (unit === 'year') {
			next.setMonth(0, 1);
			next.setHours(0, 0, 0, 0);
		} else if (unit === 'isoWeek') {
			next.setDate(next.getDate() - ((next.getDay() + 6) % 7));
			next.setHours(0, 0, 0, 0);
		} else {
			throw new Error(`e2e stub moment: unsupported startOf unit ${unit}`);
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
			throw new Error(`e2e stub moment: unsupported diff unit ${unit}`);
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
		throw new Error(`e2e stub moment: unsupported format ${pattern}`);
	}
	toDate(): Date {
		return new Date(this.value.getTime());
	}
}

/** Moment with the surface the date helpers use, plus `YYYY-MM-DD` parsing. */
export const moment = Object.assign(
	(...args: any[]): StubMoment => {
		const input = args[0];
		if (input === undefined) {
			return new StubMoment(new Date());
		}
		if (input instanceof Date) {
			return new StubMoment(input);
		}
		if (Array.isArray(input)) {
			return new StubMoment(new Date(input[0], input[1], input[2]));
		}
		if (typeof input === 'string') {
			const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
			if (match) {
				return new StubMoment(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
			}
			throw new Error(`e2e stub moment: cannot parse ${input}`);
		}
		throw new Error(`e2e stub moment: cannot take ${typeof input}`);
	},
	{ locale: (): string => 'en' },
);
