import * as assert from "node:assert/strict"
import { extractTitle } from "../src/library/naming"
import { frontMatterEndLine, isRuleLine, isSetextUnderline, stripInlineMarkup } from "../src/markdown/markdownText"
import { countWords } from "../src/stats/wordCount"

describe("markdownText", () => {
	describe("stripInlineMarkup", () => {
		it("removes strikethrough", () => {
			assert.equal(stripInlineMarkup("~~Draft~~ Final", { keepImageAltText: true }), "Draft Final")
		})

		it("removes HTML tags", () => {
			assert.equal(stripInlineMarkup("<em>Rome</em>", { keepImageAltText: true }).trim(), "Rome")
		})

		it("resolves reference links to their words", () => {
			assert.equal(stripInlineMarkup("[Rome][1]", { keepImageAltText: true }), "Rome")
		})

		it("keeps or drops image alt text as asked", () => {
			assert.equal(stripInlineMarkup("![A photo](a.jpg)", { keepImageAltText: true }), "A photo")
			assert.equal(stripInlineMarkup("![A photo](a.jpg)", { keepImageAltText: false }).trim(), "")
		})
	})

	/**
	 * The sidebar title and the word count both have to see through markup. They
	 * used to carry separate implementations, so a heading could be titled with
	 * markers the counter had already stripped.
	 */
	describe("titles and counts agree about what is markup", () => {
		const cases = [
			"# ~~Draft~~ Final",
			"# <em>Rome</em>",
			"# [Rome][1]",
			"# A **bold** word",
			"# `code` in a title",
		]

		for (const document of cases) {
			it(`leaves no markers in the title of ${JSON.stringify(document)}`, () => {
				const title = extractTitle(document)
				assert.ok(title, "expected a title")
				for (const marker of ["~~", "<", ">", "[", "]", "**", "`"]) {
					assert.ok(!title.includes(marker), `title "${title}" still contains ${marker}`)
				}
			})
		}

		it("titles a piece that opens with an image, and does not count the alt text", () => {
			const document = "![A photo of Rome](rome.jpg)\n"
			assert.equal(extractTitle(document), "A photo of Rome")
			assert.equal(countWords(document), 0)
		})

		it("does not use an unterminated front-matter delimiter as the title", () => {
			assert.equal(extractTitle("---\ntitle: never closed\n\n# The real title"), "The real title")
		})
	})

	describe("isSetextUnderline", () => {
		it("recognises the two characters that can underline a heading", () => {
			assert.ok(isSetextUnderline("==="))
			assert.ok(isSetextUnderline("  ---  "))
			// Two is enough to underline, which is why this is not isRuleLine.
			assert.ok(isSetextUnderline("=="))
		})

		it("refuses anything that cannot underline a heading", () => {
			assert.ok(!isSetextUnderline(undefined))
			assert.ok(!isSetextUnderline(""))
			// A lone dash is an empty list item far more often than an underline.
			assert.ok(!isSetextUnderline("-"))
			assert.ok(!isSetextUnderline("***"))
			assert.ok(!isSetextUnderline("___"))
			assert.ok(!isSetextUnderline("=== words"))
		})

		it("differs from isRuleLine only where the two questions differ", () => {
			// `***` is a rule and can never underline; `==` underlines and is not a
			// rule. Both answers are deliberate, and both live in this one file so
			// they cannot drift apart again.
			assert.ok(isRuleLine("***") && !isSetextUnderline("***"))
			assert.ok(isSetextUnderline("==") && !isRuleLine("=="))
			assert.ok(isRuleLine("---") && isSetextUnderline("---"))
		})
	})

	describe("frontMatterEndLine", () => {
		it("finds the line that closes a settings block", () => {
			assert.equal(frontMatterEndLine(["---", "title: x", "summary:", "---", "", "Body"]), 3)
		})

		it("reports nothing when the piece does not open with one", () => {
			assert.equal(frontMatterEndLine(["# A heading", "---"]), undefined)
			assert.equal(frontMatterEndLine(["Body only"]), undefined)
			assert.equal(frontMatterEndLine([]), undefined)
		})

		it("reports nothing for a settings block that was never closed", () => {
			assert.equal(frontMatterEndLine(["---", "title: never closed", "", "# A heading"]), undefined)
		})
	})
})
