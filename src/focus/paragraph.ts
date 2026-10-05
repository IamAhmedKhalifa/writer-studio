/**
 * Paragraph detection for focus mode. Pure and unit tested, because getting this
 * wrong makes the whole document fade and looks like a fault.
 */

export interface ParagraphRange {
	readonly startLine: number
	readonly endLine: number
}

/** Reads one line of the document, or undefined past either end. */
export type LineReader = (line: number) => string | undefined

/**
 * Finds the block of non-blank lines containing `line`.
 *
 * Takes a reader rather than an array of lines so the caller does not have to
 * copy an entire document to find a paragraph that is usually three lines long.
 * This runs on every cursor movement.
 *
 * Returns undefined when the cursor sits on a blank line: there is no paragraph
 * to keep sharp, and fading everything would look broken rather than focused.
 */
export function findParagraph(read: LineReader, line: number, lineCount: number): ParagraphRange | undefined {
	if (line < 0 || line >= lineCount) {
		return undefined
	}
	if (isBlank(read(line))) {
		return undefined
	}

	let startLine = line
	while (startLine > 0 && !isBlank(read(startLine - 1))) {
		startLine--
	}

	let endLine = line
	while (endLine < lineCount - 1 && !isBlank(read(endLine + 1))) {
		endLine++
	}

	return { startLine, endLine }
}

/** Convenience wrapper for callers that already hold every line, such as tests. */
export function findParagraphInLines(lines: readonly string[], line: number): ParagraphRange | undefined {
	return findParagraph((index) => lines[index], line, lines.length)
}

function isBlank(line: string | undefined): boolean {
	return line === undefined || line.trim().length === 0
}
