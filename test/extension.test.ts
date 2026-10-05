import * as assert from "node:assert/strict"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import * as vscode from "vscode"
import type { InternalApi } from "../src/extension"
import { FOCUS_MODE_SETTING_KEYS } from "../src/profile/settingsCatalog"

const EXTENSION_ID = "ahmed-khalifa.writers-studio"

/** A throwaway library so tests never touch a real person's writing. */
function makeTemporaryLibrary(): vscode.Uri {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "writers-studio-test-"))
	return vscode.Uri.file(directory)
}

async function readText(uri: vscode.Uri): Promise<string> {
	return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))
}

async function exists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri)
		return true
	} catch {
		return false
	}
}

describe("Writer's Studio", () => {
	let api: InternalApi

	before(async () => {
		const extension = vscode.extensions.getExtension<InternalApi>(EXTENSION_ID)
		assert.ok(extension, `extension ${EXTENSION_ID} was not found`)
		api = await extension.activate()
		assert.ok(api, "activation did not return the internal API")

		// Defensive: never start from a half-applied state, so a run cannot fail
		// because of what a previous one left behind.
		if (api.profile.isApplied()) {
			await api.profile.restore()
		}
		await api.focus.exit()
		await api.focus.recover()
	})

	describe("commands", () => {
		it("registers every command it contributes", async () => {
			const manifest = vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON as {
				contributes: { commands: { command: string }[] }
			}
			const contributed = manifest.contributes.commands.map((entry) => entry.command)
			const registered = new Set(await vscode.commands.getCommands(true))

			const missing = contributed.filter((command) => !registered.has(command))
			assert.deepEqual(missing, [], `not registered: ${missing.join(", ")}`)
		})
	})

	describe("the library", () => {
		let library: vscode.Uri

		beforeEach(async () => {
			library = makeTemporaryLibrary()
			await api.library.ensureLibrary(library)
			await api.library.setLibraryUri(library)
		})

		afterEach(() => {
			fs.rmSync(library.fsPath, { recursive: true, force: true })
		})

		it("creates the starter content", async () => {
			assert.ok(await exists(vscode.Uri.joinPath(library, "Welcome.md")))
			assert.ok(await exists(vscode.Uri.joinPath(library, "Templates")))
		})

		it("installs the preview stylesheet inside the library", async () => {
			// Scoped here rather than contributed globally, so it cannot restyle
			// the Markdown preview in the writer's other projects.
			assert.ok(await exists(vscode.Uri.joinPath(library, ".writing", "preview.css")))
		})

		it("hides its own machinery from the list of pieces", async () => {
			const documents = await api.library.listDocuments()
			assert.ok(!documents.some((entry) => entry.fileName.startsWith(".")))
		})

		it("can be created twice without losing anything", async () => {
			const welcome = vscode.Uri.joinPath(library, "Welcome.md")
			await vscode.workspace.fs.writeFile(welcome, new TextEncoder().encode("# Mine\n"))
			await api.library.ensureLibrary(library)
			assert.equal(await readText(welcome), "# Mine\n")
		})

		it("lists pieces with their own heading as the title", async () => {
			const documents = await api.library.listDocuments()
			const welcome = documents.find((entry) => entry.fileName === "Welcome.md")
			assert.ok(welcome, "the welcome piece was not listed")
			assert.equal(welcome.title, "Welcome")
			assert.ok((welcome.words ?? 0) > 50, "the welcome piece should have a word count")
		})

		it("hides the templates folder from the list of pieces", async () => {
			const documents = await api.library.listDocuments()
			assert.ok(!documents.some((entry) => entry.fileName.includes("Blog post")))
		})

		it("offers the starter templates", async () => {
			const templates = await api.library.listTemplates()
			const titles = templates.map((template) => template.title)
			assert.ok(titles.includes("Blog post"), titles.join(", "))
			assert.ok(titles.includes("Essay"), titles.join(", "))
		})

		it("creates a new piece named after today and its title", async () => {
			const created = await api.library.createDraft("A Quiet Morning")
			assert.ok(created)
			assert.match(path.basename(created.fsPath), /^\d{4}-\d{2}-\d{2}-a-quiet-morning\.md$/)
			assert.equal(await readText(created), "# A Quiet Morning\n\n")
		})

		it("creates an untitled piece when given no name", async () => {
			const created = await api.library.createDraft(undefined)
			assert.ok(created)
			assert.match(path.basename(created.fsPath), /^\d{4}-\d{2}-\d{2}-untitled\.md$/)
		})

		it("never overwrites an existing piece", async () => {
			const first = await api.library.createDraft("Same Name")
			const second = await api.library.createDraft("Same Name")
			assert.ok(first && second)
			assert.notEqual(first.fsPath, second.fsPath)
			assert.ok(await exists(first))
			assert.ok(await exists(second))
		})

		it("fills a template in and keeps the writer's title", async () => {
			const templates = await api.library.listTemplates()
			const essay = templates.find((template) => template.title === "Essay")
			assert.ok(essay)

			const created = await api.library.createDraft("On Silence", essay.uri)
			assert.ok(created)
			const content = await readText(created)
			assert.ok(content.includes("# On Silence"), content)
			assert.ok(!content.includes("{{title}}"), content)
		})

		it("never leaves a placeholder in a template when no name was given", async () => {
			// A blank name is explicitly invited by the prompt.
			const templates = await api.library.listTemplates()
			for (const template of templates) {
				const created = await api.library.createDraft(undefined, template.uri)
				assert.ok(created)
				const content = await readText(created)
				assert.ok(!content.includes("{{"), `${template.title}: ${content}`)
			}
		})

		it("ignores a link pointing outside the library", async () => {
			// A symlink satisfies a path comparison while pointing anywhere on the
			// disk, so it must never be listed or acted on.
			const outside = path.join(os.tmpdir(), `writers-studio-outside-${Date.now()}.md`)
			fs.writeFileSync(outside, "# Somewhere else\n")
			const link = vscode.Uri.joinPath(library, "link.md")
			fs.symlinkSync(outside, link.fsPath)

			try {
				const documents = await api.library.listDocuments()
				assert.ok(!documents.some((entry) => entry.fileName === "link.md"))
				assert.equal(await api.library.isInLibraryResolved(link), false)
			} finally {
				fs.rmSync(link.fsPath, { force: true })
				fs.rmSync(outside, { force: true })
			}
		})

		it("reuses what it already knows about an unchanged piece", async () => {
			// The cache is what stops autosave re-reading the whole library every
			// second while somebody types.
			const created = await api.library.createDraft("Cached")
			assert.ok(created)

			const first = (await api.library.listDocuments()).find(
				(entry) => entry.uri.fsPath === created.fsPath,
			)
			const second = (await api.library.listDocuments()).find(
				(entry) => entry.uri.fsPath === created.fsPath,
			)
			assert.ok(first && second)
			assert.equal(first, second, "an unchanged piece should not be described twice")
		})

		it("renames a piece, keeping its date", async () => {
			const created = await api.library.createDraft("First Name")
			assert.ok(created)
			const renamed = await api.library.renameDocument(created, "Second Name")
			assert.ok(renamed)
			assert.match(path.basename(renamed.fsPath), /^\d{4}-\d{2}-\d{2}-second-name\.md$/)
			assert.ok(!(await exists(created)))
		})

		it("puts the new name into the piece's own heading, which the list shows", async () => {
			// The list titles every piece by its first heading, so a rename that
			// only changed the file name left the old name on screen.
			const created = await api.library.createDraft("Before")
			assert.ok(created)
			const renamed = await api.library.renameDocument(created, "After")
			assert.ok(renamed)

			assert.match(await readText(renamed), /^# After$/m)
			const documents = await api.library.listDocuments()
			const listed = documents.find((entry) => entry.uri.fsPath === renamed.fsPath)
			assert.ok(listed, `${renamed.fsPath} was not listed among ${JSON.stringify(documents.map((d) => d.uri.fsPath))}`)
			assert.equal(listed.title, "After")
		})

		it("renames a piece that has no heading without adding one", async () => {
			const created = await api.library.createDraft(undefined)
			assert.ok(created)
			const renamed = await api.library.renameDocument(created, "Named later")
			assert.ok(renamed)
			assert.equal((await readText(renamed)).includes("#"), false)
		})

		it("changes the heading even when the file name cannot change", async () => {
			// "Quiet morning" and "Quiet Morning" reduce to the same file name, so
			// rewriting the heading is the whole of this rename.
			const created = await api.library.createDraft("Quiet morning")
			assert.ok(created)
			const renamed = await api.library.renameDocument(created, "Quiet Morning!")
			assert.ok(renamed)
			assert.equal(renamed.fsPath, created.fsPath, "the file name should not have needed to change")

			assert.match(await readText(renamed), /^# Quiet Morning!$/m)
			const listed = (await api.library.listDocuments()).find((entry) => entry.uri.fsPath === renamed.fsPath)
			assert.equal(listed?.title, "Quiet Morning!")
		})

		it("duplicates a piece without touching the original", async () => {
			const created = await api.library.createDraft("Original")
			assert.ok(created)
			const copy = await api.library.duplicateDocument(created)
			assert.ok(copy)
			assert.ok(path.basename(copy.fsPath).includes("copy"))
			assert.ok(await exists(created))
			assert.equal(await readText(copy), await readText(created))
		})

		it("moves a piece to a trash folder rather than deleting it", async () => {
			const created = await api.library.createDraft("Throw Away")
			assert.ok(created)
			await api.library.trashDocument(created)

			assert.ok(!(await exists(created)))
			const trashed = vscode.Uri.joinPath(library, "Trash", path.basename(created.fsPath))
			assert.ok(await exists(trashed), "the piece should still be recoverable from the trash")
		})

		it("knows which pieces belong to it", async () => {
			const created = await api.library.createDraft("Mine")
			assert.ok(created)
			assert.ok(api.library.isInLibrary(created))
			assert.ok(!api.library.isInLibrary(vscode.Uri.file(path.join(os.tmpdir(), "somewhere-else.md"))))
		})
	})

	describe("the writing look", () => {
		const watched = [
			"editor.fontSize",
			"editor.lineNumbers",
			"files.autoSave",
			"workbench.colorTheme",
			"editor.wordWrap",
			"files.exclude",
		]

		const snapshotOf = () => {
			const config = vscode.workspace.getConfiguration()
			return watched.map((key) => ({ key, value: config.inspect(key)?.globalValue }))
		}

		afterEach(async () => {
			if (api.profile.isApplied()) {
				await api.profile.restore()
			}
		})

		it("puts every setting back exactly as it was", async () => {
			const before = snapshotOf()

			const applied = await api.profile.apply()
			assert.ok(applied.applied > 0)
			assert.ok(api.profile.isApplied())
			assert.equal(vscode.workspace.getConfiguration().get("editor.lineNumbers"), "off")
			assert.equal(vscode.workspace.getConfiguration().get("files.autoSave"), "afterDelay")

			const result = await api.profile.restore()
			assert.ok(result.hadSnapshot)
			assert.deepEqual(result.failed, [])
			assert.ok(!api.profile.isApplied())

			for (const { key, value } of before) {
				assert.deepEqual(
					vscode.workspace.getConfiguration().inspect(key)?.globalValue,
					value,
					`${key} was not put back`,
				)
			}
		})

		it("records what to undo before it changes anything", async () => {
			// A crash between the first write and the snapshot would otherwise
			// leave changed settings with no record of the originals.
			assert.ok(!api.profile.isApplied())
			const applying = api.profile.apply()
			assert.ok(api.profile.isApplied(), "the snapshot must exist while the writes are still running")
			await applying
		})

		it("keeps the writer's own entries in an object setting", async () => {
			const config = vscode.workspace.getConfiguration()
			const original = config.inspect("files.exclude")?.globalValue
			await config.update("files.exclude", { "**/mine": true }, vscode.ConfigurationTarget.Global)

			try {
				await api.profile.apply()
				const merged = vscode.workspace.getConfiguration().inspect("files.exclude")?.globalValue as
					| Record<string, unknown>
					| undefined
				assert.equal(merged?.["**/mine"], true, "the writer's own entry must survive")
				assert.equal(merged?.["**/.DS_Store"], true, "ours must be added")

				await api.profile.restore()
				assert.deepEqual(vscode.workspace.getConfiguration().inspect("files.exclude")?.globalValue, {
					"**/mine": true,
				})
			} finally {
				await vscode.workspace
					.getConfiguration()
					.update("files.exclude", original, vscode.ConfigurationTarget.Global)
			}
		})

		it("does not record its own values as the writer's when applied twice", async () => {
			// Reinstalling loses the snapshot while the settings remain applied.
			// Capturing then would make the writing look permanent.
			const before = snapshotOf()
			await api.profile.apply()
			await api.profile.forgetSnapshotForTests()
			await api.profile.apply()
			await api.profile.restore()

			for (const { key, value } of before) {
				assert.deepEqual(
					vscode.workspace.getConfiguration().inspect(key)?.globalValue,
					value,
					`${key} was not put back after a lost snapshot`,
				)
			}
		})

		it("does nothing when asked to undo something that was never done", async () => {
			const result = await api.profile.restore()
			assert.equal(result.hadSnapshot, false)
			assert.equal(result.restored, 0)
		})
	})

	describe("focus mode", () => {
		const focusSnapshot = () => {
			const config = vscode.workspace.getConfiguration()
			return FOCUS_MODE_SETTING_KEYS.map((key) => ({ key, value: config.inspect(key)?.globalValue }))
		}

		const assertRestored = (before: { key: string; value: unknown }[]) => {
			for (const { key, value } of before) {
				assert.deepEqual(
					vscode.workspace.getConfiguration().inspect(key)?.globalValue,
					value,
					`${key} was not put back`,
				)
			}
		}

		afterEach(async () => {
			await api.focus.exit()
		})

		it("leaves its temporary settings exactly as it found them", async () => {
			const before = focusSnapshot()

			await api.focus.enter()
			assert.ok(api.focus.isOn())
			assert.equal(vscode.workspace.getConfiguration().get("editor.cursorSurroundingLinesStyle"), "all")

			await api.focus.exit()
			assert.ok(!api.focus.isOn())
			assertRestored(before)
		})

		it("can be entered and left repeatedly", async () => {
			const before = focusSnapshot()
			for (let round = 0; round < 3; round++) {
				await api.focus.enter()
				await api.focus.enter()
				assert.ok(api.focus.isOn())
				await api.focus.exit()
				await api.focus.exit()
				assert.ok(!api.focus.isOn())
			}
			assertRestored(before)
		})

		it("recovers settings left behind by a session that ended badly", async () => {
			// Simulates a crash: the settings are applied and the in-memory state is
			// gone, but the persisted record remains.
			const before = focusSnapshot()
			await api.focus.enter()
			await api.focus.forgetStateForTests()

			await api.focus.recover()
			assertRestored(before)
		})

		it("does not capture its own hidden scrollbars as the writer's setting", async () => {
			// The bug this guards: after an unclean exit, re-entering focus mode used
			// to snapshot "hidden" as the original and make it permanent.
			const before = focusSnapshot()
			await api.focus.enter()
			await api.focus.forgetStateForTests()

			await api.focus.recover()
			await api.focus.enter()
			await api.focus.exit()
			assertRestored(before)
		})
	})
})
