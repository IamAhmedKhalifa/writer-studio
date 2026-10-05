import MarkdownIt from "markdown-it"
import { stripFrontMatter } from "./markdownText"

/**
 * Turns a writer's Markdown into HTML.
 *
 * `typographer` is on, so straight quotes become curly quotes and `--` becomes
 * an en dash. That is what a writer wants when the text lands on a web page, and
 * it is the difference between text that looks typed and text that looks typeset.
 *
 * `html` is off deliberately. This audience never writes raw HTML, so allowing it
 * buys nothing and would let a `<script>` pasted in from a web page travel into
 * the copy web view and into an exported file that the writer then publishes.
 * Escaping it instead means the worst case is visible text rather than running
 * code.
 */
const renderer = new MarkdownIt({
	html: false,
	linkify: true,
	typographer: true,
	breaks: false,
})

/** The HTML for the body of the piece, without a page wrapper. */
export function renderBody(markdown: string): string {
	// The settings block at the top of a file is instructions for a publishing
	// system, never words the reader should see.
	return renderer.render(stripFrontMatter(markdown)).trim()
}

/**
 * The policy carried by an exported page.
 *
 * `html: false` above already escapes anything a writer pasted in, so nothing
 * should be able to put a script into the page. This is the second lock on the
 * same door: the file is meant to be handed to somebody else and opened in their
 * browser, so scripts are refused outright by the page itself.
 *
 * `base-uri` and `form-action` are named explicitly because neither falls back to
 * `default-src`. Leaving them out would have left the two things a stray tag can
 * still do — rewrite every relative address on the page, or post somewhere —
 * unguarded, which is exactly the case this policy exists to cover.
 *
 * Images are allowed from anywhere, and that is a real trade rather than an
 * oversight. A writer who wrote `![](https://…)` expects to see their picture,
 * and an exported page that silently dropped it would look broken. The cost is
 * that opening the file tells those hosts it was opened, so the writer is told
 * which ones the page will contact before it is saved.
 */
const EXPORT_POLICY =
	"default-src 'none'; base-uri 'none'; form-action 'none'; img-src * data:; style-src 'unsafe-inline'; font-src data:"

/**
 * The outside addresses an exported page will reach for when it is opened.
 *
 * Read by the export command so the writer can be told, in plain words, that the
 * file is not entirely self-contained. Returned sorted and without duplicates.
 */
export function remoteImageHosts(markdown: string): string[] {
	const hosts = new Set<string>()
	for (const match of renderBody(markdown).matchAll(/<img\b[^>]*\bsrc="([^"]*)"/g)) {
		try {
			const url = new URL(match[1])
			if (url.protocol === "http:" || url.protocol === "https:") {
				hosts.add(url.host)
			}
		} catch {
			// A relative address reaches nothing outside the file.
		}
	}
	return [...hosts].sort((a, b) => a.localeCompare(b))
}

/** A complete, self-contained web page that works when opened from a disk. */
export function renderPage(markdown: string, title: string, css: string): string {
	return [
		"<!DOCTYPE html>",
		'<html lang="en">',
		"<head>",
		'<meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		`<meta http-equiv="Content-Security-Policy" content="${EXPORT_POLICY}">`,
		`<title>${escapeHtml(title)}</title>`,
		`<style>\n${css}\n</style>`,
		"</head>",
		"<body>",
		'<article class="piece">',
		renderBody(markdown),
		"</article>",
		"</body>",
		"</html>",
		"",
	].join("\n")
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;")
}
