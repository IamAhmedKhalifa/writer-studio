/**
 * Prose statistics. Pure functions with no VS Code imports, unit tested.
 *
 * A writer's word count must match what an editor or a publisher would count,
 * so the following are excluded: the YAML block at the top of a file, fenced
 * code blocks, the address part of a link, image markup, and HTML tags.
 *
 * The rules for seeing through Markdown live in `../markdown/markdownText`, so
 * the count and the sidebar title always agree about what is markup.
 */

import {
	isRuleLine,
	isTableDividerLine,
	stripBlockPrefix,
	stripFencedBlocks,
	stripFrontMatter,
	stripInlineMarkup,
} from "../markdown/markdownText"

export interface ProseStats {
	words: number
	characters: number
	charactersNoSpaces: number
	paragraphs: number
}

/**
 * Extracts the countable prose from a Markdown document.
 *
 * One pass over the lines, rather than twenty passes over the whole string, so
 * this stays affordable on the typing path for a book-length document.
 */
function toProse(markdown: string): string {
	const text = stripFencedBlocks(stripFrontMatter(markdown.replace(/\r\n/g, "\n")))
	const out: string[] = []

	for (const line of text.split("\n")) {
		// Reference definitions are instructions, not prose.
		if (/^[ \t]*\[[^\]]+\]:/.test(line)) {
			out.push("")
			continue
		}
		if (isRuleLine(line) || isTableDividerLine(line)) {
			out.push("")
			continue
		}

		// Table pipes are structure; the cell contents are prose.
		const withoutPipes = line.includes("|") ? line.replace(/\|/g, " ") : line
		out.push(stripInlineMarkup(stripBlockPrefix(withoutPipes), { keepImageAltText: false }))
	}

	return out.join("\n")
}

export function countWords(markdown: string): number {
	return countMatches(toProse(markdown))
}

export function computeStats(markdown: string): ProseStats {
	const prose = toProse(markdown)
	// Characters are counted on the prose, matching what a reader sees rather
	// than the raw file size.
	const trimmed = prose.replace(/\s+/g, " ").trim()

	return {
		words: countMatches(prose),
		characters: trimmed.length,
		charactersNoSpaces: trimmed.replace(/\s/g, "").length,
		paragraphs: countParagraphs(prose),
	}
}

export function readingMinutes(words: number, wordsPerMinute: number): number {
	if (words === 0) {
		return 0
	}
	const safeRate = wordsPerMinute > 0 ? wordsPerMinute : 200
	return Math.max(1, Math.round(words / safeRate))
}

/**
 * A word must contain at least one letter or digit, so stray punctuation and
 * lone emphasis markers are not counted. Hyphenated and apostrophised words
 * count once, which is how publishers count them.
 */
const WORD_PATTERN = /[\p{L}\p{N}]+(?:[’'\u2011-]?[\p{L}\p{N}]+)*/gu

/**
 * Counts words without building an array of them. The status bar recounts on the
 * typing path, and materialising 50,000 substrings only to read `.length` was
 * the single largest allocation in that path.
 */
function countMatches(prose: string): number {
	WORD_PATTERN.lastIndex = 0
	let count = 0
	while (WORD_PATTERN.exec(prose) !== null) {
		count++
	}
	return count
}

function countParagraphs(prose: string): number {
	return prose
		.split(/\n[ \t]*\n+/)
		.map((block) => block.trim())
		.filter((block) => /[\p{L}\p{N}]/u.test(block)).length
}

/** Removes Markdown markers so text can be pasted somewhere plain. */
export function toPlainText(markdown: string): string {
	return toProse(markdown)
		.split("\n")
		.map((line) => line.replace(/[ \t]+$/, ""))
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim()
}
