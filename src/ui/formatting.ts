/**
 * The text transformations behind the formatting buttons. Pure and unit tested,
 * so the behaviour of Cmd+B is verified without driving the editor.
 *
 * These are implemented here rather than delegated to another extension because
 * bold and italic are two of the three shortcuts a new writer is taught. They
 * must work on the day of install, even if a companion extension is disabled.
 *
 * Questions about what part of a document is prose belong to
 * `../markdown/markdownText`, which is the one place allowed to answer them.
 */

import { isSetextUnderline } from "../markdown/markdownText"

/** Wraps text in a marker, or removes the marker if it is already there. */
export function toggleWrapped(text: string, marker: string): string {
	// Leading and trailing spaces are kept outside the markers, because
	// `** bold **` does not render as bold.
	const leading = /^\s*/.exec(text)?.[0] ?? ""
	const trailing = /\s*$/.exec(text)?.[0] ?? ""
	const core = text.slice(leading.length, text.length - trailing.length)

	if (core.length === 0) {
		return `${leading}${marker}${marker}${trailing}`
	}

	if (isWrapped(core, marker)) {
		return `${leading}${core.slice(marker.length, core.length - marker.length)}${trailing}`
	}
	return `${leading}${marker}${core}${marker}${trailing}`
}

/**
 * Whether `text` is already wrapped in `marker`, as one pair enclosing the whole
 * span.
 *
 * Runs of the same character are counted rather than matched literally, because
 * bold and italic share the asterisk. Asking for italic on `**bold**` must nest
 * to `***bold italic***` rather than stripping one asterisk from each side and
 * silently turning bold into italic.
 *
 * The enclosure check matters just as much: `*one* and *two*` opens and closes
 * with a marker without being wrapped in one, and treating it as wrapped would
 * corrupt a sentence containing two italic phrases into `one* and *two`.
 */
export function isWrapped(text: string, marker: string): boolean {
	const width = marker.length
	if (text.length < width * 2 + 1) {
		return false
	}

	const character = marker.charAt(0)
	const runAtStart = countRun(text, character, 0, 1)
	const runAtEnd = countRun(text, character, text.length - 1, -1)

	if (runAtStart < width || runAtEnd < width) {
		return false
	}

	// A single asterisk against an even run is bold, not italic: nest instead.
	if (width === 1 && runAtStart % 2 === 0 && runAtEnd % 2 === 0) {
		return false
	}

	const inner = text.slice(width, text.length - width)
	if (inner.length === 0) {
		return false
	}

	return innerMarkersAreEdgeOnly(inner, character)
}

/**
 * True when the text between the outer markers contains no further marker except
 * directly against the edges.
 *
 * Markers against the edges are nesting: the interior of `***word***` is
 * `**word**`, which is still one wrapped span. A marker in the middle means the
 * outer pair does not enclose the whole selection — `*one* and *two*` opens and
 * closes with a marker without being wrapped in one.
 *
 * Deliberately conservative: when this returns false the caller wraps instead of
 * unwrapping. Adding markers can be undone, whereas removing the wrong ones
 * deletes the writer's characters.
 */
function innerMarkersAreEdgeOnly(inner: string, character: string): boolean {
	let start = 0
	while (start < inner.length && inner.charAt(start) === character) {
		start++
	}
	let end = inner.length
	while (end > start && inner.charAt(end - 1) === character) {
		end--
	}
	return !inner.slice(start, end).includes(character)
}

function countRun(text: string, character: string, from: number, step: number): number {
	let count = 0
	for (let index = from; index >= 0 && index < text.length; index += step) {
		if (text.charAt(index) !== character) {
			break
		}
		count++
	}
	return count
}

/**
 * Adds a prefix to every line, or removes it from every line when all of them
 * already have it. Blank lines are left alone so a quotation does not grow
 * stray markers.
 */
export function toggleLinePrefix(lines: readonly string[], prefix: string): string[] {
	const meaningful = lines.filter((line) => line.trim().length > 0)
	const pattern = prefixPattern(prefix)
	const allPrefixed = meaningful.length > 0 && meaningful.every((line) => pattern.test(line))

	return lines.map((line) => {
		if (line.trim().length === 0) {
			return line
		}
		if (allPrefixed) {
			// `$1` keeps the line's own indentation.
			return line.replace(pattern, "$1")
		}
		const indent = /^\s*/.exec(line)?.[0] ?? ""
		return `${indent}${prefix}${line.slice(indent.length)}`
	})
}

/** Numbers the given lines from 1, or removes the numbering if present. */
export function toggleNumberedList(lines: readonly string[]): string[] {
	const meaningful = lines.filter((line) => line.trim().length > 0)
	const numbered = /^(\s*)\d+[.)]\s+/
	const allNumbered = meaningful.length > 0 && meaningful.every((line) => numbered.test(line))

	if (allNumbered) {
		return lines.map((line) => (line.trim().length === 0 ? line : line.replace(numbered, "$1")))
	}

	let counter = 0
	return lines.map((line) => {
		if (line.trim().length === 0) {
			return line
		}
		counter++
		const indent = /^\s*/.exec(line)?.[0] ?? ""
		const body = line.slice(indent.length).replace(/^[-*+]\s+/, "")
		return `${indent}${counter}. ${body}`
	})
}

/**
 * Makes a line a heading of the given level. Passing the level it already has
 * turns the heading back into ordinary text, so the button toggles.
 */
export function setHeadingLevel(line: string, level: number): string {
	const indent = /^\s*/.exec(line)?.[0] ?? ""
	// Existing block markers are removed, so turning a bullet into a heading does
	// not leave `# - Item` with the dash still in the heading text.
	const body = line
		.slice(indent.length)
		.replace(/^#{1,6}\s*/, "")
		.replace(/^>[ \t]*/, "")
		.replace(/^[-*+][ \t]+/, "")
		.replace(/^\d+[.)][ \t]+/, "")
	const current = currentHeadingLevel(line)

	if (current === level) {
		return `${indent}${body}`
	}
	const safeLevel = Math.min(Math.max(Math.trunc(level), 1), 6)
	return `${indent}${"#".repeat(safeLevel)} ${body}`
}

export function currentHeadingLevel(line: string): number | undefined {
	const match = /^\s*(#{1,6})\s/.exec(line)
	return match ? match[1].length : undefined
}

/**
 * Applies a heading level across a block of lines.
 *
 * Needed as well as `setHeadingLevel` because a heading can be written as an
 * underline:
 *
 *     A quiet morning
 *     ===============
 *
 * Making that first line a heading one line at a time left the `===` behind as a
 * paragraph of its own, so the writer saw a row of equals signs appear under
 * their new heading. The underline belonged to the heading, so it goes with it.
 */
export function setHeadingLevelForLines(lines: readonly string[], level: number): string[] {
	const out: string[] = []

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]
		if (line.trim().length === 0) {
			out.push(line)
			continue
		}

		out.push(setHeadingLevel(line, level))

		// An underline directly beneath a line that has just become a heading is
		// now spare punctuation, not part of the writer's words.
		if (underlines(line, lines[index + 1])) {
			index++
		}
	}

	return out
}

/**
 * Whether `next` underlines `line`, making the two one heading.
 *
 * The line above has to be something an underline can attach to. A row of dashes
 * under an existing `# Heading`, under a list item, or under a quotation is a
 * horizontal rule or a settings-block delimiter, not an underline — and deleting
 * one of those takes away a piece of the writer's document that they never
 * pointed at.
 */
export function underlines(line: string, next: string | undefined): boolean {
	if (!isSetextUnderline(next)) {
		return false
	}
	const body = line.trimStart()
	if (body.length === 0) {
		return false
	}
	// A heading, a quotation, a bullet, a numbered item, or a fence is not a
	// paragraph, so nothing below it is its underline.
	return !/^(#{1,6}[ \t]|>|[-*+][ \t]|\d+[.)][ \t]|```|~~~)/.test(body) && !isSetextUnderline(body)
}

/** Builds the Markdown for a link, using the address as the words if need be. */
export function buildLink(text: string, url: string): string {
	const words = text.trim()
	const address = url.trim()
	return `[${words.length > 0 ? words : address}](${address})`
}

/** Adds a scheme to something the writer typed without one. */
export function normaliseUrl(url: string): string {
	const trimmed = url.trim()
	if (trimmed.length === 0) {
		return trimmed
	}
	if (/^(https?:|mailto:|tel:|#|\/|\.)/i.test(trimmed)) {
		return trimmed
	}
	if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
		return `mailto:${trimmed}`
	}
	return `https://${trimmed}`
}

/** An empty table a writer can tab through. */
export function buildTable(columns: number, rows: number): string {
	const safeColumns = Math.min(Math.max(Math.trunc(columns), 1), 10)
	const safeRows = Math.min(Math.max(Math.trunc(rows), 1), 50)

	const header = `| ${Array.from({ length: safeColumns }, (_, index) => `Column ${index + 1}`).join(" | ")} |`
	const divider = `| ${Array.from({ length: safeColumns }, () => "---").join(" | ")} |`
	const body = Array.from(
		{ length: safeRows },
		() => `| ${Array.from({ length: safeColumns }, () => "   ").join(" | ")} |`,
	)

	return [header, divider, ...body].join("\n")
}

/**
 * Matches a line that already carries `prefix`.
 *
 * The whitespace after the marker is required, not optional. Without it, prose
 * such as `>50% of readers` or `-5 degrees at dawn` counts as already quoted or
 * bulleted, so pressing the button deletes the writer's first character instead
 * of adding a prefix. A marker at the end of an otherwise empty line still
 * counts, so toggling an empty bullet off works.
 */
function prefixPattern(prefix: string): RegExp {
	const escaped = prefix.trimEnd().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
	return new RegExp(`^(\\s*)${escaped}(?:[ \\t]+|$)`)
}
