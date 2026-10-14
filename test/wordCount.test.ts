import * as assert from "node:assert/strict"
import { stripFrontMatter } from "../src/markdown/markdownText"
import { computeStats, countWords, readingMinutes, toPlainText } from "../src/stats/wordCount"

describe("wordCount", () => {
	describe("countWords", () => {
		it("counts an empty document as zero", () => {
			assert.equal(countWords(""), 0)
			assert.equal(countWords("   \n\n  \t "), 0)
		})

		it("counts plain prose", () => {
			assert.equal(countWords("The quick brown fox jumps"), 5)
		})

		it("ignores the block of settings at the top of a file", () => {
			const doc = ["---", "title: A quiet morning", "tags: [one, two]", "---", "", "Only these four words"].join(
				"\n",
			)
			assert.equal(countWords(doc), 4)
		})

		it("does not mistake a horizontal rule for front matter", () => {
			assert.equal(countWords("One two\n\n---\n\nthree four"), 4)
		})

		it("ignores fenced code blocks", () => {
			const doc = ["Before the code", "", "```js", "const a = 1", "console.log(a)", "```", "", "after"].join("\n")
			assert.equal(countWords(doc), 4)
		})

		it("ignores an unclosed fenced code block at the end", () => {
			assert.equal(countWords("Two words\n\n```\nnever closed and full of text\n"), 2)
		})

		it("counts the visible words of a link but not its address", () => {
			// See, my, best, essay, today
			assert.equal(countWords("See [my best essay](https://example.com/a/b-c?d=e) today"), 5)
		})

		it("ignores image markup entirely", () => {
			assert.equal(countWords("![a cat on a wall](cat.png)\n\nJust three words"), 3)
		})

		it("ignores bare web addresses", () => {
			assert.equal(countWords("Read https://example.com/some/long/path now"), 2)
		})

		it("ignores heading, quote, and list markers", () => {
			const doc = ["# Title here", "", "> quoted words", "", "- first item", "1. second item"].join("\n")
			assert.equal(countWords(doc), 8)
		})

		it("ignores table pipes and divider rows", () => {
			const doc = ["| Name | Role |", "| --- | --- |", "| Ada | writer |"].join("\n")
			// Name, Role, Ada, writer
			assert.equal(countWords(doc), 4)
		})

		it("counts inline code contents as words", () => {
			assert.equal(countWords("The word `cat` counts"), 4)
		})

		it("counts emphasised words once", () => {
			assert.equal(countWords("**bold** and *italic* and ***both***"), 5)
		})

		it("counts hyphenated and apostrophised words once", () => {
			assert.equal(countWords("well-known writer's day-to-day"), 3)
			assert.equal(countWords("don\u2019t stop"), 2)
		})

		it("does not count stray punctuation as words", () => {
			assert.equal(countWords("Hello --- world ... !"), 2)
		})

		it("counts accented and non-Latin words", () => {
			assert.equal(countWords("caf\u00e9 na\u00efve \u0645\u0631\u062d\u0628\u0627"), 3)
		})

		it("ignores HTML tags and comments", () => {
			assert.equal(countWords('<div class="x">two words</div><!-- hidden note here -->'), 2)
		})
	})

	describe("computeStats", () => {
		it("reports characters with and without spaces", () => {
			const stats = computeStats("ab cd")
			assert.equal(stats.words, 2)
			assert.equal(stats.characters, 5)
			assert.equal(stats.charactersNoSpaces, 4)
		})

		it("counts paragraphs separated by blank lines", () => {
			const stats = computeStats("First para line one\nstill first\n\nSecond para\n\n\nThird para")
			assert.equal(stats.paragraphs, 3)
		})

		it("does not count a blank document as a paragraph", () => {
			assert.equal(computeStats("\n\n   \n").paragraphs, 0)
		})
	})

	describe("readingMinutes", () => {
		it("is zero for an empty document", () => {
			assert.equal(readingMinutes(0, 200), 0)
		})

		it("never rounds a short piece down to zero", () => {
			assert.equal(readingMinutes(5, 200), 1)
		})

		it("rounds to the nearest minute", () => {
			assert.equal(readingMinutes(400, 200), 2)
			assert.equal(readingMinutes(500, 200), 3)
		})

		it("falls back to a sane rate when given nonsense", () => {
			assert.equal(readingMinutes(400, 0), 2)
		})
	})

	describe("stripFrontMatter", () => {
		it("removes a leading YAML block", () => {
			assert.equal(stripFrontMatter("---\na: b\n---\nbody"), "body")
		})

		it("leaves a document without front matter untouched", () => {
			assert.equal(stripFrontMatter("body only"), "body only")
		})

		it("copes with Windows line endings", () => {
			assert.equal(stripFrontMatter("---\r\na: b\r\n---\r\nbody"), "body")
		})
	})

	describe("toPlainText", () => {
		it("removes formatting markers", () => {
			assert.equal(toPlainText("# Title\n\nSome **bold** text"), "Title\n\nSome bold text")
		})

		it("keeps the words of a link and puts its address in brackets", () => {
			// Pasted into an email, a link that lost its address went nowhere.
			assert.equal(toPlainText("Read [this piece](https://example.com)"), "Read this piece (https://example.com)")
		})

		it("leaves out a link's title", () => {
			assert.equal(toPlainText('[Rome](https://rome.it "The city")'), "Rome (https://rome.it)")
		})

		it("does not repeat an address that is also the link's words", () => {
			assert.equal(toPlainText("[example.com](https://example.com/)"), "https://example.com/")
		})

		it("shows an email link as the address alone", () => {
			assert.equal(toPlainText("[Write to me](mailto:me@example.com)"), "Write to me (me@example.com)")
		})

		it("keeps only the words of a link that means nothing outside the piece", () => {
			assert.equal(toPlainText("See [the ending](#the-ending) and [part two](part-two.md)"), "See the ending and part two")
		})

		it("finds the address of a link defined further down", () => {
			const doc = ["Read [the essay][1] and [Rome][].", "", "[1]: https://example.com/essay", "[rome]: <https://rome.it>"]
			assert.equal(toPlainText(doc.join("\n")), "Read the essay (https://example.com/essay) and Rome (https://rome.it).")
		})

		it("keeps bare addresses, without the full stop after them", () => {
			assert.equal(toPlainText("Go to https://example.com/a_b_c. Or <https://x.org>"), "Go to https://example.com/a_b_c. Or https://x.org")
		})

		it("does not let emphasis rules eat an address", () => {
			assert.equal(toPlainText("[*Notes*](https://x.com/a_b_c_d)"), "Notes (https://x.com/a_b_c_d)")
		})

		it("keeps the numbers of a numbered list and drops bullets", () => {
			const doc = ["1. First", "2. Second", "", "- one", "* two", "", "> 3) Quoted"]
			assert.equal(toPlainText(doc.join("\n")), "1. First\n2. Second\n\none\ntwo\n\n3) Quoted")
		})

		it("still leaves addresses and numbers out of the word count", () => {
			assert.equal(countWords("Read [this piece](https://example.com/a-b) today"), 4)
			assert.equal(countWords("1. First\n2. Second"), 2)
		})

		it("collapses runs of blank lines", () => {
			assert.equal(toPlainText("a\n\n\n\nb"), "a\n\nb")
		})
	})
})
