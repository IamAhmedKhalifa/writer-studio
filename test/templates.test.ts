import * as assert from "node:assert/strict"
import { fillTemplate } from "../src/library/templates"

describe("fillTemplate", () => {
	it("substitutes the title everywhere it appears", () => {
		assert.equal(fillTemplate("# {{title}}\n\nby me, about {{title}}", "On Silence"), "# On Silence\n\nby me, about On Silence")
	})

	it("accepts the placeholder with spaces and any case", () => {
		assert.equal(fillTemplate("# {{ TITLE }}", "X"), "# X")
	})

	it("never leaves the placeholder behind when there is no title", () => {
		// Regression: a blank name is explicitly invited by the prompt, and used to
		// produce a document containing the literal text "{{title}}".
		const filled = fillTemplate("---\ntitle: {{title}}\n---\n\n# {{title}}\n\nBody", undefined)
		assert.ok(!filled.includes("{{"), filled)
		assert.ok(!filled.includes("title:"), filled)
	})

	it("removes the heading that existed only to hold the title", () => {
		assert.equal(fillTemplate("# {{title}}\n\nBody", undefined), "\nBody")
	})

	it("keeps a heading that has words of its own", () => {
		assert.equal(fillTemplate("# About {{title}}\n", undefined), "# About\n")
	})

	it("keeps deliberately empty template fields", () => {
		// `date:` and `tags:` are meant to be filled in by the writer.
		const filled = fillTemplate("---\ntitle: {{title}}\ndate:\ntags:\n---\n", undefined)
		assert.ok(filled.includes("date:"), filled)
		assert.ok(filled.includes("tags:"), filled)
		assert.ok(!filled.includes("title:"), filled)
	})

	it("leaves a template without placeholders untouched", () => {
		assert.equal(fillTemplate("# Fixed\n\nBody", undefined), "# Fixed\n\nBody")
		assert.equal(fillTemplate("# Fixed\n\nBody", "Ignored"), "# Fixed\n\nBody")
	})
})
