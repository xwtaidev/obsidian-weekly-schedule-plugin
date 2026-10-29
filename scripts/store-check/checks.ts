/**
 * Checks that a week survives the trip from a board to its file.
 *
 * What goes wrong here cannot be seen from the outside: the store holds a week
 * in memory between the keystroke that changed it and the timer that writes it,
 * and a write that finds nothing to write does not fail loudly — it returns as
 * if it were done. The board goes on showing work no file holds, which is the
 * one failure a week cannot recover from. It has happened twice:
 *
 * - a change of cells emptied the store under the open board and left it there,
 *   so every keystroke after the change was a write to a week the store no
 *   longer had (the settings tab's alignment pass, which runs on every change);
 * - the year overview dropped every week whose file changed and that it was not
 *   itself showing, which is exactly the week an open board was editing.
 *
 * So the rules are checked rather than trusted:
 *
 * - work typed into a cell added while the board is open reaches the file, and
 *   is there to be merged when the cell is removed again;
 * - an edit reaches the file even when the store no longer holds the week;
 * - a week a caller asked to forget is not written from the copy it forgot;
 * - a week held in memory but not cached is flushed on the way out;
 * - a week with nothing to write is not written, and one with no file is made;
 * - a week nobody wrote into gets neither a file nor the folders above it, which
 *   is what a half-typed schedule folder used to leave behind (issue #1).
 *
 * Run with `npm run check:store`. The vault is a `Map` — the store's whole
 * contact with Obsidian is four methods and one `instanceof`.
 */
import { TFile, TFolder } from 'obsidian';
import { ScheduleStore } from '../../src/store';
import { buildSlotLayout, retireHeading, retireSlot } from '../../src/slots';
import type { SlotLayout } from '../../src/slots';
import type { Day, Quadrant, Slot, WeekSchedule } from '../../src/types';

// The store's debounce reaches for a browser timer; node has the same one under
// another name, and nothing else here needs a window.
(globalThis as unknown as { window: typeof globalThis }).window = globalThis;

const WEEK = '2026-10-05';
const PATH = 'weekly-schedule/2026/2026-W41.md';
/** Longer than `SAVE_DEBOUNCE_MS`, since the point is to wait for the timer. */
const DEBOUNCE = 900;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (!ok) {
		failures += 1;
	}
	console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
	if (!ok) {
		console.log(`       wanted ${JSON.stringify(expected)}`);
		console.log(`       got    ${JSON.stringify(actual)}`);
	}
}

class FakeFile extends TFile {
	content: string;
	constructor(path: string, content: string) {
		super(path);
		this.content = content;
	}
}

class FakeVault {
	readonly files = new Map<string, FakeFile>();
	readonly folders = new Set<string>();
	readonly writes: string[] = [];

	seed(path: string, content: string): void {
		this.files.set(path, new FakeFile(path, content));
	}

	getFileByPath(path: string): TFile | null {
		return this.files.get(path) ?? null;
	}

	getAbstractFileByPath(path: string): TFile | TFolder | null {
		return this.files.get(path) ?? (this.folders.has(path) ? new TFolder(path) : null);
	}

	async read(file: TFile): Promise<string> {
		return (file as FakeFile).content;
	}

	async modify(file: TFile, content: string): Promise<void> {
		(file as FakeFile).content = content;
		this.writes.push(file.path);
	}

	async create(path: string, content: string): Promise<void> {
		this.seed(path, content);
		this.writes.push(path);
	}

	async createFolder(path: string): Promise<void> {
		this.folders.add(path);
	}

	text(path: string): string {
		return this.files.get(path)?.content ?? '';
	}
}

const BASE: readonly Slot[] = [
	{ id: 'q1', name: null, tone: 0 },
	{ id: 'q2', name: null, tone: 1 },
	{ id: 'q3', name: null, tone: 2 },
];
const CELL: Slot = { id: 's4', name: '格子 5', tone: 3 };

/** A board: the pane that shows a week, and the store behind it. */
function openBoard(vault: FakeVault, layout: () => SlotLayout) {
	const store = new ScheduleStore(vault as never, layout);
	let schedule: WeekSchedule | null = null;
	const pane = {
		store,
		get loaded(): WeekSchedule {
			if (schedule === null) {
				throw new Error('check: the board has no week');
			}
			return schedule;
		},
		/** `WeeklyScheduleView.render` — reads the week if it holds none. */
		async load(): Promise<void> {
			schedule = await store.load(WEEK, PATH);
		},
		/** `WeeklyScheduleView.refresh` — forgets the week and reads it again. */
		async refresh(): Promise<void> {
			await store.invalidate();
			schedule = null;
			await pane.load();
		},
		/** `WeeklyScheduleView.save`. */
		save(): void {
			if (schedule !== null) {
				store.markDirty(schedule.path, schedule);
			}
		},
		/** One cell of the first day. */
		cell(id: string): Quadrant {
			const day: Day | undefined = pane.loaded.days[0];
			const quadrant = day?.quadrants.find((item) => item.id === id);
			if (quadrant === undefined) {
				throw new Error(`check: the board shows no cell ${id}`);
			}
			return quadrant;
		},
	};
	return pane;
}

function freshVault(): FakeVault {
	const vault = new FakeVault();
	vault.seed(PATH, ['# 2026-W41', '', '## 周一', '', '### 重要 · 紧急', '- [ ] 甲', ''].join('\n'));
	return vault;
}

/**
 * A cell is added while the board is open, work goes into it, and the cell is
 * then removed into another one.
 *
 * `emptiedAfterwards` is the state `alignSlotsAcrossWeeks` used to leave: the
 * board holding a week the store no longer does. That must not cost the board
 * its edits, whatever left the store in that state.
 */
async function cellAddedThenRemoved(emptiedAfterwards: boolean): Promise<void> {
	const vault = freshVault();
	let layout: SlotLayout = buildSlotLayout(BASE, {}, {});
	const pane = openBoard(vault, () => layout);
	await pane.load();

	// `applySlotChange`: the cells change, and the board is drawn again.
	await pane.store.flush(PATH);
	await pane.store.invalidate();
	layout = buildSlotLayout([...BASE, CELL], {}, {});
	await pane.refresh();
	if (emptiedAfterwards) {
		// What the alignment pass that follows every change of cells used to
		// leave behind: the board shows a week the store no longer holds.
		await pane.store.invalidate();
	}

	pane.cell('s4').tasks.push({ id: 't1', text: '乙', done: false });
	pane.save();
	await sleep(DEBOUNCE);

	check(
		'the work typed into a cell added while the board was open is in the file',
		vault.text(PATH).includes('乙'),
		true,
	);

	// `removeCell`: where the id went, what it was called, then the change.
	await pane.store.flush(PATH);
	await pane.store.invalidate();
	layout = buildSlotLayout(
		BASE,
		retireSlot({}, 's4', 'q1'),
		retireHeading({}, CELL.name ?? '', 's4'),
	);
	await pane.refresh();
	await pane.store.flushAll();

	check(
		'the work is in the cell the dialog named, after that cell was removed',
		pane.cell('q1').tasks.map((task) => task.text),
		['甲', '乙'],
	);
	check(
		'and the week is written under that cell',
		vault.text(PATH).includes('### 重要 · 紧急'),
		true,
	);
	check(
		'with no heading left over for the cell that was removed',
		vault.text(PATH).includes('格子 5'),
		false,
	);
}

console.log('a cell added in the settings, with its board open');
await cellAddedThenRemoved(false);

console.log('the same, with the store emptied under the board');
await cellAddedThenRemoved(true);

console.log('a board whose week another surface drops');
{
	const vault = freshVault();
	const layout: SlotLayout = buildSlotLayout([...BASE, CELL], {}, {});
	const pane = openBoard(vault, () => layout);
	await pane.load();
	pane.cell('s4').tasks.push({ id: 't1', text: '丙', done: false });
	// What the year overview used to do to every week it was not showing.
	pane.store.forget(PATH);
	pane.save();
	await sleep(DEBOUNCE);
	check('the edit still reaches the file', vault.text(PATH).includes('丙'), true);
}

console.log('what forgetting a week means for an edit not yet written');
{
	const vault = freshVault();
	const layout: SlotLayout = buildSlotLayout(BASE, {}, {});
	const pane = openBoard(vault, () => layout);
	await pane.load();
	pane.cell('q1').tasks[0]!.text = '改了';
	pane.save();
	// `forget` is how a caller says "read this week again"; a write that outlived
	// it would put the discarded version back on disk.
	pane.store.forget(PATH);
	await sleep(DEBOUNCE);
	check('the discarded edit is not written', vault.text(PATH).includes('改了'), false);
}

console.log('a week held in memory but not cached, flushed on the way out');
{
	const vault = freshVault();
	const layout: SlotLayout = buildSlotLayout(BASE, {}, {});
	const pane = openBoard(vault, () => layout);
	await pane.load();
	// The store emptied under the board, and the edit made after that: nothing
	// is cached, so only the board knows what to write.
	await pane.store.invalidate();
	pane.cell('q1').tasks.push({ id: 't2', text: '丁', done: false });
	pane.save();
	check('the debounced write is not relied on yet', vault.text(PATH).includes('丁'), false);
	await pane.store.flushAll();
	check('a week held only in memory is written by flushAll', vault.text(PATH).includes('丁'), true);
}

console.log('a week with nothing to write');
{
	const vault = freshVault();
	const layout: SlotLayout = buildSlotLayout(BASE, {}, {});
	const pane = openBoard(vault, () => layout);
	await pane.load();
	const before = vault.writes.length;
	await pane.store.flush(PATH);
	await pane.store.flushAll();
	check('an untouched week is left alone', vault.writes.length, before);
}

console.log('a week whose file does not exist yet');
{
	const vault = new FakeVault();
	const layout: SlotLayout = buildSlotLayout(BASE, {}, {});
	const pane = openBoard(vault, () => layout);
	await pane.load();
	pane.cell('q1').tasks.push({ id: 't1', text: '戊', done: false });
	pane.save();
	await sleep(DEBOUNCE);
	check('the file is made, with the work in it', vault.text(PATH).includes('戊'), true);
	check('and its folder first', vault.folders.has('weekly-schedule/2026'), true);
}

console.log('a week with no file and nothing in it');
{
	const vault = new FakeVault();
	const layout: SlotLayout = buildSlotLayout(BASE, {}, {});
	const pane = openBoard(vault, () => layout);
	await pane.load();
	// Unloading, changing the cells, any settings change: all of them flush
	// every week the store holds, including one that was only ever looked at.
	await pane.store.flushAll();
	check('no file is made for a week nobody wrote into', vault.files.has(PATH), false);
	check('and no folder is made to hold it', [...vault.folders], []);
}

console.log('a schedule folder typed one letter at a time');
{
	const vault = new FakeVault();
	const layout: SlotLayout = buildSlotLayout(BASE, {}, {});
	const store = new ScheduleStore(vault as never, () => layout);
	const pathIn = (folder: string): string =>
		folder.length > 0 ? `${folder}/2026/2026-W41.md` : '2026/2026-W41.md';

	// The board is open on the week in the old folder. The settings field used
	// to commit on every keystroke, and each commit is a refresh: flush what the
	// store holds, then read the week under the folder typed so far.
	await store.load(WEEK, PATH);
	let typed = '';
	for (const char of 'Templates/Weekly') {
		typed += char;
		await store.invalidate();
		await store.load(WEEK, pathIn(typed));
	}

	// What the reporter of issue #1 saw: a folder per keystroke, each holding a
	// week file with nothing in it.
	check('no folder is made for a half-typed path', [...vault.folders], []);
	check('and no week file is made in one', [...vault.files.keys()], []);
}

console.log('a week emptied by hand');
{
	const vault = freshVault();
	const layout: SlotLayout = buildSlotLayout(BASE, {}, {});
	const pane = openBoard(vault, () => layout);
	await pane.load();
	pane.cell('q1').tasks.splice(0);
	pane.save();
	await sleep(DEBOUNCE);
	// The guard above must not stop a week from being written back empty: a
	// task removed has to leave the file, or the next read brings it back.
	check('the task is gone from the file', vault.text(PATH).includes('甲'), false);
}

console.log('a legacy week emptied by hand');
{
	const vault = new FakeVault();
	vault.seed('weekly-schedule/2026-W41.md', '# 2026-W41\n\n## 周一\n\n### 重要 · 紧急\n- [ ] 甲\n');
	const pane = openBoard(vault, () => buildSlotLayout(BASE, {}, {}));
	await pane.load();
	pane.cell('q1').tasks.splice(0);
	pane.save();
	await pane.store.flush(PATH);
	pane.store.forget(PATH);
	await pane.load();
	check('cleared legacy tasks stay cleared after reopening', pane.cell('q1').tasks.length, 0);
}

console.log('a week moved outside the store without local edits');
{
	const vault = freshVault();
	const pane = openBoard(vault, () => buildSlotLayout(BASE, {}, {}));
	await pane.load();
	vault.files.delete(PATH);
	await pane.store.invalidate();
	check('flushing does not recreate the old file', vault.files.has(PATH), false);
	check('flushing does not recreate its folders', [...vault.folders], []);
}

console.log('an empty week receives a file from outside');
{
	const vault = new FakeVault();
	const pane = openBoard(vault, () => buildSlotLayout(BASE, {}, {}));
	await pane.load();
	await pane.store.flushAll();
	check('the untouched empty week is clean', pane.store.hasLocalEdits(PATH), false);
	vault.seed(PATH, '# 2026-W41\n\n## 周一\n\n### 重要 · 紧急\n- [ ] 外部任务\n');
	// A flush before the event must not overwrite the newly arrived file.
	await pane.store.flushAll();
	check('flushing preserves the externally created file', vault.text(PATH).includes('外部任务'), true);
	check('the external change is reloaded', await pane.store.reloadIfChanged(PATH), true);
	pane.store.forget(PATH);
	await pane.load();
	check('the reloaded board shows the external task', pane.cell('q1').tasks[0]?.text, '外部任务');
}

console.log('a new week containing only a review');
{
	const vault = new FakeVault();
	const pane = openBoard(vault, () => buildSlotLayout(BASE, {}, {}));
	await pane.load();
	pane.loaded.review.plan.push('Review only');
	pane.save();
	await pane.store.flush(PATH);
	check('the review is written', vault.text(PATH).includes('Review only'), true);
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
