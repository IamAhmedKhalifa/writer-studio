import * as vscode from "vscode"
import { strings } from "../ui/strings"
import { ParagraphDimming } from "./paragraphDimming"
import { Typewriter } from "./typewriter"

/**
 * Focus mode: the page moves to the middle of the window, the line being typed
 * stays put, and everything but the current paragraph fades.
 *
 * Entering and leaving are exactly symmetrical. Anything this turns on, it turns
 * off again, including on shutdown — see `shutdown`, which the extension awaits
 * rather than firing and forgetting.
 */
export class FocusMode {
	private on = false
	private centred = false
	private inWritingContext = false
	/** Tail of the changes waiting to run; see `serially`. */
	private queue: Promise<void> = Promise.resolve()

	private readonly typewriter: Typewriter
	private readonly dimming = new ParagraphDimming()
	private readonly statusItem: vscode.StatusBarItem

	constructor(context: vscode.ExtensionContext) {
		this.typewriter = new Typewriter(context)
		this.statusItem = vscode.window.createStatusBarItem(
			"writersStudio.focus",
			vscode.StatusBarAlignment.Right,
			100,
		)
		this.statusItem.name = strings.focus.statusName
		this.statusItem.text = `$(screen-full) ${strings.focus.statusOn}`
		this.statusItem.tooltip = strings.focus.statusTooltip
		this.statusItem.command = "writersStudio.toggleFocusMode"
		// Deliberately not shown yet. Every command and menu item is gated on the
		// writing context so a developer who installs this by accident never sees
		// writing controls while working on code; a button in the status bar that
		// ignored that gate would be the one way in that was left open.
		this.refreshStatusItem()
	}

	isOn(): boolean {
		return this.on
	}

	/** Told by the extension whether the writer is looking at their writing. */
	setInWritingContext(inWriting: boolean): void {
		if (this.inWritingContext === inWriting) {
			return
		}
		this.inWritingContext = inWriting
		this.refreshStatusItem()
	}

	private refreshStatusItem(): void {
		this.statusItem.text = `$(${this.on ? "screen-normal" : "screen-full"}) ${strings.focus.statusOn}`
		// Still shown while focus mode is on even outside the writing context, so
		// there is always a visible way back out of it.
		if (this.inWritingContext || this.on) {
			this.statusItem.show()
		} else {
			this.statusItem.hide()
		}
	}

	/**
	 * Undoes anything a previous session left behind after an unclean shutdown.
	 * Runs on activation, before focus mode can be entered again.
	 */
	recover(): Promise<void> {
		return this.serially(async () => {
			await this.typewriter.recoverFromUncleanExit()
			this.on = false
			this.centred = false
			this.refreshStatusItem()
		})
	}

	/**
	 * Drops the in-memory state while leaving the settings applied, which is what a
	 * crash or a window reload does. Exists so the test suite can prove the
	 * recovery path works.
	 */
	forgetStateForTests(): Promise<void> {
		return this.serially(async () => {
			this.on = false
			this.centred = false
			this.dimming.disable()
			this.refreshStatusItem()
		})
	}

	/**
	 * Runs one change of state at a time, in the order they were asked for.
	 *
	 * Entering and leaving each take several awaited settings writes. Pressing the
	 * shortcut quickly used to start a second change while the first was still
	 * writing: the two interleaved, VS Code turned some writes away, and the
	 * writer was left with hidden scrollbars while focus mode believed itself off.
	 */
	private serially<T>(step: () => Promise<T>): Promise<T> {
		const run = this.queue.then(step, step)
		this.queue = run.then(
			() => undefined,
			() => undefined,
		)
		return run
	}

	toggle(): Promise<void> {
		// Decided when this turn comes up, not when the key was pressed, so ten
		// quick presses alternate cleanly and end where an even number should.
		return this.serially(async () => {
			if (this.on) {
				const restored = await this.exitNow()
				if (restored) {
					void vscode.window.setStatusBarMessage(strings.focus.off, 2000)
				}
				return
			}
			await this.enterNow()
			void vscode.window.setStatusBarMessage(strings.focus.on, 2000)
		})
	}

	enter(): Promise<void> {
		return this.serially(() => this.enterNow())
	}

	async exit(): Promise<void> {
		await this.serially(() => this.exitNow())
	}

	private async enterNow(): Promise<void> {
		if (this.on) {
			return
		}
		this.on = true

		await this.typewriter.enable()
		this.dimming.enable()

		if (vscode.workspace.getConfiguration("writersStudio.focus").get("centerLayout", true)) {
			// VS Code exposes no way to read whether the layout is already
			// centred, so this is tracked here and undone symmetrically on exit.
			await this.runCommand("workbench.action.toggleCenteredLayout")
			this.centred = true
		}

		this.refreshStatusItem()
	}

	/** Returns false when the screen could not be fully put back. */
	private async exitNow(): Promise<boolean> {
		if (!this.on) {
			return true
		}
		this.on = false

		this.dimming.disable()
		const restored = await this.typewriter.disable()

		if (this.centred) {
			await this.runCommand("workbench.action.toggleCenteredLayout")
			this.centred = false
		}

		this.refreshStatusItem()

		if (!restored) {
			// The record is kept, so the next start finishes the job; the writer
			// is told rather than left wondering where their scrollbars went.
			void vscode.window.showWarningMessage(strings.focus.notFullyRestored)
		}
		return restored
	}

	/**
	 * Leaves focus mode on the way out, and is awaited by `deactivate`.
	 *
	 * This used to live in `dispose`, which cannot be awaited, so the settings
	 * restore raced the extension host shutting down and frequently lost.
	 */
	async shutdown(): Promise<void> {
		await this.exit()
	}

	dispose(): void {
		this.dimming.dispose()
		this.statusItem.dispose()
	}

	private async runCommand(command: string): Promise<void> {
		try {
			await vscode.commands.executeCommand(command)
		} catch {
			// A missing workbench command must not break focus mode.
		}
	}
}
