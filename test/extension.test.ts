import * as assert from "node:assert/strict"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import * as vscode from "vscode"
import type { InternalApi } from "../src/extension"
import { FOCUS_MODE_SETTING_KEYS, WRITER_SETTINGS } from "../src/profile/settingsCatalog"

const EXTENSION_ID = "ahmed-khalifa.writers-studio"

/** A throwaway library so tests never touch a real person's writing. */
function makeTemporaryLibrary(): vscode.Uri {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "writers-studio-test-"))
	return vscode.Uri.file(directory)
}

async function readText(uri: vscode.Uri): Promise<string> {
	return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))
}

/** Polls `condition` until it holds, failing after `timeoutMs`. */
async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs
	while (!condition()) {
		assert.ok(Date.now() < deadline, `still waiting after ${timeoutMs} ms`)
		await new Promise((resolve) => setTimeout(resolve, 50))
	}
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

		it("only puts commands that exist in its menus", async () => {
			// Menus may name another extension's command, as the right-click menu
			// does for spelling suggestions; a misspelled one would never appear.
			const manifest = vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON as {
				contributes: { menus: Record<string, { command: string }[]> }
			}
			const registered = new Set(await vscode.commands.getCommands(true))
			const missing = Object.values(manifest.contributes.menus)
				.flat()
				.map((entry) => entry.command)
				.filter((command) => !registered.has(command))
			assert.deepEqual(missing, [], `not registered: ${missing.join(", ")}`)
		})

		it("puts its right-click entries first, spelling suggestions at the top", () => {
			// Anywhere but the first group, they sat under two dozen programming
			// items where a writer could not find them.
			const manifest = vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON as {
				contributes: { menus: { "editor/context": { command: string; group: string }[] } }
			}
			const entries = manifest.contributes.menus["editor/context"]
			for (const entry of entries) {
				assert.match(entry.group, /^navigation@0\.\d+$/, `${entry.command} is not at the top`)
			}
			const first = [...entries].sort((a, b) => a.group.localeCompare(b.group))[0]
			assert.equal(first.command, "cSpell.suggestSpellingCorrections")
		})
	})

	describe("a folder the writer has not trusted", () => {
		// The test runner always switches Workspace Trust off, so nothing here can
		// open an untrusted folder. What decides whether the app runs there is in
		// the manifests, so that is what these read.
		type Manifest = {
			extensionDependencies?: string[]
			capabilities?: { untrustedWorkspaces?: { supported?: boolean | string } }
		}
		const runsUntrusted = (manifest: Manifest | undefined) => {
			const supported = manifest?.capabilities?.untrustedWorkspaces?.supported
			return supported === true || supported === "limited"
		}

		it("says it can run there", () => {
			const manifest = vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON as Manifest
			assert.ok(runsUntrusted(manifest))
		})

		it("depends on nothing that is switched off there", () => {
			// VS Code switches off every extension that depends on one it has
			// switched off. Requiring the Markdown companion, which cannot run
			// there, left the writer with plain VS Code and no explanation.
			const manifest = vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON as Manifest
			for (const id of manifest.extensionDependencies ?? []) {
				const dependency = vscode.extensions.getExtension(id)
				assert.ok(dependency, `${id} is not installed`)
				assert.ok(runsUntrusted(dependency.packageJSON as Manifest), `${id} does not run in an untrusted folder`)
			}
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

		it("lists what is in the trash, and puts it back", async () => {
			const created = await api.library.createDraft("Back Again")
			assert.ok(created)
			const trashed = await api.library.trashDocument(created)
			assert.ok(trashed)

			assert.ok((await api.library.listTrash()).some((entry) => entry.uri.fsPath === trashed.fsPath))
			assert.ok(!(await api.library.listDocuments()).some((entry) => entry.uri.fsPath === created.fsPath))

			const back = await api.library.restoreFromTrash(trashed)
			assert.ok(back)
			assert.equal(back.fsPath, created.fsPath, "it should return under its own name")
			assert.ok(await exists(back))
			assert.ok(!(await exists(trashed)))
			assert.equal((await api.library.listTrash()).length, 0)
		})

		it("puts a piece back without writing over one with the same name", async () => {
			const first = await api.library.createDraft("Twice")
			assert.ok(first)
			await vscode.workspace.fs.writeFile(first, new TextEncoder().encode("# Twice\n\nThe first.\n"))
			const trashed = await api.library.trashDocument(first)
			assert.ok(trashed)

			const second = await api.library.createDraft("Twice")
			assert.ok(second)
			assert.equal(second.fsPath, first.fsPath, "the name was free again, so it is reused")

			const back = await api.library.restoreFromTrash(trashed)
			assert.ok(back)
			assert.notEqual(back.fsPath, second.fsPath)
			assert.equal(await readText(back), "# Twice\n\nThe first.\n")
			assert.equal(await readText(second), "# Twice\n\n")
		})

		it("only ever puts back something that is in the trash", async () => {
			const created = await api.library.createDraft("Not Trashed")
			assert.ok(created)
			assert.equal(await api.library.restoreFromTrash(created), undefined)
			assert.ok(await exists(created))
		})

		it("knows which pieces belong to it", async () => {
			const created = await api.library.createDraft("Mine")
			assert.ok(created)
			assert.ok(api.library.isInLibrary(created))
			assert.ok(!api.library.isInLibrary(vscode.Uri.file(path.join(os.tmpdir(), "somewhere-else.md"))))
		})

		describe("saving on its own", () => {
			// Without the writing look, VS Code's own autosave is off. These prove
			// pieces are saved anyway, which is what was promised.
			beforeEach(() => {
				assert.equal(vscode.workspace.getConfiguration("files").get("autoSave"), "off")
			})

			afterEach(async () => {
				await vscode.commands.executeCommand("workbench.action.closeAllEditors")
			})

			const type = async (document: vscode.TextDocument, text: string) => {
				const edit = new vscode.WorkspaceEdit()
				edit.insert(document.uri, document.lineAt(document.lineCount - 1).range.end, text)
				assert.ok(await vscode.workspace.applyEdit(edit))
				assert.ok(document.isDirty)
			}

			it("saves the piece being written a moment after typing stops", async () => {
				const created = await api.library.createDraft("Saved By Itself")
				assert.ok(created)
				const document = await vscode.workspace.openTextDocument(created)
				await vscode.window.showTextDocument(document)
				await type(document, "Words worth keeping.")

				await waitFor(() => !document.isDirty, 5000)
				assert.match(await readText(created), /Words worth keeping\.$/)
			})

			it("saves an open piece that is not the one on screen", async () => {
				const created = await api.library.createDraft("Behind The Scenes")
				assert.ok(created)
				const document = await vscode.workspace.openTextDocument(created)
				await type(document, "Typed elsewhere.")

				await waitFor(() => !document.isDirty, 5000)
				assert.match(await readText(created), /Typed elsewhere\.$/)
			})

			it("leaves files outside the writing folder to the writer's own saving", async () => {
				const outside = makeTemporaryLibrary()
				const file = vscode.Uri.joinPath(outside, "notes.md")
				await vscode.workspace.fs.writeFile(file, new TextEncoder().encode("# Notes\n"))
				try {
					const document = await vscode.workspace.openTextDocument(file)
					await vscode.window.showTextDocument(document)
					await type(document, "Not ours to save.")

					await new Promise((resolve) => setTimeout(resolve, 2500))
					assert.ok(document.isDirty, "a file outside the writing folder was saved")
					assert.equal(await readText(file), "# Notes\n")
					await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor")
				} finally {
					fs.rmSync(outside.fsPath, { recursive: true, force: true })
				}
			})
		})
	})

	describe("the settings catalog", () => {
		it("never puts in the writing folder a setting that cannot live in a folder", () => {
			// VS Code refuses a folder-level write of a setting declared
			// application- or machine-wide. This one slipped through for the spell
			// checker's delay, so its 50 ms default kept underlining half-typed words.
			const declared = new Map<string, string>()
			for (const extension of vscode.extensions.all) {
				const configuration = (extension.packageJSON as { contributes?: { configuration?: unknown } })
					.contributes?.configuration
				const sections = (Array.isArray(configuration) ? configuration : [configuration]) as {
					properties?: Record<string, { scope?: string }>
				}[]
				for (const section of sections) {
					for (const [key, spec] of Object.entries(section?.properties ?? {})) {
						declared.set(key, spec.scope ?? "window")
					}
				}
			}

			const offenders = WRITER_SETTINGS.filter(
				(setting) => setting.scope === "library" && ["application", "machine"].includes(declared.get(setting.key) ?? ""),
			).map((setting) => `${setting.key} (${declared.get(setting.key)})`)
			assert.deepEqual(offenders, [])
		})

		it("only marks as newer settings this VS Code really has", () => {
			// Otherwise the mark would quietly skip a misspelled key for ever.
			const config = vscode.workspace.getConfiguration()
			const unknown = WRITER_SETTINGS.filter(
				(setting) => setting.newerVSCodeOnly && config.inspect(setting.key)?.defaultValue === undefined,
			).map((setting) => setting.key)
			assert.deepEqual(unknown, [])
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
			// Anything refused here is reported to the writer as a setting that
			// "could not be changed", on every setup.
			assert.deepEqual(applied.skipped, [])
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

		describe("spelling", () => {
			const language = () => vscode.workspace.getConfiguration().inspect("cSpell.language")?.globalValue

			afterEach(async () => {
				await api.spelling.forgetForTests()
			})

			it("has the British dictionary it needs installed alongside", () => {
				assert.ok(api.spelling.britishAvailable())
			})

			it("leaves the spelling language alone until the writer has answered", async () => {
				const before = language()
				await api.profile.apply()
				assert.deepEqual(language(), before)
			})

			it("spells the British way once the writer says so, and undoes it", async () => {
				const before = language()
				await api.spelling.remember("british")
				const result = await api.profile.apply()
				assert.deepEqual(result.skipped, [])
				assert.equal(language(), "en-GB")

				await api.profile.restore()
				assert.deepEqual(language(), before)
			})

			it("never writes over a spelling language the writer chose themselves", async () => {
				await api.spelling.remember("theirs")
				const before = language()
				await api.profile.apply()
				assert.deepEqual(language(), before)
			})

			it("changes only the spelling when the answer changes", async () => {
				const config = () => vscode.workspace.getConfiguration()
				const originalSize = config().inspect("editor.fontSize")?.globalValue
				await api.spelling.remember("british")
				await api.profile.apply()
				// The writer adjusts the page after setting it up.
				await config().update("editor.fontSize", 21, vscode.ConfigurationTarget.Global)

				await api.spelling.remember("american")
				const result = await api.profile.apply({ only: ["cSpell.language"] })
				assert.equal(result.applied, 1)
				assert.equal(language(), "en")
				assert.equal(config().inspect("editor.fontSize")?.globalValue, 21, "the writer's own change was reset")

				await api.profile.restore()
				assert.deepEqual(config().inspect("editor.fontSize")?.globalValue, originalSize)
			})

			it("never switches the look on by adjusting part of it", async () => {
				await api.spelling.remember("british")
				const before = language()
				const result = await api.profile.apply({ only: ["cSpell.language"] })
				assert.equal(result.applied, 0)
				assert.ok(!api.profile.isApplied())
				assert.deepEqual(language(), before)
			})
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

		it("survives being switched on and off quickly", async () => {
			// The bug this guards: ten quick presses of the shortcut left the
			// scrollbars hidden while focus mode believed itself off, because each
			// press started before the last had finished writing its settings.
			const before = focusSnapshot()

			await Promise.all(Array.from({ length: 10 }, () => api.focus.toggle()))
			assert.ok(!api.focus.isOn(), "an even number of presses should end with focus mode off")
			assertRestored(before)

			await Promise.all(Array.from({ length: 11 }, () => api.focus.toggle()))
			assert.ok(api.focus.isOn(), "an odd number of presses should end with focus mode on")
			assert.equal(vscode.workspace.getConfiguration().get("editor.scrollbar.vertical"), "hidden")

			await api.focus.exit()
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
