import * as assert from "node:assert/strict"
import {
	buildLink,
	buildTable,
	currentHeadingLevel,
	isWrapped,
	normaliseUrl,
	setHeadingLevel,
	setHeadingLevelForLines,
	toggleLinePrefix,
	toggleNumberedList,
	toggleWrapped,
	underlines,
} from "../src/ui/formatting"

describe("formatting", () => {
	describe("toggleWrapped", () => {
		it("adds markers around plain text", () => {
			assert.equal(toggleWrapped("word", "**"), "**word**")
			assert.equal(toggleWrapped("word", "*"), "*word*")
		})

		it("removes markers that are already there", () => {
			assert.equal(toggleWrapped("**word**", "**"), "word")
			assert.equal(toggleWrapped("*word*", "*"), "word")
		})

		it("keeps surrounding spaces outside the markers", () => {
			// "** bold **" does not render as bold, so the spaces must stay out.
			assert.equal(toggleWrapped(" word ", "**"), " **word** ")
		})

		it("leaves an empty selection ready to type into", () => {
			assert.equal(toggleWrapped("", "**"), "****")
		})

		it("wraps a multi-word phrase once", () => {
			assert.equal(toggleWrapped("two words", "**"), "**two words**")
		})

		it("does not mistake bold for italic", () => {
			// Asking for italic on bold text should nest, not unwrap.
			assert.equal(toggleWrapped("**word**", "*"), "***word***")
		})

		it("removes only italic from text that is both bold and italic", () => {
			assert.equal(toggleWrapped("***word***", "*"), "**word**")
		})

		it("removes only bold from text that is both bold and italic", () => {
			assert.equal(toggleWrapped("***word***", "**"), "*word*")
		})

		it("adds bold around italic text", () => {
			assert.equal(toggleWrapped("*word*", "**"), "***word***")
		})

		it("does not corrupt a selection holding two separate emphasised phrases", () => {
			// Regression: this used to strip one marker from each end and produce
			// "one* and *two", silently losing two of the writer's characters.
			// Wrapping is the conservative choice because it can be undone.
			assert.equal(toggleWrapped("*one* and *two*", "*"), "**one* and *two**")
			assert.equal(toggleWrapped("**one** and **two**", "**"), "****one** and **two****")
		})

		it("nests rather than unwrapping when emphasis is nested inside", () => {
			assert.equal(toggleWrapped("*a **b** c*", "*"), "**a **b** c**")
		})
	})

	describe("isWrapped", () => {
		it("recognises wrapped text", () => {
			assert.ok(isWrapped("**a**", "**"))
		})

		it("rejects text that is only the marker", () => {
			assert.ok(!isWrapped("**", "**"))
			assert.ok(!isWrapped("****", "**"))
			assert.ok(!isWrapped("*", "*"))
			assert.ok(!isWrapped("**", "*"))
		})

		it("rejects text wrapped on one side only", () => {
			assert.ok(!isWrapped("**a", "**"))
			assert.ok(!isWrapped("a**", "**"))
		})
	})

	describe("toggleLinePrefix", () => {
		it("adds a quotation marker to every line", () => {
			assert.deepEqual(toggleLinePrefix(["one", "two"], "> "), ["> one", "> two"])
		})

		it("removes the marker when every line has it", () => {
			assert.deepEqual(toggleLinePrefix(["> one", "> two"], "> "), ["one", "two"])
		})

		it("adds to all when only some have it", () => {
			assert.deepEqual(toggleLinePrefix(["> one", "two"], "> "), ["> > one", "> two"])
		})

		it("leaves blank lines alone", () => {
			assert.deepEqual(toggleLinePrefix(["one", "", "two"], "> "), ["> one", "", "> two"])
		})

		it("keeps indentation when removing", () => {
			assert.deepEqual(toggleLinePrefix(["    - one"], "- "), ["    one"])
		})

		it("makes a bulleted list", () => {
			assert.deepEqual(toggleLinePrefix(["one", "two"], "- "), ["- one", "- two"])
		})
	})

	describe("toggleNumberedList", () => {
		it("numbers lines from one", () => {
			assert.deepEqual(toggleNumberedList(["a", "b", "c"]), ["1. a", "2. b", "3. c"])
		})

		it("removes numbering when every line has it", () => {
			assert.deepEqual(toggleNumberedList(["1. a", "2. b"]), ["a", "b"])
		})

		it("converts a bulleted list into a numbered one", () => {
			assert.deepEqual(toggleNumberedList(["- a", "- b"]), ["1. a", "2. b"])
		})

		it("skips blank lines without spending a number", () => {
			assert.deepEqual(toggleNumberedList(["a", "", "b"]), ["1. a", "", "2. b"])
		})
	})

	describe("setHeadingLevel", () => {
		it("makes a heading", () => {
			assert.equal(setHeadingLevel("Title", 1), "# Title")
			assert.equal(setHeadingLevel("Section", 2), "## Section")
		})

		it("changes an existing heading's level", () => {
			assert.equal(setHeadingLevel("# Title", 2), "## Title")
		})

		it("turns a heading back into ordinary text when reapplied", () => {
			assert.equal(setHeadingLevel("## Section", 2), "Section")
		})

		it("keeps indentation", () => {
			assert.equal(setHeadingLevel("  Title", 1), "  # Title")
		})

		it("refuses to go beyond six levels", () => {
			assert.equal(setHeadingLevel("x", 9), "###### x")
			assert.equal(setHeadingLevel("x", 0), "# x")
		})
	})

	describe("setHeadingLevelForLines", () => {
		it("takes the underline away with the heading it belonged to", () => {
			assert.deepEqual(setHeadingLevelForLines(["A quiet morning", "==============="], 1), [
				"# A quiet morning",
			])
			assert.deepEqual(setHeadingLevelForLines(["A section", "---------"], 2), ["## A section"])
		})

		it("does not treat a rule after a blank line as an underline", () => {
			// Nothing is swallowed: the `---` stands on its own and is left in the
			// document rather than disappearing with the paragraph above it.
			assert.deepEqual(setHeadingLevelForLines(["Words", "", "---"], 1), ["# Words", "", "# ---"])
		})

		it("keeps a horizontal rule that sits under an existing heading", () => {
			// `---` under `# Chapter one` is a rule, not an underline. Deleting it
			// would take away a divider the writer put there deliberately.
			assert.deepEqual(setHeadingLevelForLines(["# Chapter one", "---"], 2), ["## Chapter one", "## ---"])
		})

		it("treats a rule under an ordinary line as that line's underline", () => {
			// Correct in isolation: in Markdown this really is one heading. The
			// settings block at the top of a file is the exception, and only the
			// caller can see that, so it is handled where the document is known.
			assert.deepEqual(setHeadingLevelForLines(["A section", "---"], 2), ["## A section"])
		})

		it("handles several headings in one go", () => {
			assert.deepEqual(setHeadingLevelForLines(["One", "===", "", "Two", "==="], 1), [
				"# One",
				"",
				"# Two",
			])
		})

		it("behaves like setHeadingLevel when there is no underline", () => {
			assert.deepEqual(setHeadingLevelForLines(["a", "b"], 2), ["## a", "## b"])
		})
	})

	describe("underlines", () => {
		it("recognises an underlined paragraph line", () => {
			assert.ok(underlines("A quiet morning", "==============="))
			assert.ok(underlines("  A quiet morning", "  ---  "))
		})

		it("refuses a rule under something that is not a paragraph", () => {
			// Each of these is a horizontal rule the writer put there on purpose.
			assert.ok(!underlines("# Chapter one", "---"))
			assert.ok(!underlines("> A quotation", "---"))
			assert.ok(!underlines("- An item", "---"))
			assert.ok(!underlines("1. An item", "---"))
			assert.ok(!underlines("```", "---"))
			assert.ok(!underlines("===", "---"))
		})

		it("refuses anything that is not an underline at all", () => {
			assert.ok(!underlines("Words", undefined))
			assert.ok(!underlines("Words", ""))
			assert.ok(!underlines("Words", "-"))
			assert.ok(!underlines("Words", "- item"))
			assert.ok(!underlines("Words", "=== words"))
			assert.ok(!underlines("Words", "***"))
		})

		it("refuses to underline a blank line", () => {
			assert.ok(!underlines("", "---"))
			assert.ok(!underlines("   ", "==="))
		})
	})

	describe("currentHeadingLevel", () => {
		it("reports the level", () => {
			assert.equal(currentHeadingLevel("### a"), 3)
		})

		it("reports nothing for ordinary text", () => {
			assert.equal(currentHeadingLevel("a"), undefined)
			assert.equal(currentHeadingLevel("#no space"), undefined)
		})
	})

	describe("buildLink", () => {
		it("uses the selected words", () => {
			assert.equal(buildLink("my essay", "https://example.com"), "[my essay](https://example.com)")
		})

		it("falls back to the address when there are no words", () => {
			assert.equal(buildLink("  ", "https://example.com"), "[https://example.com](https://example.com)")
		})
	})

	describe("normaliseUrl", () => {
		it("leaves a full address alone", () => {
			assert.equal(normaliseUrl("https://example.com"), "https://example.com")
			assert.equal(normaliseUrl("http://example.com"), "http://example.com")
		})

		it("adds a scheme to a bare domain", () => {
			assert.equal(normaliseUrl("example.com/page"), "https://example.com/page")
			assert.equal(normaliseUrl("www.example.com"), "https://www.example.com")
		})

		it("recognises an email address", () => {
			assert.equal(normaliseUrl("me@example.com"), "mailto:me@example.com")
		})

		it("leaves anchors and relative addresses alone", () => {
			assert.equal(normaliseUrl("#section"), "#section")
			assert.equal(normaliseUrl("/about"), "/about")
			assert.equal(normaliseUrl("./other.md"), "./other.md")
		})

		it("returns nothing for nothing", () => {
			assert.equal(normaliseUrl("   "), "")
		})
	})

	describe("buildTable", () => {
		it("builds a header, a divider, and empty rows", () => {
			const table = buildTable(2, 2).split("\n")
			assert.equal(table.length, 4)
			assert.equal(table[0], "| Column 1 | Column 2 |")
			assert.equal(table[1], "| --- | --- |")
		})

		it("keeps the size sensible", () => {
			assert.equal(buildTable(0, 0).split("\n")[0], "| Column 1 |")
			assert.ok(buildTable(99, 99).split("\n").length <= 52)
		})
	})
})
