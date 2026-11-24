import * as assert from "node:assert/strict"
import { remoteImageHosts, renderBody, renderPage } from "../src/markdown/render"

describe("render", () => {
	describe("renderBody", () => {
		it("turns a writer's markup into formatted text", () => {
			const html = renderBody("# Title\n\nA **bold** word.")
			assert.match(html, /<h1>Title<\/h1>/)
			assert.match(html, /<strong>bold<\/strong>/)
		})

		it("leaves the settings block at the top out of the page", () => {
			const html = renderBody("---\ntitle: Not this\n---\n\nBody text.")
			assert.ok(!html.includes("Not this"), html)
			assert.match(html, /Body text/)
		})

		it("shows pasted markup as words rather than running it", () => {
			const html = renderBody('Look: <script>alert("x")</script>')
			assert.ok(!html.includes("<script>"), html)
			assert.match(html, /&lt;script&gt;/)
		})
	})

	describe("renderPage", () => {
		it("refuses scripts in a page the writer hands to somebody else", () => {
			const page = renderPage("Hello.", "A piece", "body { color: black }")
			const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(page)
			assert.ok(policy, "the exported page carries no policy")
			assert.match(policy[1], /^default-src 'none'/)
			assert.ok(!policy[1].includes("script-src"), policy[1])
		})

		it("names the directives that do not fall back to default-src", () => {
			// base-uri and form-action inherit from nothing, so leaving them out
			// would leave the page's addresses and any stray form unguarded.
			const page = renderPage("Hello.", "A piece", "")
			const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(page)?.[1] ?? ""
			assert.match(policy, /base-uri 'none'/)
			assert.match(policy, /form-action 'none'/)
		})

		it("carries its styling inside the file so it works offline", () => {
			const page = renderPage("Hello.", "A piece", "body { color: rebeccapurple }")
			assert.match(page, /<style>\n[\s\S]*rebeccapurple[\s\S]*\n<\/style>/)
			assert.ok(!page.includes("<link"), page)
		})

		it("escapes the title rather than letting it break the page", () => {
			const page = renderPage("Body.", 'A "quoted" <title>', "")
			assert.match(page, /<title>A &quot;quoted&quot; &lt;title&gt;<\/title>/)
		})
	})

	describe("remoteImageHosts", () => {
		it("names every outside place an exported page will reach for", () => {
			const markdown = "![](https://images.example.com/a.jpg)\n\n![](http://cdn.example.org/b.png)\n"
			assert.deepEqual(remoteImageHosts(markdown), ["cdn.example.org", "images.example.com"])
		})

		it("reports each place once", () => {
			const markdown = "![](https://a.example.com/1.jpg) ![](https://a.example.com/2.jpg)"
			assert.deepEqual(remoteImageHosts(markdown), ["a.example.com"])
		})

		it("reports nothing for a page that is genuinely self-contained", () => {
			assert.deepEqual(remoteImageHosts("![](pictures/local.jpg)\n\nJust words."), [])
			assert.deepEqual(remoteImageHosts("![](data:image/gif;base64,R0lGOD)"), [])
			assert.deepEqual(remoteImageHosts("No pictures at all."), [])
		})
	})
})
