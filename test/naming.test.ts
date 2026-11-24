import * as assert from "node:assert/strict"
import {
	copyTitle,
	displayTitleFromFileName,
	draftFileName,
	extractTitle,
	findTitleSource,
	formatDatePrefix,
	isValidTitle,
	retitleHeading,
	rewriteTitleLine,
	slugify,
	uniqueFileName,
	uniqueTitle,
} from "../src/library/naming"

describe("naming", () => {
	describe("formatDatePrefix", () => {
		it("uses the writer's own date, not UTC", () => {
			// Local midnight must still report its own day.
			const date = new Date(2026, 8, 18, 0, 30)
			assert.equal(formatDatePrefix(date), "2026-09-18")
		})

		it("pads single digit months and days", () => {
			assert.equal(formatDatePrefix(new Date(2026, 0, 5)), "2026-01-05")
		})
	})

	describe("slugify", () => {
		it("lowercases and joins words with dashes", () => {
			assert.equal(slugify("A Quiet Morning"), "a-quiet-morning")
		})

		it("strips accents rather than dropping the letter", () => {
			assert.equal(slugify("Caf\u00e9 na\u00efve"), "cafe-naive")
		})

		it("removes apostrophes without splitting the word", () => {
			assert.equal(slugify("Writer\u2019s block"), "writers-block")
		})

		it("collapses punctuation and trims dashes", () => {
			assert.equal(slugify("  ...Hello, world!!  "), "hello-world")
		})

		it("returns an empty string when there is nothing usable", () => {
			assert.equal(slugify("!!!"), "")
			assert.equal(slugify("   "), "")
		})

		it("does not end on a dash when truncating", () => {
			const slug = slugify("a".repeat(58) + " bb")
			assert.ok(!slug.endsWith("-"), slug)
			assert.ok(slug.length <= 60)
		})
	})

	describe("draftFileName", () => {
		it("combines the date and the title", () => {
			assert.equal(draftFileName("A Quiet Morning", new Date(2026, 8, 18)), "2026-09-18-a-quiet-morning.md")
		})

		it("falls back to untitled when no name is given", () => {
			assert.equal(draftFileName("", new Date(2026, 8, 18)), "2026-09-18-untitled.md")
		})
	})

	describe("isValidTitle", () => {
		it("accepts ordinary titles", () => {
			assert.ok(isValidTitle("A quiet morning"))
			assert.ok(isValidTitle("Notes: part 2".replace(":", "")))
		})

		it("rejects empty and whitespace-only titles", () => {
			assert.ok(!isValidTitle(""))
			assert.ok(!isValidTitle("   "))
		})

		it("rejects anything that could escape the library", () => {
			assert.ok(!isValidTitle("../secrets"))
			assert.ok(!isValidTitle("a/b"))
			assert.ok(!isValidTitle("a\\b"))
			assert.ok(!isValidTitle(".."))
		})

		it("rejects characters that break on Windows", () => {
			for (const bad of ["a:b", "a*b", "a?b", 'a"b', "a<b", "a>b", "a|b"]) {
				assert.ok(!isValidTitle(bad), bad)
			}
		})

		it("rejects reserved device names", () => {
			assert.ok(!isValidTitle("CON"))
			assert.ok(!isValidTitle("com1.md"))
		})

		it("rejects absurdly long titles", () => {
			assert.ok(!isValidTitle("a".repeat(121)))
		})
	})

	describe("uniqueFileName", () => {
		it("returns the name unchanged when it is free", () => {
			assert.equal(uniqueFileName("a.md", ["b.md"]), "a.md")
		})

		it("adds a number when the name is taken", () => {
			assert.equal(uniqueFileName("a.md", ["a.md"]), "a-2.md")
			assert.equal(uniqueFileName("a.md", ["a.md", "a-2.md"]), "a-3.md")
		})

		it("treats names as the file system does, ignoring case", () => {
			assert.equal(uniqueFileName("A.md", ["a.md"]), "A-2.md")
		})

		it("keeps the extension at the end", () => {
			assert.ok(uniqueFileName("my.notes.md", ["my.notes.md"]).endsWith(".md"))
		})
	})

	describe("extractTitle", () => {
		it("uses the first heading", () => {
			assert.equal(extractTitle("# A quiet morning\n\nBody"), "A quiet morning")
		})

		it("ignores the settings block at the top", () => {
			assert.equal(extractTitle("---\ntitle: Not this\n---\n\n# But this\n"), "But this")
		})

		it("ignores a heading inside a code block", () => {
			const doc = ["```", "# not a title", "```", "", "# the real title"].join("\n")
			assert.equal(extractTitle(doc), "the real title")
		})

		it("removes formatting markers from the heading", () => {
			assert.equal(extractTitle("# A **bold** [link](http://x)"), "A bold link")
		})

		it("handles closing hashes", () => {
			assert.equal(extractTitle("## Middle ##"), "Middle")
		})

		it("falls back to the first line of prose", () => {
			assert.equal(extractTitle("Just a sentence to start.\n\nMore."), "Just a sentence to start.")
		})

		it("returns nothing for an empty document", () => {
			assert.equal(extractTitle(""), undefined)
			assert.equal(extractTitle("\n\n   \n"), undefined)
		})
	})

	describe("displayTitleFromFileName", () => {
		it("removes the date and the extension", () => {
			assert.equal(displayTitleFromFileName("2026-09-18-a-quiet-morning.md"), "A quiet morning")
		})

		it("copes with no date", () => {
			assert.equal(displayTitleFromFileName("notes.md"), "Notes")
		})

		it("copes with a file that is only a date", () => {
			assert.equal(displayTitleFromFileName("2026-09-18.md"), "2026-09-18")
		})
	})

	describe("copyTitle", () => {
		it("marks a duplicate plainly", () => {
			assert.equal(copyTitle("Essay"), "Essay copy")
		})
	})

	describe("uniqueTitle", () => {
		it("keeps a title nobody else has", () => {
			assert.equal(uniqueTitle("Morning", ["Evening"]), "Morning")
		})

		it("numbers a title that is already in use", () => {
			assert.equal(uniqueTitle("Morning", ["Morning"]), "Morning (2)")
			assert.equal(uniqueTitle("Morning", ["Morning", "Morning (2)"]), "Morning (3)")
		})

		it("treats titles that differ only in capitals as the same", () => {
			assert.equal(uniqueTitle("morning", ["Morning"]), "morning (2)")
		})

		it("keeps a number that is part of the title readable", () => {
			assert.equal(uniqueTitle("Chapter 2", ["Chapter 2"]), "Chapter 2 (2)")
		})
	})

	describe("retitleHeading", () => {
		it("rewrites the heading the sidebar titles the piece by", () => {
			assert.deepEqual(retitleHeading("# First name\n\nBody", "Second name"), {
				lineIndex: 0,
				text: "# Second name",
			})
		})

		it("keeps the heading's own size", () => {
			assert.deepEqual(retitleHeading("## Small\n", "Renamed"), { lineIndex: 0, text: "## Renamed" })
		})

		it("keeps the writer's indentation and drops closing hashes", () => {
			assert.deepEqual(retitleHeading("  # Old #\n", "New"), { lineIndex: 0, text: "  # New" })
		})

		it("counts the settings block so the line number stays true", () => {
			const doc = "---\ntitle: Not this\n---\n\n# But this\n"
			const found = retitleHeading(doc, "Renamed")
			assert.ok(found)
			assert.equal(doc.split("\n")[found.lineIndex], "# But this")
		})

		it("skips a heading inside a code block", () => {
			const doc = ["```", "# not a title", "```", "", "# the real title"].join("\n")
			const found = retitleHeading(doc, "Renamed")
			assert.ok(found)
			assert.equal(found.lineIndex, 4)
		})

		it("finds a heading that comes after prose", () => {
			const found = retitleHeading("A sentence first.\n\n# The heading\n", "Renamed")
			assert.deepEqual(found, { lineIndex: 2, text: "# Renamed" })
		})

		it("rewrites an underlined heading and leaves the underline alone", () => {
			assert.deepEqual(retitleHeading("A quiet morning\n===============\n", "Renamed"), {
				lineIndex: 0,
				text: "Renamed",
			})
		})

		it("leaves the opening sentence of a piece with no heading alone", () => {
			// Rewriting somebody's first sentence because they renamed a file would
			// be far worse than a stale label in the list.
			assert.equal(retitleHeading("Just prose, no heading.\n", "Renamed"), undefined)
			assert.equal(retitleHeading("", "Renamed"), undefined)
		})

		it("never rewrites a heading the sidebar is not showing", () => {
			// A heading holding only a picture is not a usable title, so the list
			// shows the next one. Rewriting the picture would delete it and change
			// nothing on screen.
			const doc = "# ![](cover.jpg)\n\n# Real title\n"
			assert.equal(extractTitle(doc), "Real title")
			const found = retitleHeading(doc, "Renamed")
			assert.ok(found)
			assert.equal(found.lineIndex, 2)
			assert.equal(doc.split("\n")[found.lineIndex], "# Real title")
		})

		it("agrees with extractTitle about a heading holding only a web address", () => {
			const doc = "# https://example.com\n\n# Real title\n"
			assert.equal(extractTitle(doc), "Real title")
			assert.equal(retitleHeading(doc, "Renamed")?.lineIndex, 2)
		})

		it("refuses a blank new title rather than emptying the heading", () => {
			assert.equal(retitleHeading("# Something\n", "   "), undefined)
		})

		it("never lets a title break the heading into two lines", () => {
			assert.deepEqual(retitleHeading("# Old\n", "Two\nlines"), { lineIndex: 0, text: "# Two lines" })
		})

		it("keeps a byte order mark at the top of the file", () => {
			const found = retitleHeading("\uFEFF# Old\n", "New")
			assert.deepEqual(found, { lineIndex: 0, text: "\uFEFF# New" })
		})
	})

	describe("rewriteTitleLine", () => {
		it("rewrites only the title line", () => {
			assert.equal(rewriteTitleLine("# Old\n\nBody stays.\n", "New"), "# New\n\nBody stays.\n")
		})

		it("keeps Windows line endings exactly as the writer had them", () => {
			// Joining split lines would convert the whole file over a rename.
			assert.equal(rewriteTitleLine("# Old\r\n\r\nBody.\r\n", "New"), "# New\r\n\r\nBody.\r\n")
		})

		it("copes with a title line that has no line ending after it", () => {
			assert.equal(rewriteTitleLine("# Old", "New"), "# New")
		})

		it("rewrites a heading further down the piece", () => {
			assert.equal(
				rewriteTitleLine("A sentence.\r\n\r\n## Old\r\nMore.\r\n", "New"),
				"A sentence.\r\n\r\n## New\r\nMore.\r\n",
			)
		})

		it("reports nothing to do when the title already matches", () => {
			assert.equal(rewriteTitleLine("# Same\n", "Same"), undefined)
		})

		it("reports nothing to do when there is no heading to rewrite", () => {
			assert.equal(rewriteTitleLine("Just a sentence.\n", "New"), undefined)
		})
	})

	describe("findTitleSource", () => {
		it("says where the title came from, so a rename knows what it may touch", () => {
			assert.equal(findTitleSource("# A heading\n")?.kind, "heading")
			assert.equal(findTitleSource("A heading\n=========\n")?.kind, "setext")
			assert.equal(findTitleSource("Just a sentence.\n")?.kind, "prose")
			assert.equal(findTitleSource("\n\n   \n"), undefined)
		})
	})
})
