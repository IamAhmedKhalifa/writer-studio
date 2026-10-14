import { mkdirSync, rmSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { defineConfig } from "@vscode/test-cli"

const here = dirname(fileURLToPath(import.meta.url))

/**
 * A clean settings store for every run.
 *
 * These tests apply and reverse real VS Code settings. Left to accumulate, a run
 * that ended badly would leave the writing look applied, and the next run would
 * read our own values as the writer's "originals" — a false failure that looks
 * exactly like the bug the tests exist to catch. The extensions directory is
 * deliberately left alone so the companion extensions stay cached.
 */
const userDataDir = join(here, ".vscode-test", "user-data")
rmSync(userDataDir, { recursive: true, force: true })

/**
 * The second run opens a folder, because half the writing look is stored in the
 * folder the writing lives in, and with no folder open those settings fall back
 * to the writer's own. The first run could therefore never see a setting VS Code
 * refuses to keep in a folder, nor a restore that wrote into the wrong folder.
 * Its own settings store, so neither run can inherit what the other left behind.
 */
const folderUserDataDir = join(here, ".vscode-test", "user-data-folder")
const writingFolder = join(here, ".vscode-test", "writing-folder")
rmSync(folderUserDataDir, { recursive: true, force: true })
rmSync(writingFolder, { recursive: true, force: true })
mkdirSync(writingFolder, { recursive: true })

const shared = {
	version: "stable",
	// The companions a writer gets: the spell checker, which Writer's Studio
	// cannot activate without, and the optional pack, so the tests see what a
	// writer sees. Installed into the throwaway test instance only.
	installExtensions: [
		"streetsidesoftware.code-spell-checker",
		"yzhang.markdown-all-in-one",
		"streetsidesoftware.code-spell-checker-british-english",
	],
	mocha: {
		ui: "bdd",
		timeout: 60000,
	},
}

export default defineConfig([
	{
		...shared,
		label: "no folder open",
		files: "out/test/*.test.js",
		launchArgs: ["--user-data-dir", userDataDir],
	},
	{
		...shared,
		label: "writing folder open",
		files: "out/test/folder/**/*.test.js",
		workspaceFolder: writingFolder,
		launchArgs: ["--user-data-dir", folderUserDataDir],
	},
])
