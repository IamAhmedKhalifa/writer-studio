import * as assert from "node:assert/strict"
import * as fs from "node:fs"
import * as path from "node:path"

/** Compiled to out/test, so the themes are two levels up. */
const THEMES = path.join(__dirname, "..", "..", "themes")

function colours(file: string): Record<string, string> {
	const theme = JSON.parse(fs.readFileSync(path.join(THEMES, file), "utf8")) as { colors: Record<string, string> }
	return theme.colors
}

describe("themes", () => {
	for (const file of ["writers-studio-paper.json", "writers-studio-night.json"]) {
		describe(file, () => {
			it("gives good news its own calm icon colour", () => {
				// Unset, the icon on "Copied." borrows the spelling underline's
				// terracotta, and every success message looks like an error.
				const theme = colours(file)
				const info = theme["notificationsInfoIcon.foreground"]
				assert.ok(info, "notificationsInfoIcon.foreground must be set")
				assert.notEqual(info, theme["editorInfo.foreground"])
				assert.notEqual(info, theme["editorError.foreground"])
				assert.notEqual(info, theme["editorWarning.foreground"])
			})
		})
	}
})
