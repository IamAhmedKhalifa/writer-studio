import * as assert from "node:assert/strict"
import { FOCUS_MODE_SETTING_KEYS, WRITER_SETTINGS } from "../src/profile/settingsCatalog"

/**
 * The catalog is the only thing standing between a writer and a permanently
 * altered editor. These tests guard the properties that make it reversible and
 * keep its blast radius inside the writer's own library.
 */
describe("settingsCatalog", () => {
	it("lists every setting exactly once", () => {
		const keys = WRITER_SETTINGS.map((setting) => setting.key)
		const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index)
		assert.deepEqual(duplicates, [], `duplicated keys: ${duplicates.join(", ")}`)
	})

	it("gives every setting a value, so nothing is applied as undefined", () => {
		for (const setting of WRITER_SETTINGS) {
			assert.notEqual(setting.value, undefined, setting.key)
		}
	})

	it("gives every setting an explicit scope", () => {
		for (const setting of WRITER_SETTINGS) {
			assert.ok(
				setting.scope === "everywhere" || setting.scope === "library",
				`${setting.key} has scope ${String(setting.scope)}`,
			)
		}
	})

	it("uses fully qualified setting names", () => {
		for (const setting of WRITER_SETTINGS) {
			assert.match(setting.key, /^[a-zA-Z][\w-]*(\.[\w-]+)+$/, setting.key)
		}
	})

	it("never disables a security feature", () => {
		// Hiding a prompt is not worth removing the protection that stops a
		// malicious folder from running code, and the writer cannot weigh that.
		for (const setting of WRITER_SETTINGS) {
			assert.ok(!setting.key.startsWith("security."), `${setting.key} must not be in the catalog`)
		}
	})

	it("does not override the writer's own telemetry choice", () => {
		const keys = WRITER_SETTINGS.map((setting) => setting.key)
		assert.ok(!keys.includes("telemetry.telemetryLevel"))
	})

	it("keeps everything that would harm another project inside the library", () => {
		// A writer who also uses VS Code for code must keep Git, the problems
		// markers, and their window title in all their other projects.
		for (const key of [
			"git.enabled",
			"git.openRepositoryInParentFolders",
			"scm.diffDecorations",
			"problems.decorations.enabled",
			"window.title",
			"editor.lineNumbers",
			"editor.minimap.enabled",
			"markdown.styles",
		]) {
			const setting = WRITER_SETTINGS.find((candidate) => candidate.key === key)
			assert.equal(setting?.scope, "library", `${key} must be scoped to the library`)
		}
	})

	it("merges rather than replaces every object-valued setting", () => {
		// Replacing would silently discard the writer's own entries.
		for (const setting of WRITER_SETTINGS) {
			const isPlainObject =
				typeof setting.value === "object" && setting.value !== null && !Array.isArray(setting.value)
			if (isPlainObject) {
				assert.equal(setting.merge, true, `${setting.key} must be merged, not replaced`)
			}
		}
	})

	it("never trims trailing spaces, which are line breaks in a piece of writing", () => {
		const setting = WRITER_SETTINGS.find((candidate) => candidate.key === "files.trimTrailingWhitespace")
		assert.equal(setting?.value, false)
	})

	it("always turns automatic saving on, everywhere", () => {
		const autoSave = WRITER_SETTINGS.find((candidate) => candidate.key === "files.autoSave")
		assert.equal(autoSave?.value, "afterDelay")
		assert.equal(autoSave?.scope, "everywhere")
	})

	it("does not flag curly quotes or accented characters", () => {
		for (const key of [
			"editor.unicodeHighlight.ambiguousCharacters",
			"editor.unicodeHighlight.nonBasicASCII",
			"editor.unicodeHighlight.invisibleCharacters",
		]) {
			assert.equal(
				WRITER_SETTINGS.find((candidate) => candidate.key === key)?.value,
				false,
				`${key} must be off`,
			)
		}
	})

	it("points the preview at a stylesheet inside the library", () => {
		// A global contribution would restyle every Markdown preview the writer
		// ever opens, and could not be undone by the restore command.
		const styles = WRITER_SETTINGS.find((candidate) => candidate.key === "markdown.styles")
		assert.deepEqual(styles?.value, ["./.writing/preview.css"])
	})

	it("keeps focus mode's temporary settings out of the permanent catalog", () => {
		const permanent = new Set(WRITER_SETTINGS.map((setting) => setting.key))
		for (const key of FOCUS_MODE_SETTING_KEYS) {
			assert.ok(!permanent.has(key), `${key} must not be applied permanently`)
		}
	})
})
