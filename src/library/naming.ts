/**
 * Pure helpers for naming and titling documents. No VS Code imports, so these
 * are unit tested directly.
 */

import {
	isRuleLine,
	isSetextUnderline,
	stripBlockPrefix,
	stripFrontMatter,
	stripInlineMarkup,
} from "../markdown/markdownText"

const MAX_SLUG_LENGTH = 60
const MAX_TITLE_LENGTH = 120

/** `2026-09-18` in the writer's own local time, not UTC. */
export function formatDatePrefix(date: Date): string {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	return `${year}-${month}-${day}`
}

/** Turns a human title into a safe, readable file name fragment. */
export function slugify(title: string): string {
	const slug = title
		.normalize("NFKD")
		// Strip combining accents so "Café" becomes "cafe" rather than "caf".
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
	return slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, "")
}

/** `2026-09-18-a-quiet-morning.md` */
export function draftFileName(title: string, date: Date): string {
	const slug = slugify(title)
	return `${formatDatePrefix(date)}-${slug || "untitled"}.md`
}

/**
 * Rejects names that would break on any supported operating system, or that
 * would escape the writer's library.
 */
export function isValidTitle(title: string): boolean {
	const trimmed = title.trim()
	if (trimmed.length === 0 || trimmed.length > MAX_TITLE_LENGTH) {
		return false
	}
	if (trimmed === "." || trimmed === "..") {
		return false
	}
	// Path separators, Windows-reserved characters, and control characters.
	// eslint-disable-next-line no-control-regex
	if (/[\\/:*?"<>|\u0000-\u001f]/.test(trimmed)) {
		return false
	}
	// Windows reserved device names, with or without an extension.
	if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(trimmed)) {
		return false
	}
	return true
}

/**
 * Returns `candidate` if free, otherwise `name-2.md`, `name-3.md`, and so on.
 * Comparison is case-insensitive because macOS and Windows file systems are.
 */
export function uniqueFileName(candidate: string, existing: readonly string[]): string {
	const taken = new Set(existing.map((name) => name.toLowerCase()))
	if (!taken.has(candidate.toLowerCase())) {
		return candidate
	}

	const extensionAt = candidate.lastIndexOf(".")
	const stem = extensionAt > 0 ? candidate.slice(0, extensionAt) : candidate
	const extension = extensionAt > 0 ? candidate.slice(extensionAt) : ""

	for (let suffix = 2; suffix < 1000; suffix++) {
		const attempt = `${stem}-${suffix}${extension}`
		if (!taken.has(attempt.toLowerCase())) {
			return attempt
		}
	}
	return `${stem}-${Date.now()}${extension}`
}

/**
 * Where a piece's displayed title comes from.
 *
 * `kind` is what makes renaming safe. A heading can be rewritten; the opening
 * sentence of somebody's essay cannot, so the rename path has to be able to tell
 * the two apart rather than guessing from the text alone.
 */
export type TitleSource =
	| { kind: "heading"; lineIndex: number; indent: string; hashes: string; title: string }
	| { kind: "setext"; lineIndex: number; indent: string; title: string }
	| { kind: "prose"; lineIndex: number; title: string }

/**
 * Finds the one line a piece is titled by.
 *
 * Both the sidebar title and the rename that rewrites it come from here. They
 * used to be two separate scans with two copies of the heading rule, and they
 * disagreed: a heading holding only an image or only a web address is not a
 * usable title, so the sidebar skipped past it to the next one while the rename
 * overwrote it — destroying the picture and leaving the old title on screen.
 * One scan, one answer, and that cannot happen.
 *
 * Front matter is skipped so `title:` lines are not mistaken for content, and
 * fenced blocks are skipped so a `# comment` inside one is never used. A heading
 * anywhere in the piece beats the opening sentence, which is only a fallback.
 */
export function findTitleSource(content: string): TitleSource | undefined {
	const lines = content.split(/\r?\n/)
	let inFence = false
	let fallback: TitleSource | undefined

	for (let index = frontMatterLineCount(content); index < lines.length; index++) {
		const raw = lines[index]
		const line = raw.trim()

		if (/^(```|~~~)/.test(line)) {
			inFence = !inFence
			continue
		}
		if (inFence || line.length === 0) {
			continue
		}
		// A rule or an unterminated front-matter delimiter is not a title.
		if (isRuleLine(line)) {
			continue
		}

		const heading = /^(#{1,6})[ \t]+(.+?)[ \t]*#*$/.exec(line)
		if (heading) {
			const title = clean(heading[2])
			// A heading that reduces to nothing — one holding only a picture, a
			// web address, or a note to self — is not a title. Keep looking.
			if (title) {
				return {
					kind: "heading",
					lineIndex: index,
					indent: indentOf(raw),
					hashes: heading[1],
					title,
				}
			}
			continue
		}

		if (fallback === undefined) {
			const title = clean(stripBlockPrefix(line))
			if (title) {
				// An underlined line is a heading written the other way round, and
				// may be rewritten like one.
				fallback = isSetextUnderline(lines[index + 1])
					? { kind: "setext", lineIndex: index, indent: indentOf(raw), title }
					: { kind: "prose", lineIndex: index, title }
			}
		}
	}

	return fallback
}

/**
 * The title shown in the sidebar, falling back to a tidied-up version of the
 * file name when the piece says nothing about itself.
 */
export function extractTitle(content: string): string | undefined {
	const source = findTitleSource(content)
	return source ? truncate(source.title, MAX_TITLE_LENGTH) : undefined
}

/**
 * The rewritten title line for a piece that has just been renamed, or undefined
 * when there is nothing safe to rewrite.
 *
 * The sidebar titles every piece by its own heading, so renaming the file alone
 * left the old name on screen and made Rename look like it had done nothing.
 * This rewrites the very line `extractTitle` reads, keeping the writer's own
 * indentation, heading size, and choice of heading style.
 *
 * A piece titled by its opening sentence is deliberately left alone. Rewriting
 * somebody's first sentence because they renamed a file would be a far worse bug
 * than a stale label, so that case returns undefined and the sidebar goes on
 * showing the sentence.
 */
export function retitleHeading(content: string, newTitle: string): { lineIndex: number; text: string } | undefined {
	// Collapsed rather than trimmed: this string is written straight into the
	// writer's document, and a title carrying a line break would split the
	// heading in two.
	const title = newTitle.replace(/\s+/g, " ").trim()
	if (!title) {
		return undefined
	}

	const source = findTitleSource(content)
	if (!source) {
		return undefined
	}

	if (source.kind === "heading") {
		return { lineIndex: source.lineIndex, text: `${source.indent}${source.hashes} ${title}` }
	}
	if (source.kind === "setext") {
		// The underline below is left exactly as it is: it is the writer's chosen
		// heading style, and its length has never mattered to Markdown.
		return { lineIndex: source.lineIndex, text: `${source.indent}${title}` }
	}
	return undefined
}

/**
 * A whole document with its title line rewritten, or undefined when there is
 * nothing to change.
 *
 * Works on offsets rather than splitting and rejoining, so a file written with
 * Windows line endings keeps every one of them. Rewriting a document by joining
 * split lines would quietly convert the whole file, which is a rude thing to do
 * to somebody's writing over a rename.
 */
export function rewriteTitleLine(content: string, newTitle: string): string | undefined {
	const heading = retitleHeading(content, newTitle)
	if (!heading) {
		return undefined
	}

	const bounds = lineBounds(content, heading.lineIndex)
	if (!bounds || content.slice(bounds.start, bounds.end) === heading.text) {
		return undefined
	}
	return content.slice(0, bounds.start) + heading.text + content.slice(bounds.end)
}

/** The character range of one line, not counting whatever ends it. */
function lineBounds(content: string, lineIndex: number): { start: number; end: number } | undefined {
	let start = 0
	for (let line = 0; line < lineIndex; line++) {
		const next = content.indexOf("\n", start)
		if (next < 0) {
			return undefined
		}
		start = next + 1
	}

	let end = content.indexOf("\n", start)
	if (end < 0) {
		end = content.length
	} else if (end > start && content.charAt(end - 1) === "\r") {
		end -= 1
	}
	return { start, end }
}

/** How many lines a leading YAML block occupies, so line numbers stay true. */
function frontMatterLineCount(content: string): number {
	const withoutFrontMatter = stripFrontMatter(content)
	if (withoutFrontMatter === content) {
		return 0
	}
	const removed = content.slice(0, content.length - withoutFrontMatter.length)
	return removed.split(/\r?\n/).length - 1
}

/**
 * Everything at the start of the line that `trim` would remove.
 *
 * Whitespace rather than spaces and tabs specifically, so that a byte order mark
 * at the very top of a file is carried across to the rewritten line instead of
 * being quietly dropped and changing how the file is read.
 */
function indentOf(line: string): string {
	return line.slice(0, line.length - line.trimStart().length)
}

/** `2026-09-18-a-quiet-morning.md` becomes `A quiet morning`. */
export function displayTitleFromFileName(fileName: string): string {
	const withoutExtension = fileName.replace(/\.(md|markdown|txt)$/i, "")
	const withoutDate = withoutExtension.replace(/^\d{4}-\d{2}-\d{2}-?/, "")
	// A file named only with a date has no title to tidy up: show the date.
	if (!withoutDate.trim()) {
		return withoutExtension
	}
	const words = withoutDate.replace(/[-_]+/g, " ").trim()
	if (!words) {
		return withoutExtension
	}
	return words.charAt(0).toUpperCase() + words.slice(1)
}

/** `A quiet morning` becomes `A quiet morning copy`. */
export function copyTitle(title: string): string {
	return `${title} copy`
}

/**
 * `title` if no other piece is called that, otherwise `title (2)`, `title (3)`,
 * and so on.
 *
 * The list of pieces shows titles, not file names, so two pieces with the same
 * title look like one piece listed twice: a duplicate and its original, or two
 * drafts given the same name, were indistinguishable (finding F16). Brackets
 * rather than a bare number, so "Chapter 2" becomes "Chapter 2 (2)" and not
 * "Chapter 2 2". Compared without regard to case, because "Morning" and
 * "morning" read as the same title in a list.
 */
export function uniqueTitle(title: string, existing: readonly string[]): string {
	const taken = new Set(existing.map((name) => name.trim().toLowerCase()))
	if (!taken.has(title.trim().toLowerCase())) {
		return title
	}
	for (let number = 2; number < 1000; number++) {
		const attempt = `${title} (${number})`
		if (!taken.has(attempt.toLowerCase())) {
			return attempt
		}
	}
	return title
}

/**
 * A title keeps an image's alt text, because a piece that opens with a picture is
 * better titled by its caption than left as "Untitled". The word count makes the
 * opposite choice; both use the same stripper so nothing else can drift.
 */
function clean(text: string): string {
	return stripInlineMarkup(text, { keepImageAltText: true }).replace(/\s+/g, " ").trim()
}

function truncate(text: string, limit: number): string {
	return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}\u2026`
}
