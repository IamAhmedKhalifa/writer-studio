import * as vscode from "vscode"
import { FOCUS_MODE_SETTING_KEYS, FocusModeSettingKey } from "../profile/settingsCatalog"

const SNAPSHOT_KEY = "writersStudio.focusSnapshot"

type FocusSnapshot = Partial<Record<FocusModeSettingKey, unknown>>

/**
 * Typewriter scrolling: the line being written stays in a comfortable place on
 * screen instead of sliding to the bottom of the window.
 *
 * This uses VS Code's own `cursorSurroundingLines` support rather than moving
 * the viewport by hand. Custom scrolling fights the editor's own smooth
 * scrolling, misbehaves with wrapped lines, and breaks keyboard selection; the
 * built-in setting does the same job with none of that risk.
 *
 * The settings it changes are global, so the values they replaced are written to
 * disk before anything is touched. Holding them only in memory meant that a
 * crash, a window reload, or a shutdown that did not wait for the restore left
 * the writer with permanently hidden scrollbars and no record of what they had
 * before — and re-entering focus mode would then capture "hidden" as their own
 * setting and make it permanent.
 */
export class Typewriter {
	constructor(private readonly context: vscode.ExtensionContext) {}

	/**
	 * Puts back anything left behind by a previous session that ended badly.
	 * Called once on activation, before focus mode can be entered again.
	 */
	async recoverFromUncleanExit(): Promise<boolean> {
		if (!this.context.globalState.get<FocusSnapshot>(SNAPSHOT_KEY)) {
			return false
		}
		await this.disable()
		return true
	}

	async enable(): Promise<void> {
		// Typewriter scrolling is a settings change, so it waits for a folder the
		// writer has vouched for. Focus mode's fading still works without it.
		if (!vscode.workspace.isTrusted) {
			return
		}

		// Already on: re-capturing now would record our own values as the
		// writer's.
		if (this.context.globalState.get<FocusSnapshot>(SNAPSHOT_KEY)) {
			return
		}

		const config = vscode.workspace.getConfiguration()
		const snapshot: FocusSnapshot = {}
		for (const key of FOCUS_MODE_SETTING_KEYS) {
			snapshot[key] = config.inspect(key)?.globalValue
		}

		// Persisted before the first change, so there is always a way back.
		await this.context.globalState.update(SNAPSHOT_KEY, snapshot)

		const lines = vscode.workspace.getConfiguration("writersStudio.focus").get("typewriterLines", 12)
		await this.write({
			"editor.cursorSurroundingLines": lines,
			"editor.cursorSurroundingLinesStyle": "all",
			"editor.scrollbar.vertical": "hidden",
			"editor.scrollbar.horizontal": "hidden",
		})
	}

	async disable(): Promise<void> {
		const snapshot = this.context.globalState.get<FocusSnapshot>(SNAPSHOT_KEY)
		if (!snapshot) {
			return
		}

		const config = vscode.workspace.getConfiguration()
		let allRestored = true
		for (const key of FOCUS_MODE_SETTING_KEYS) {
			try {
				await config.update(key, snapshot[key], vscode.ConfigurationTarget.Global)
			} catch {
				allRestored = false
			}
		}

		// Kept on failure so the next activation can finish the job.
		if (allRestored) {
			await this.context.globalState.update(SNAPSHOT_KEY, undefined)
		}
	}

	private async write(values: Record<FocusModeSettingKey, unknown>): Promise<void> {
		const config = vscode.workspace.getConfiguration()
		for (const [key, value] of Object.entries(values)) {
			try {
				await config.update(key, value, vscode.ConfigurationTarget.Global)
			} catch {
				// Skip rather than fail the whole of focus mode.
			}
		}
	}
}
