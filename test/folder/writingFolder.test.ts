import * as assert from "node:assert/strict"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import * as vscode from "vscode"
import type { InternalApi } from "../../src/extension"

const EXTENSION_ID = "ahmed-khalifa.writers-studio"

/**
 * Runs with a folder open, standing in for the writer's writing folder, so the
 * half of the writing look that lives in that folder is really written there.
 */
describe("Writer's Studio, with the writing folder open", () => {
	let api: InternalApi
	let folder: vscode.Uri
	let settingsFile: vscode.Uri

	/** Settings that live in the writer's own settings, not the folder. */
	const everywhere = ["editor.fontSize", "workbench.colorTheme", "files.autoSave", "cSpell.spellCheckDelayMs"]
	/** Settings that live in the writing folder. */
	const inTheFolder = ["editor.lineNumbers", "editor.wordWrap", "files.exclude", "window.title"]

	const globalValues = () =>
		everywhere.map((key) => ({ key, value: vscode.workspace.getConfiguration().inspect(key)?.globalValue }))
	const folderValue = (key: string) => vscode.workspace.getConfiguration().inspect(key)?.workspaceValue

	const assertGlobalsAre = (expected: { key: string; value: unknown }[], why: string) => {
		for (const { key, value } of expected) {
			assert.deepEqual(vscode.workspace.getConfiguration().inspect(key)?.globalValue, value, `${key} ${why}`)
		}
	}

	const settingsFileExists = () => fs.existsSync(settingsFile.fsPath)

	before(async () => {
		const extension = vscode.extensions.getExtension<InternalApi>(EXTENSION_ID)
		assert.ok(extension, `extension ${EXTENSION_ID} was not found`)
		api = await extension.activate()

		const open = vscode.workspace.workspaceFolders?.[0]
		assert.ok(open, "this suite must run with a folder open")
		folder = open.uri
		settingsFile = vscode.Uri.joinPath(folder, ".vscode", "settings.json")
		await api.library.setLibraryUri(folder)

		if (api.profile.isApplied()) {
			await api.profile.restore()
		}
	})

	afterEach(async () => {
		api.profile.stopPretendingForTests()
		if (api.profile.isApplied()) {
			await api.profile.restore()
		}
	})

	it("applies every setting, including those that live in the folder", async () => {
		// A setting VS Code refuses to keep in a folder used to fail silently here,
		// and every apply and restore then reported one it could not change.
		const result = await api.profile.apply()
		assert.deepEqual(result.skipped, [])
		assert.equal(folderValue("editor.lineNumbers"), "off")
		assert.equal(vscode.workspace.getConfiguration().inspect("cSpell.spellCheckDelayMs")?.globalValue, 500)

		const restored = await api.profile.restore()
		assert.deepEqual(restored.failed, [])
		assert.equal(restored.waiting, 0)
		assert.ok(!api.profile.isApplied())
	})

	it("leaves the folder exactly as it found it", async () => {
		assert.ok(!settingsFileExists(), "the folder should start without a settings file")

		await api.profile.apply()
		assert.ok(settingsFileExists())

		await api.profile.restore()
		for (const key of inTheFolder) {
			assert.equal(folderValue(key), undefined, `${key} was left in the folder`)
		}
		assert.ok(!settingsFileExists(), "the settings file the look created should be gone")
		assert.ok(!fs.existsSync(path.join(folder.fsPath, ".vscode")), "and so should its empty folder")
	})

	it("keeps a settings file the writer already had", async () => {
		const config = vscode.workspace.getConfiguration()
		await config.update("editor.tabSize", 3, vscode.ConfigurationTarget.Workspace)
		try {
			await api.profile.apply()
			await api.profile.restore()

			assert.ok(settingsFileExists())
			assert.equal(folderValue("editor.tabSize"), 3, "the writer's own folder setting must survive")
			assert.equal(folderValue("editor.lineNumbers"), undefined)
		} finally {
			await vscode.workspace
				.getConfiguration()
				.update("editor.tabSize", undefined, vscode.ConfigurationTarget.Workspace)
			fs.rmSync(path.join(folder.fsPath, ".vscode"), { recursive: true, force: true })
		}
	})

	it("does not undo the writing folder's look from a window showing something else", async () => {
		// The bug this guards: restoring from a code project's window "put back"
		// the writing folder's settings into the code project, recorded them as
		// done, and left the writing folder changed with no way back.
		const before = globalValues()
		await api.profile.apply()

		api.profile.pretendFolderIsOpenForTests(vscode.Uri.file(path.join(os.tmpdir(), "a-code-project")))
		const fromElsewhere = await api.profile.restore()

		assert.ok(fromElsewhere.waiting > 0, "the folder's own settings should be waiting")
		assert.deepEqual(fromElsewhere.failed, [])
		assert.ok(api.profile.isApplied(), "what is still to do must stay on record")
		assert.equal(folderValue("editor.lineNumbers"), "off", "nothing may be written to the folder from elsewhere")
		assertGlobalsAre(before, "should already be back")

		api.profile.stopPretendingForTests()
		const fromTheFolder = await api.profile.restore()

		assert.equal(fromTheFolder.waiting, 0)
		assert.deepEqual(fromTheFolder.failed, [])
		assert.ok(!api.profile.isApplied())
		for (const key of inTheFolder) {
			assert.equal(folderValue(key), undefined, `${key} was left in the folder`)
		}
		assert.ok(!settingsFileExists())
	})

	it("can turn the look back on after a restore that is only half done", async () => {
		// Re-applying used to reuse the half-finished record as it stood, so the
		// settings already put back were changed again with nothing to undo them.
		const before = globalValues()
		await api.profile.apply()

		api.profile.pretendFolderIsOpenForTests(undefined)
		await api.profile.restore()
		api.profile.stopPretendingForTests()

		await api.profile.apply()
		const result = await api.profile.restore()

		assert.equal(result.waiting, 0)
		assert.deepEqual(result.failed, [])
		assertGlobalsAre(before, "was not put back after re-applying")
		assert.equal(folderValue("editor.lineNumbers"), undefined)
	})

	it("underlines the other spelling in a piece, not the writer's own", async () => {
		// Asked of the spell checker itself, so this proves the value written is
		// one the British dictionary answers to. Not "colour"/"color": the spell
		// checker always accepts "color", a word from its CSS dictionary. It
		// underlines each of these under the other spelling.
		const file = vscode.Uri.joinPath(folder, "neighbours.md")
		await vscode.workspace.fs.writeFile(file, new TextEncoder().encode("The neighbour and the neighbor.\n"))
		let last = ""
		const flagged = async () => {
			last = (await spellingIssues(file)).filter((word) => word === "neighbour" || word === "neighbor").join()
			return last
		}
		const seen = () =>
			JSON.stringify({ language: vscode.workspace.getConfiguration().inspect("cSpell.language"), flagged: last })
		try {
			await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file))

			await api.spelling.remember("british")
			await api.profile.apply()
			assert.equal(folderValue("cSpell.language"), "en-GB", "spelling belongs to the writing folder")
			await waitFor(async () => (await flagged()) === "neighbor", 20000, seen)

			await api.spelling.remember("american")
			await api.profile.apply({ only: ["cSpell.language"] })
			await waitFor(async () => (await flagged()) === "neighbour", 20000, seen)
		} finally {
			await vscode.commands.executeCommand("workbench.action.closeAllEditors")
			await api.spelling.forgetForTests()
			fs.rmSync(file.fsPath, { force: true })
		}
	})

	it("underlines a misspelling without VS Code's problem hover", async () => {
		// A problem's hover showed "cSpell", "View Problem" and "Quick Fix…". With
		// the writing look on, the spell checker draws its own underline instead,
		// so the misspelling is found but is not a problem.
		const file = vscode.Uri.joinPath(folder, "misspelt.md")
		await vscode.workspace.fs.writeFile(file, new TextEncoder().encode("I did not recieve it.\n"))
		try {
			await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file))
			await waitFor(async () => vscode.languages.getDiagnostics(file).length > 0, 20000, () => "no problem reported before the look")

			await api.profile.apply()
			await waitFor(async () => vscode.languages.getDiagnostics(file).length === 0, 20000, () =>
				JSON.stringify(vscode.languages.getDiagnostics(file).map((d) => `${d.source}: ${d.message}`)),
			)
			assert.deepEqual(await spellingIssues(file), ["recieve"], "the misspelling must still be found")
		} finally {
			await vscode.commands.executeCommand("workbench.action.closeAllEditors")
			fs.rmSync(file.fsPath, { force: true })
		}
	})
})

/** The words the spell checker flags in `file`, asked of it directly. */
async function spellingIssues(file: vscode.Uri): Promise<string[]> {
	const spellChecker = vscode.extensions.getExtension<{
		checkDocument(document: { uri: string }): Promise<{ issues?: { text: string }[] }>
	}>("streetsidesoftware.code-spell-checker")
	assert.ok(spellChecker, "the spell checker is not installed")
	const result = await (await spellChecker.activate()).checkDocument({ uri: file.toString() })
	return (result.issues ?? []).map((issue) => issue.text)
}

/** Polls `condition` until it holds, failing after `timeoutMs` with what was seen. */
async function waitFor(condition: () => Promise<boolean>, timeoutMs: number, seen: () => string): Promise<void> {
	const deadline = Date.now() + timeoutMs
	while (!(await condition())) {
		assert.ok(Date.now() < deadline, `still waiting after ${timeoutMs} ms: ${seen()}`)
		await new Promise((resolve) => setTimeout(resolve, 100))
	}
}
