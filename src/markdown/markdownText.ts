/**
 * The single source of truth for "what part of this file is prose".
 *
 * Both the word counter and the sidebar title extractor used to carry their own
 * copy of this logic, which meant a document could be titled one way and counted
 * another. Everything that needs to see through Markdown markup imports from
 * here so those two answers can never disagree.
 *
 * Pure: no VS Code imports, fully unit tested.
 */

/** Removes a leading YAML block so it is never treated as content. */
export function stripFrontMatter(content: string): string {
	const match = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(content)
	return match ? content.slice(match[0].length) : content
}

/**
 * Removes inline Markdown markup from a single line, keeping the words a reader
 * would actually read.
 *
 * `keepImageAltText` differs by caller: a title is better off using an image's
 * alt text than being empty, while a word count must not count it, because the
 * alt text is not part of the prose.
 */
export function stripInlineMarkup(text: string, options: { keepImageAltText: boolean }): string {
	let result = text

	// Images before links, so a linked image is not processed twice.
	result = result.replace(/!\[([^\]]*)\]\([^)]*\)/g, options.keepImageAltText ? "$1" : " ")
	result = result.replace(/!\[([^\]]*)\]\[[^\]]*\]/g, options.keepImageAltText ? "$1" : " ")
	// Links keep their visible words and lose the address.
	result = result.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
	result = result.replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
	// Autolinks and bare addresses are not words.
	result = result.replace(/<https?:\/\/[^>\s]+>/g, " ")
	result = result.replace(/\bhttps?:\/\/\S+/g, " ")
	// HTML comments and tags.
	result = result.replace(/<!--[\s\S]*?-->/g, " ")
	result = result.replace(/<\/?[a-zA-Z][^>]*>/g, " ")
	// Inline code keeps its contents: `word` is still a word to a reader.
	result = result.replace(/`+/g, "")
	// Emphasis, longest marker first.
	result = result.replace(/(\*\*\*|___)(.*?)\1/g, "$2")
	result = result.replace(/(\*\*|__)(.*?)\1/g, "$2")
	result = result.replace(/(\*|_)(.*?)\1/g, "$2")
	result = result.replace(/~~(.*?)~~/g, "$1")

	return result
}

/** Removes the markers that introduce a block: heading, quote, or list item. */
export function stripBlockPrefix(line: string): string {
	return line
		.replace(/^[ \t]*#{1,6}[ \t]+/, "")
		.replace(/^[ \t]*>[ \t]?/, "")
		.replace(/^[ \t]*[-*+][ \t]+/, "")
		.replace(/^[ \t]*\d+[.)][ \t]+/, "")
}

/** True for a `---`, `***`, `___` rule or a `===`/`---` heading underline. */
export function isRuleLine(line: string): boolean {
	return /^[ \t]*([-*_=])([ \t]*\1){2,}[ \t]*$/.test(line)
}

/**
 * True for the `===` or `---` a writer may have used to underline a heading:
 *
 *     A quiet morning
 *     ===============
 *
 * Lives here rather than beside the formatting helpers because this is the one
 * file allowed to decide what part of a document is prose, and two answers to
 * that question is the drift this module exists to prevent.
 *
 * Deliberately narrower than `isRuleLine` in one direction and wider in another,
 * because they answer different questions. Only `=` and `-` can underline a
 * heading, so `***` is a rule and never an underline. Two characters are enough
 * to underline, while a rule needs three, so `==` is an underline and not a rule.
 * A single character is refused: a lone `-` is an empty list item far more often
 * than it is an underline, and guessing wrong deletes a line.
 *
 * Whether the line above is something an underline can attach to is the caller's
 * business: a `---` under a heading is a rule, not an underline.
 */
export function isSetextUnderline(line: string | undefined): boolean {
	return line !== undefined && /^[ \t]*(={2,}|-{2,})[ \t]*$/.test(line)
}

/**
 * Which line closes the settings block at the top of a piece, if there is one.
 *
 * Needed because the closing `---` of a settings block is indistinguishable from
 * a heading underline when you can only see two lines: `summary:` above a row of
 * dashes looks exactly like an underlined heading. Only somebody holding the top
 * of the document can tell, so that question is answered here.
 *
 * Takes the first lines rather than the whole document, since a settings block is
 * always at the very top and reading a book to find it would be absurd. Returns
 * undefined when the piece does not open with one, or when it opens with an
 * unterminated one.
 */
export function frontMatterEndLine(topLines: readonly string[]): number | undefined {
	if (topLines.length < 2 || topLines[0].trim() !== "---") {
		return undefined
	}
	for (let line = 1; line < topLines.length; line++) {
		if (topLines[line].trim() === "---") {
			return line
		}
	}
	return undefined
}

/** True for the `| --- | --- |` divider row of a table. */
export function isTableDividerLine(line: string): boolean {
	return /^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/.test(line)
}

/**
 * Removes fenced code blocks by walking lines, because a regular expression
 * cannot reliably tell an unclosed fence from an early end of line.
 *
 * A fence is closed only by the same character, at least as long, with nothing
 * after it. An unclosed fence swallows the rest of the document, which is what a
 * Markdown reader does too.
 */
export function stripFencedBlocks(text: string): string {
	const lines = text.split("\n")
	const kept: string[] = []
	let fence: string | undefined

	for (const line of lines) {
		const match = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(line)

		if (fence === undefined) {
			if (match) {
				fence = match[1]
				// Keep a blank line so paragraphs either side stay separate.
				kept.push("")
			} else {
				kept.push(line)
			}
			continue
		}

		const closes =
			match !== null && match[1][0] === fence[0] && match[1].length >= fence.length && match[2].trim() === ""
		if (closes) {
			fence = undefined
		}
	}

	return kept.join("\n")
}
