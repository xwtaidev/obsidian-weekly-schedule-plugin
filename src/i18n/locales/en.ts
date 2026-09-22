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
	'list.separator': ', ',
};

export type TranslationKey = keyof typeof en;

/** Every locale has to provide every string. */
export type Translations = Record<TranslationKey, string>;
