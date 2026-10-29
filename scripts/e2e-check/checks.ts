/**
 * The order of a change of cells, checked end to end — the one part of the
 * plugin that store-level checks cannot see, and the part that lost work
 * twice: the board holds a week in memory, the store holds it in a cache, and
 * the two fall out of step exactly when the cells change underneath them.
 *
 * The classes here are the real ones. A plugin loads, a board view sits in a
 * leaf, an edit is typed through the view's own save path, and the settings
 * tab's calls (what `applyCells` makes) are made directly on the plugin. The
 * board is never drawn — its private fields are set the way `onOpen` and
 * `render` would set them — so what runs is the orchestration, not the DOM.
 *
 * The sequence is the user's: a board is open with work typed but not yet
 * written; a cell is added; the boards close (and everything typed must be on
 * disk first); the board opened again shows the new cell, and work typed into
 * it reaches the file; the cell is removed into another one, and its work
 * lands there, with the offer to rewrite the vault's old headings following.
 */
import { Notice, TFile, TFolder, WorkspaceLeaf, moment } from 'obsidian';
import WeeklySchedulePlugin from '../../src/main';
import { WeeklyScheduleView } from '../../src/ui/weekly-schedule-view';
import { VIEW_TYPE_WEEKLY_SCHEDULE, VIEW_TYPE_WEEKLY_SCHEDULE_YEAR } from '../../src/constants';
import { buildSlotLayout, retireHeading, retireSlot } from '../../src/slots';
import { parseSchedule, serializeSchedule } from '../../src/markdown';
import { planSlotAlignment } from '../../src/migrate';
import { normalizeSettings } from '../../src/settings';
import { weekFilePath } from '../../src/utils/date';
import { t } from '../../src/i18n';
import type { Slot } from '../../src/types';

// What onload and the view's editor-sync expect to find in a browser.
(globalThis as any).window = globalThis;
(globalThis as any).document = { addEventListener() {}, activeElement: null };
(globalThis as any).HTMLElement = class HTMLElement {};

const WS = '2026-10-19'; // a Monday
const FOLDER = 'weekly-schedule';
const PATH = weekFilePath(FOLDER, moment(WS, 'YYYY-MM-DD'));
const DEBOUNCE = 650;

let failures = 0;
function check(name: string, actual: unknown, expected: unknown): void {
	const same =
		Array.isArray(actual) && Array.isArray(expected)
			? JSON.stringify(actual) === JSON.stringify(expected)
			: actual === expected;
	if (!same) {
		failures += 1;
		console.log(
			`FAIL ${name}\n  actual:   ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`,
		);
	}
}

/** A vault held in a Map, with the members the migration helpers also use. */
function makeVault(files: Record<string, string>) {
	const contents = new Map<string, string>(Object.entries(files));
	const listeners = new Map<string, (file: TFile) => void>();
	const map = new Map<string, TFile>();
	for (const path of Object.keys(files)) {
		map.set(path, new TFile(path));
	}
	const folders = new Set<string>([FOLDER, `${FOLDER}/2026`]);
	return {
		contents,
		listeners,
		getFileByPath: (path: string) => map.get(path) ?? null,
		getAbstractFileByPath: (path: string) =>
			folders.has(path) ? new TFolder(path) : (map.get(path) ?? null),
		getFiles: () => [...map.values()],
		async read(file: TFile) {
			return contents.get(file.path) ?? '';
		},
		async cachedRead(file: TFile) {
			return contents.get(file.path) ?? '';
		},
		async process(file: TFile, callback: (content: string) => string) {
			const next = callback(contents.get(file.path) ?? '');
			contents.set(file.path, next);
			return next;
		},
		async modify(file: TFile, content: string) {
			contents.set(file.path, content);
		},
		async create(path: string, content: string) {
			contents.set(path, content);
			map.set(path, new TFile(path));
		},
		async createFolder(path: string) {
			folders.add(path);
		},
		on(event: string, callback: (file: TFile) => void) {
			listeners.set(event, callback);
			return {};
		},
	};
}

const detached: string[] = [];
function makeWorkspace() {
	const leaves = new Map<string, any[]>();
	return {
		leaves,
		getLeavesOfType(type: string) {
			return leaves.get(type) ?? [];
		},
		detachLeavesOfType(type: string) {
			detached.push(type);
			leaves.delete(type);
		},
		on() {
			return {};
		},
		requestSaveLayout() {},
	};
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
	// A week with one task in it, written exactly the way the plugin writes it.
	const base = normalizeSettings(null);
	const layout = buildSlotLayout(base.slots, {}, {});
	const seeded = parseSchedule('', WS, PATH, layout);
	seeded.days[0].quadrants.find((q: any) => q.id === 'q1').tasks.push({
		id: 't0',
		text: '甲',
		done: false,
	});
	const initialRaw = serializeSchedule(seeded, layout);

	const vault = makeVault({ [PATH]: initialRaw });
	const app: any = { vault, workspace: makeWorkspace() };
	const plugin: any = new WeeklySchedulePlugin(app, {});
	await plugin.onload();
	check('settings loaded from nothing give four cells', plugin.settings.slots.length, 4);

	console.log('a board is open, and an edit has been typed but not flushed');
	const leaf: any = new WorkspaceLeaf(app);
	app.workspace.leaves.set(VIEW_TYPE_WEEKLY_SCHEDULE, [leaf]);
	const view: any = new WeeklyScheduleView(leaf, plugin);
	leaf.view = view;
	view.weekStart = WS;
	view.renderedWeekStart = WS;
	view.schedule = await plugin.store.load(WS, PATH);
	view.schedule.days[0].quadrants
		.find((q: any) => q.id === 'q1')
		.tasks.push({ id: 't1', text: '乙', done: false });
	view.save();
	check('the edit is pending, not written', (vault.contents.get(PATH) ?? '').includes('- [ ] 乙'), false);

	console.log('the settings add a cell — what applyCells does, in order');
	const slot: Slot = { id: 's5', name: '格子 5', tone: 4 };
	await plugin.applySlotChange(
		[...plugin.settings.slots, slot],
		plugin.settings.retiredSlots,
		plugin.settings.retiredHeadings,
	);
	await plugin.alignSlotsAcrossWeeks();
	check('the board was closed, both view types detached', detached, [
		VIEW_TYPE_WEEKLY_SCHEDULE,
		VIEW_TYPE_WEEKLY_SCHEDULE_YEAR,
	]);
	check('a notice says the boards were closed', Notice.messages.includes(t('settings.slots.closed')), true);
	check('the typed edit was written before the change', (vault.contents.get(PATH) ?? '').includes('- [ ] 乙'), true);
	check('the settings hold five cells now', plugin.settings.slots.length, 5);
	check('the saved data holds five cells too', plugin.saved.slots.length, 5);
	check('no board is left open', app.workspace.getLeavesOfType(VIEW_TYPE_WEEKLY_SCHEDULE).length, 0);

	const afterAdd = vault.contents.get(PATH) ?? '';
	await view.onClose();
	check('closing the detached board writes nothing', vault.contents.get(PATH) ?? '', afterAdd);

	console.log('the board opened again is typed into, in the new cell');
	const leaf2: any = new WorkspaceLeaf(app);
	app.workspace.leaves.set(VIEW_TYPE_WEEKLY_SCHEDULE, [leaf2]);
	const view2: any = new WeeklyScheduleView(leaf2, plugin);
	leaf2.view = view2;
	view2.weekStart = WS;
	view2.renderedWeekStart = WS;
	view2.schedule = await plugin.store.load(WS, PATH);
	check('the reopened board shows five cells', view2.schedule.days[0].quadrants.length, 5);
	view2.schedule.days[0].quadrants
		.find((q: any) => q.id === 's5')
		.tasks.push({ id: 't2', text: '丙', done: false });
	view2.save();
	await sleep(DEBOUNCE);
	const afterTyping = vault.contents.get(PATH) ?? '';
	check('the new cell reached the file under its own name', afterTyping.includes('### 格子 5'), true);
	check('the typed task reached the file', afterTyping.includes('- [ ] 丙'), true);

	console.log('the cell is removed, its work going to the first one');
	const { slots, retiredSlots, retiredHeadings } = plugin.settings;
	const removed = slots.find((s: any) => s.id === 's5');
	await plugin.applySlotChange(
		slots.filter((s: any) => s.id !== 's5'),
		retireSlot(retiredSlots, 's5', 'q1'),
		retireHeading(retiredHeadings, removed.name, 's5'),
	);
	await plugin.alignSlotsAcrossWeeks();
	check('the reopened board was closed again', detached.length, 4);
	check('the removed cell is remembered by its name', plugin.saved.retiredHeadings['格子 5'], 's5');
	check('the removed cell points where its work goes', plugin.saved.retiredSlots['s5'], 'q1');

	plugin.store.forget(PATH);
	const merged = await plugin.store.load(WS, PATH);
	const q1 = merged.days[0].quadrants.find((q: any) => q.id === 'q1');
	check("the removed cell's work landed in the cell that took over", q1.tasks.map((task: any) => task.text), [
		'甲',
		'乙',
		'丙',
	]);

	console.log('the offer to rewrite the stale heading, carried out');
	const plan = await planSlotAlignment(vault, FOLDER, plugin.slotLayout());
	check('aligning offers to rewrite the one week written under the old name', plan.length, 1);
	await plugin.alignWeeks(plan, plugin.slotLayout());
	const aligned = vault.contents.get(PATH) ?? '';
	check('the old name is gone from the file', aligned.includes('### 格子 5'), false);
	const reparsed = await plugin.store.load(WS, PATH);
	const q1After = reparsed.days[0].quadrants.find((q: any) => q.id === 'q1');
	check('the work is still there after the rewrite', q1After.tasks.map((task: any) => task.text), [
		'甲',
		'乙',
		'丙',
	]);
	const serialized = serializeSchedule(reparsed, plugin.slotLayout());
	check(
		'a written week reads back into what was written',
		serializeSchedule(parseSchedule(serialized, WS, PATH, plugin.slotLayout()), plugin.slotLayout()),
		serialized,
	);

	console.log('a file created externally while an empty board is open');
	const outsideVault = makeVault({});
	const outsideApp: any = { vault: outsideVault, workspace: makeWorkspace() };
	const outsidePlugin: any = new WeeklySchedulePlugin(outsideApp, {});
	await outsidePlugin.onload();
	const outsideLeaf: any = new WorkspaceLeaf(outsideApp);
	const outsideView: any = new WeeklyScheduleView(outsideLeaf, outsidePlugin);
	outsideLeaf.view = outsideView;
	outsideApp.workspace.leaves.set(VIEW_TYPE_WEEKLY_SCHEDULE, [outsideLeaf]);
	outsideView.weekStart = WS;
	outsideView.renderedWeekStart = WS;
	outsideView.schedule = await outsidePlugin.store.load(WS, PATH);
	outsideView.render = async () => {
		outsideView.schedule = await outsidePlugin.store.load(WS, PATH);
	};
	await outsideVault.create(PATH, initialRaw);
	const createListener = outsideVault.listeners.get('create');
	check('the plugin listens for file creation', typeof createListener, 'function');
	createListener?.(outsideVault.getFileByPath(PATH)!);
	await sleep(50);
	check('the board reloads the created file', outsideView.schedule.days[0].quadrants[0].tasks[0]?.text, '甲');
	await outsidePlugin.store.flushAll();
	check('the external file survives a flush', outsideVault.contents.get(PATH)?.includes('甲'), true);

	console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
	process.exit(failures === 0 ? 0 : 1);
}

void main();
