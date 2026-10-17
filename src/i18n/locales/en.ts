/**
 * English strings, and the source of truth for every user-facing string in the
 * plugin: `TranslationKey` is derived from this object, so a key that is not
 * here cannot be used, and a locale that misses one fails to compile.
 *
 * Two conventions:
 * - a value may split its singular and plural forms with `|`; `tp()` picks the
 *   form from a count;
 * - `{name}` placeholders are filled from the params passed to `t()` / `tp()`.
 */
export const en = {
	// Ribbon tooltips, commands and view titles.
	'command.openBoard': 'Open weekly board',
	'command.openYear': 'Open year overview',
	'command.moveWeeks': 'Move week files into year folders',
	'command.currentWeek': 'Go to the current week',
	'command.previousWeek': 'Go to the previous week',
	'command.nextWeek': 'Go to the next week',
	'command.carryOver': 'Bring unfinished tasks from the previous week into this week',
	'command.carryOverDay': "Bring yesterday's unfinished tasks into today",
	'view.board': 'Weekly schedule',
	'view.year': 'Weekly schedule: year',

	// Day headings, in board order.
	'day.mon': 'Monday',
	'day.tue': 'Tuesday',
	'day.wed': 'Wednesday',
	'day.thu': 'Thursday',
	'day.fri': 'Friday',
	'day.sat': 'Saturday',
	'day.sun': 'Sunday',
	'day.openCount': '{count} left',

	// Priority quadrants. The cell header and the file heading are both built
	// from the importance part and the urgency part, joined by " · ".
	'quadrant.important': 'Important',
	'quadrant.unimportant': 'Unimportant',
	'quadrant.urgent': 'urgent',
	'quadrant.notUrgent': 'not urgent',

	// The week's own review, written at the end of the week's file under a
	// heading of its own. Like the day and quadrant wording these are file
	// headings as much as labels: a section is written in the file's language
	// rather than the interface's, so saving never translates a week. The letters
	// P/D/C/A belong to the board alone — a heading is there to be read and
	// parsed, and spelling an acronym out in it would only be something else to
	// get wrong by hand.
	'review.title': 'Review',
	'review.plan': 'Plan',
	'review.do': 'Do',
	'review.check': 'Check',
	'review.act': 'Act',

	// Board toolbar and task rows.
	'board.previousWeek': 'Previous week',
	'board.nextWeek': 'Next week',
	'board.thisWeek': 'This week',
	'board.yearOverview': 'Year overview',
	'board.hideCompleted': 'Hide completed',
	'board.showCompleted': 'Show completed',
	'board.openNote': 'Open note',
	'board.addTask': 'Add a task',
	// The panel's own heading. The review is named by the file's wording; the
	// frame around it is the board's, so the acronym is spelled out here and
	// nowhere near the heading a week is written under.
	'board.reviewPanel': 'PDCA review',
	// Hints for a field that is empty. Drawn by CSS from a `data-placeholder`
	// attribute rather than written into the stylesheet, where the one for a
	// task used to sit: a hint is a string like any other, and a string in the
	// stylesheet is one no language switch can reach.
	'board.taskPlaceholder': 'Type a task…',
	// The four questions PDCA asks of a week. Each does two jobs: it is the label
	// of the row that adds a section's first item, and the hint on the item once
	// that row has become one. One string rather than two, because the moment
	// between them is a click — the row that asks the question is replaced by the
	// line the answer goes on, and a second wording would only be a second thing
	// to keep in step.
	'board.reviewQuestion.plan': 'What you set out to do',
	'board.reviewQuestion.do': 'What actually got done',
	'board.reviewQuestion.check': 'Where it fell short, and why',
	'board.reviewQuestion.act': 'What to change next week',
	// What the panel calls each step, which is the file's word plus — where the
	// two are not the same word — the one its letter stands for. `计划` beside a
	// `P` does not say why it is Plan, and the frame is the point of the panel;
	// in English the letter's word is the name already, so nothing is repeated
	// and this is the file's wording unchanged. Board wording either way, and so
	// never reached by the serializer: the heading a week is written under is
	// `计划`, and a reader's language has no business in a file.
	'board.reviewStep.plan': 'Plan',
	'board.reviewStep.do': 'Do',
	'board.reviewStep.check': 'Check',
	'board.reviewStep.act': 'Act',
	'board.moveUp': 'Move up',
	'board.moveDown': 'Move down',
	'board.delete': 'Delete',
	'board.weekLabel': 'Week {week} of {year} · {range}',

	// Week totals, in the strip below the board.
	'board.stats.tasks': '{count} task this week|{count} tasks this week',
	'board.stats.done': '{count} done',
	'board.stats.percent': '{percent}% complete',
	'board.stats.empty': 'No tasks this week yet',

	// Year overview.
	'year.previous': 'Previous year',
	'year.next': 'Next year',
	'year.thisYear': 'This year',
	'year.label': '{year}',
	'year.tile': 'Week {week}, {range}, {done} of {total} done',
	'year.noFinishedWeeks': 'No finished weeks with tasks yet',
	'year.weeksDone': '{count} week done|{count} weeks done',
	'year.tasksTotal': '{count} task|{count} tasks',
	'year.donePrefix': 'Done ',
	'year.doneSuffix': ' ({done}/{total})',

	// Settings tab.
	'settings.folder.name': 'Schedule folder',
	'settings.folder.desc':
		'Vault folder for the weekly files. The plugin writes one file per week, grouped in a folder per year. Example: weekly-schedule/2026/2026-W12.md',
	'settings.weekStart.name': 'Week starts on',
	'settings.weekStart.desc':
		'Which day the board starts with. Week numbers in file names are unaffected by this.',
	'settings.taskCommitKey.name': 'Enter key in a task',
	'settings.taskCommitKey.desc':
		'What Enter does while writing a task, which may run over several lines. Committing also opens the next task underneath; the other Enter starts a new line, and Cmd/Ctrl+Enter commits and stops. A line of the weekly review is written the same way.',
	'settings.taskCommitKey.enter': 'Enter commits and opens the next task',
	'settings.taskCommitKey.shiftEnter': 'Shift+Enter commits and opens the next task',
	'settings.openBoard.name': 'Open board',
	'settings.openBoard.desc':
		'Open the weekly board in a tab, or focus it when it is already open.',
	'settings.openBoard.button': 'Open board',
	'settings.openYear.name': 'Open year overview',
	'settings.openYear.desc': 'Pick a week from a whole year at once.',
	'settings.openYear.button': 'Open overview',
	'settings.yearFolders.name': 'Year folders',
	'settings.yearFolders.desc':
		'Move week files that sit directly in the schedule folder into a folder per year.',
	'settings.yearFolders.button': 'Move files',

	// The cells a day has. This is the one setting that decides what a week's
	// *file* looks like, so it says what a cell is and what happens to the work
	// in one when it is removed, and leaves the rest to the board.
	'settings.slots.name': 'The cells a day has',
	'settings.slots.desc':
		'A cell is the heading above a group of tasks in the week file. Name them, reorder them, add or remove them — a day holds between one and eight.',
	'settings.slots.newName': 'Cell {count}',
	'settings.slots.usingDefault': 'Called {name} until you name it yourself',
	'settings.slots.field': 'The name of cell {index}',
	'settings.slots.count': '{count} of the {max} cells a day can hold',
	'settings.slots.add': 'Add a cell',
	// One wording per code `validateSlots` can answer with, so a code that is
	// added without a sentence for it fails to compile rather than showing
	// nothing where an explanation should be.
	'settings.slots.error.limitMin': 'A day has to keep at least one cell.',
	'settings.slots.error.limitMax': 'A day holds at most {max} cells.',
	'settings.slots.error.duplicateId':
		'Two cells share an internal key, so one of them could never be reached.',
	'settings.slots.error.unknown': 'A cell has a colour the palette does not have.',
	'settings.slots.error.dangling':
		'A removed cell points at a cell that is neither here nor on file.',
	'settings.slots.error.cycle':
		'Two removed cells point at each other, so neither has anywhere to go.',
	'settings.slots.error.empty': 'A cell you added has no name yet, so there is nothing to call it.',
	'settings.slots.error.tooLong': 'A cell name is at most {nameMax} characters.',
	'settings.slots.error.invalid':
		'A cell name cannot hold # or a line break, or start with - > | or a number.',
	'settings.slots.error.reserved':
		"That name is already a day, a step of the review, or one of the plugin's own cells.",
	'settings.slots.error.duplicate':
		'Two cells have the same name, so a week could not tell them apart.',
	'settings.slots.merge.title': 'Move the work of {name} into another cell',
	'settings.slots.merge.desc':
		'Nothing is lost. The tasks stay in the weeks they are in and go on being read as the cell that takes them over, because the wording of a removed cell is kept on file for ever.',
	'settings.slots.merge.choice': 'Move it into',
	'settings.slots.merge.confirm': 'Remove the cell',
	'settings.slots.align.name': 'Weeks you have already written',
	'settings.slots.align.desc':
		'A week written before the cells changed goes on reading correctly, and its headings are the older wording. Renaming them makes the whole vault say one thing; it changes nothing about what a week holds.',
	'settings.slots.align.button': 'Bring them up to date',
	'settings.slots.align.title': 'Bring older weeks up to date?',
	'settings.slots.align.body':
		'The headings of {count} week file still use the older wording.|The headings of {count} week files still use the older wording.',
	'settings.slots.align.confirm': 'Bring them up to date',
	'settings.slots.align.later': 'Not now',
	// Shared by the two dialogs above; the carry-over dialog words its own.
	'common.cancel': 'Cancel',

	// Notices.
	'migrate.alreadyGrouped': 'Weekly schedule: every week file is already in a year folder.',
	'migrate.pendingFiles':
		'Weekly schedule: {count} file will move into {years}.|Weekly schedule: {count} files will move into {years}.',
	'migrate.movedFiles':
		'Weekly schedule: moved {count} file into {years}.|Weekly schedule: moved {count} files into {years}.',
	'migrate.result':
		'Weekly schedule: moved {count} file into year folders.|Weekly schedule: moved {count} files into year folders.',
	'migrate.resultPartial':
		'Weekly schedule: moved {moved}, failed {failed}. See the developer console.',
	// Bringing the headings of every week in the vault up to date with the cells
	// the user has now. A week is never unreadable without this — the wordings
	// it already uses go on resolving — so this is offered, not demanded.
	'migrate.slots.none': 'Weekly schedule: every week already names its cells the way you do.',
	'migrate.slots.changed':
		'Weekly schedule: renamed the cells in {count} week file.|Weekly schedule: renamed the cells in {count} week files.',
	'migrate.slots.partial':
		'Weekly schedule: aligned {files}, failed {failed}. See the developer console.',

	// Carrying the previous week's unfinished tasks into the week on screen. The
	// two counted strings differ only in whether anything was already there.
	'carry.none': 'Weekly schedule: nothing from the previous week needs bringing over.',
	'carry.result':
		'Weekly schedule: brought {count} task over from {from} into {to}.|Weekly schedule: brought {count} tasks over from {from} into {to}.',
	'carry.resultSkipped':
		'Weekly schedule: brought {count} task over from {from} into {to}, leaving {skipped} already there.|Weekly schedule: brought {count} tasks over from {from} into {to}, leaving {skipped} already there.',
	'carry.allThere':
		'Weekly schedule: the {count} task you picked is already in {to}; {from} has been marked.|Weekly schedule: all {count} tasks you picked are already in {to}; {from} has been marked.',
	'carry.failed':
		'Weekly schedule: nothing was brought over, as the week could not be written. See the developer console.',
	'carry.markFailed':
		'Weekly schedule: the tasks were brought over, but {from} could not be marked. See the developer console.',

	// The dialog that asks which of the previous week's tasks to bring over. The
	// mark is written into the previous week's file, next to the task it refers
	// to, so it names the week the task went to rather than saying "next week" —
	// a file read months later cannot tell which week that would have been.
	'carry.modalTitle': 'Bring unfinished tasks from {from} into {to}',
	'carry.modalDesc':
		'Pick the tasks to bring over. Each one keeps the day and the priority cell it was planned in.',
	'carry.alreadyThere': 'already in this week',
	'carry.modalNote':
		'{count} task is already in {to} and will not be added twice.|{count} tasks are already in {to} and will not be added twice.',
	'carry.confirm': 'Bring 1 task over|Bring {count} tasks over',
	'carry.cancel': 'Cancel',
	'carry.mark': ' (carried over to {week})',

	// Bringing one day's unfinished work into the next. Unlike the week above,
	// this moves the tasks: the day that is over keeps nothing, so nothing is
	// marked there either. `{from}` and `{to}` are the two days, e.g. `9/27`.
	'carry.dayCrossesWeek':
		'Weekly schedule: yesterday belongs to the previous week, and this moves work only inside one week — nothing was moved.',
	'carry.dayNone': 'Weekly schedule: yesterday left nothing unfinished.',
	'carry.dayAllThere':
		'Weekly schedule: the {count} task yesterday left is already in {to}.|Weekly schedule: all {count} tasks yesterday left are already in {to}.',
	'carry.dayResult':
		'Weekly schedule: moved {count} task from {from} into {to}.|Weekly schedule: moved {count} tasks from {from} into {to}.',
	'carry.dayResultSkipped':
		'Weekly schedule: moved {count} task from {from} into {to}, leaving {skipped} already there.|Weekly schedule: moved {count} tasks from {from} into {to}, leaving {skipped} already there.',
	'carry.dayFailed':
		'Weekly schedule: nothing was moved, as the day could not be written. See the developer console.',

	'list.separator': ', ',
};

export type TranslationKey = keyof typeof en;

/** Every locale has to provide every string. */
export type Translations = Record<TranslationKey, string>;
