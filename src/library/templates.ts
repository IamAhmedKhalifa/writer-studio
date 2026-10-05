/**
 * Filling in a starter template. Pure, so it is unit tested directly.
 */

const PLACEHOLDER_GLOBAL = /\{\{\s*title\s*\}\}/gi
const PLACEHOLDER_TEST = /\{\{\s*title\s*\}\}/i

/**
 * Fills a template in, whether or not the writer gave their piece a name.
 *
 * A blank name used to skip substitution entirely, so the new piece opened with
 * the literal text `{{title}}` in it — and a blank name is exactly what the New
 * Draft prompt invites. With no title the placeholder is removed, along with the
 * heading or front-matter line that existed only to hold it.
 *
 * Lines without a placeholder are never touched, so a template's deliberately
 * empty field such as `date:` survives.
 */
export function fillTemplate(template: string, title: string | undefined): string {
	if (title) {
		return template.replace(PLACEHOLDER_GLOBAL, title)
	}

	const kept: string[] = []
	for (const line of template.split("\n")) {
		if (!PLACEHOLDER_TEST.test(line)) {
			kept.push(line)
			continue
		}

		const remainder = line.replace(PLACEHOLDER_GLOBAL, "").trimEnd()
		const heldOnlyTheTitle =
			remainder.trim().length === 0 ||
			/^\s*#{1,6}\s*$/.test(remainder) ||
			/^\s*[a-zA-Z_-]+:\s*$/.test(remainder)
		if (heldOnlyTheTitle) {
			continue
		}
		kept.push(remainder)
	}

	return kept.join("\n")
}
