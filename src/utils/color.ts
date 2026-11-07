/**
 * The one shape a colour is allowed to have in the settings file.
 *
 * A cell's colour reaches a stylesheet, so what is accepted here is deliberately
 * narrow: six hex digits and nothing else. That is not a limitation of the
 * feature — the colour picker always hands over exactly this — it is what keeps
 * a hand-edited or half-written `data.json` from putting an arbitrary string
 * where a custom property is expected, where a value that does not parse fails
 * *silently* and leaves the cell painted in the inherited text colour.
 *
 * Three-digit shorthand and a missing `#` are accepted because a human typing a
 * colour into a settings file means the same thing by them, and only the
 * long form is ever written back.
 */
export function normalizeColor(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	const text = value.trim().toLowerCase();
	const hex = text.startsWith('#') ? text.slice(1) : text;

	if (/^[0-9a-f]{3}$/.test(hex)) {
		const [r, g, b] = hex;
		return `#${r}${r}${g}${g}${b}${b}`;
	}
	if (/^[0-9a-f]{6}$/.test(hex)) {
		return `#${hex}`;
	}
	return null;
}
