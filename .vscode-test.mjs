import { rmSync } from "node:fs"
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

export default defineConfig({
	files: "out/test/**/*.test.js",
	version: "stable",
	// The two companion extensions are declared as dependencies in package.json,
	// so VS Code refuses to activate without them. They are installed into the
	// throwaway test instance rather than disabled.
	installExtensions: ["streetsidesoftware.code-spell-checker", "yzhang.markdown-all-in-one"],
	launchArgs: ["--user-data-dir", userDataDir],
	mocha: {
		ui: "bdd",
		timeout: 60000,
	},
})
