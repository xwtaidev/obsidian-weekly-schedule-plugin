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

	// Board toolbar and task rows.
	'board.previousWeek': 'Previous week',
	'board.nextWeek': 'Next week',
	'board.thisWeek': 'This week',
	'board.yearOverview': 'Year overview',
	'board.hideCompleted': 'Hide completed',
	'board.showCompleted': 'Show completed',
	'board.openNote': 'Open note',
	'board.addTask': 'Add a task',
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
