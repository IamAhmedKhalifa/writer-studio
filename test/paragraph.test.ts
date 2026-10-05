import * as assert from "node:assert/strict"
import { findParagraphInLines as findParagraph } from "../src/focus/paragraph"

describe("findParagraph", () => {
	const lines = [
		"First paragraph line one", // 0
		"first paragraph line two", // 1
		"", // 2
		"Second paragraph", // 3
		"   ", // 4  whitespace only counts as blank
		"Third paragraph", // 5
	]

	it("finds the whole block around the cursor", () => {
		assert.deepEqual(findParagraph(lines, 0), { startLine: 0, endLine: 1 })
		assert.deepEqual(findParagraph(lines, 1), { startLine: 0, endLine: 1 })
	})

	it("finds a single-line paragraph", () => {
		assert.deepEqual(findParagraph(lines, 3), { startLine: 3, endLine: 3 })
	})

	it("treats a whitespace-only line as a break", () => {
		assert.equal(findParagraph(lines, 4), undefined)
		assert.deepEqual(findParagraph(lines, 5), { startLine: 5, endLine: 5 })
	})

	it("fades nothing when the cursor is on a blank line", () => {
		assert.equal(findParagraph(lines, 2), undefined)
	})

	it("copes with the first and last lines", () => {
		assert.deepEqual(findParagraph(["only"], 0), { startLine: 0, endLine: 0 })
	})

	it("copes with an empty document", () => {
		assert.equal(findParagraph([], 0), undefined)
		assert.equal(findParagraph([""], 0), undefined)
	})

	it("ignores a line number outside the document", () => {
		assert.equal(findParagraph(lines, -1), undefined)
		assert.equal(findParagraph(lines, 99), undefined)
	})
})
