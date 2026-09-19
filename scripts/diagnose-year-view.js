/*
 * Weekly Schedule — year view diagnostic.
 *
 * Why: the year overview can render as small content-height stamps in Obsidian
 * while every off-Obsidian check passes. A plugin cannot detect which stylesheet
 * it was served, so this prints what the running app actually computed.
 *
 * How to run:
 *   1. Open the year overview view.
 *   2. Cmd+Option+I (Ctrl+Shift+I on Windows) to open Developer tools.
 *   3. Paste this whole file into the Console and press Enter.
 *   4. Copy the printed report back.
 */
(() => {
	const view = document.querySelector('.weekly-schedule-year-container');
	if (!view) {
		console.log('year view not found — is it open in the active tab?');
		return;
	}

	// Which rule actually decides the tile's box? First match wins in Chrome's
	// getMatchedCSSRules-like ordering, so this names the culprit directly.
	const describe = (el, props) => {
		const s = getComputedStyle(el);
		const out = {};
		for (const p of props) out[p] = s[p];
		return out;
	};

	const grid = view.querySelector('.weekly-schedule-year-grid');
	const tile = grid && grid.querySelector('.weekly-schedule-year-tile');

	const report = {
		marker: {
			styleSheetsLoaded: [...document.styleSheets].length,
			// The current stylesheet defines these; an older one does not.
			hasHeatRamp: [...document.styleSheets].some((sheet) => {
				try {
					return [...sheet.cssRules].some((r) => r.cssText && r.cssText.includes('--ws-heat-0'));
				} catch {
					return false;
				}
			}),
			hasAspectRatioRule: [...document.styleSheets].some((sheet) => {
				try {
					return [...sheet.cssRules].some((r) => r.selectorText === '.weekly-schedule-year-tile' && r.style && r.style.aspectRatio);
				} catch {
					return false;
				}
			}),
		},
		container: view.clientWidth,
		containerHeight: view.clientHeight,
		columnVar: getComputedStyle(view).getPropertyValue('--ws-year-columns').trim(),
		columnVarInline: view.style.getPropertyValue('--ws-year-columns'),
		grid: grid ? describe(grid, ['display', 'gridTemplateColumns', 'gap', 'width', 'paddingTop']) : 'NO GRID ELEMENT',
		tile: tile ? describe(tile, ['display', 'width', 'height', 'justifySelf', 'alignSelf', 'aspectRatio', 'flexDirection', 'containerType', 'paddingTop']) : 'NO TILE ELEMENT',
		tileBox: tile ? (() => { const r = tile.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })() : null,
		// The measurement that matters: is the tile filling its grid track?
		firstThreeTiles: grid
			? [...grid.querySelectorAll('.weekly-schedule-year-tile')].slice(0, 3).map((t) => {
				const r = t.getBoundingClientRect();
				return { left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
			})
			: null,
		ancestorOverflow: (() => {
			const out = [];
			let el = tile && tile.parentElement;
			while (el && el !== document.body) {
				const s = getComputedStyle(el);
				if (s.display === 'flex' || s.display === 'grid') {
					out.push(`${el.className || el.tagName}: display=${s.display} alignItems=${s.alignItems} justifyItems=${s.justifyItems} width=${Math.round(el.getBoundingClientRect().width)}`);
				}
				el = el.parentElement;
			}
			return out.slice(0, 6);
		})(),
	};

	console.log('=== Weekly Schedule year view diagnostic ===');
	console.log(JSON.stringify(report, null, 2));
	console.log('=== end ===');
})();
