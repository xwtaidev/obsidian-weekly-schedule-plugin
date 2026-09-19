/*
 * Weekly Schedule — which CSS rules actually match a year tile?
 *
 * Why: the grid resolves correctly (130.8px tracks) but a tile computes to
 * 30x30 and sits centred in its track, so some rule is setting a width or a
 * non-stretch alignment on the tile itself. This lists every matching rule.
 *
 * How to run: open the year overview, Cmd+Option+I, paste this into the Console.
 */
(() => {
	const tile = document.querySelector('.weekly-schedule-year-tile');
	if (!tile) {
		console.log('no year tile found — open the year overview first');
		return;
	}

	const INTERESTING = [
		'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
		'aspect-ratio', 'display', 'justify-self', 'align-self', 'flex', 'flex-grow',
		'flex-shrink', 'flex-basis', 'justify-content', 'align-items', 'box-sizing',
		'container-type', 'contain', 'position', 'grid-column', 'grid-row', 'margin',
	];

	const rows = [];
	for (const sheet of document.styleSheets) {
		let rules;
		try {
			rules = sheet.cssRules;
		} catch {
			rows.push({ sheet: sheet.href || '(inline, unreadable)', rule: 'CROSS-ORIGIN, skipped' });
			continue;
		}
		for (const rule of rules) {
			// Container queries and media queries nest their contents.
			const nested = rule.cssRules && rule.conditionText !== undefined && !rule.selectorText
				? [...rule.cssRules].map((inner) => ({ prefix: `${rule.conditionText} `, inner }))
				: [{ prefix: '', inner: rule }];
			for (const { prefix, inner } of nested) {
				if (!inner.selectorText) continue;
				let matches = false;
				try {
					matches = tile.matches(inner.selectorText);
				} catch {
					continue;
				}
				if (!matches) continue;
				const declarations = INTERESTING
					.filter((prop) => inner.style.getPropertyValue(prop) !== '')
					.map((prop) => `${prop}: ${inner.style.getPropertyValue(prop)}`);
				if (declarations.length === 0) continue;
				rows.push({ rule: prefix + inner.selectorText, declarations });
			}
		}
	}

	console.log('=== rules matching .weekly-schedule-year-tile ===');
	for (const row of rows) {
		if (typeof row.declarations === 'string') {
			console.log(`  ${row.rule}`);
			continue;
		}
		console.log(`\n  ${row.rule}`);
		for (const d of row.declarations) console.log(`      ${d}`);
	}

	// Also report the element's own inline style and its parent chain's widths.
	const chain = [];
	let el = tile;
	while (el && el !== document.body) {
		const s = getComputedStyle(el);
		chain.push({
			el: (el.className || el.tagName).toString().slice(0, 60),
			width: Math.round(el.getBoundingClientRect().width),
			display: s.display,
			flex: s.flex,
			alignSelf: s.alignSelf,
		});
		el = el.parentElement;
	}
	console.log('\n=== width chain from the tile upward ===');
	console.log(JSON.stringify(chain, null, 2));
	console.log('\n=== end ===');
})();
