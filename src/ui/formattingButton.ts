import * as vscode from "vscode"
import { strings } from "./strings"

/**
 * A "Formatting" button with its name written on it, at the bottom of the window.
 *
 * The button at the top of the window can only be an icon; VS Code draws no
 * words there. A writer looking for formatting never found it, so this one says
 * what it is. Gated on the writing context like every other control.
 */
export class FormattingButton {
	private readonly item: vscode.StatusBarItem
	private readonly disposables: vscode.Disposable[] = []
	private inWritingContext = false
	private showing = false

	constructor() {
		// Just left of the Focus button, so the writing controls sit together.
		this.item = vscode.window.createStatusBarItem("writersStudio.formatting", vscode.StatusBarAlignment.Right, 101)
		this.item.name = strings.formatting.menuTitle
		this.item.text = `$(text-size) ${strings.formatting.menuTitle}`
		this.item.tooltip = strings.formatting.buttonTooltip
		this.item.command = "writersStudio.showFormattingMenu"
		this.disposables.push(
			this.item,
			vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
		)
		this.refresh()
	}

	/** Told by the extension whether the writer is looking at their writing. */
	setInWritingContext(inWriting: boolean): void {
		this.inWritingContext = inWriting
		this.refresh()
	}

	/** True while the button is on screen. */
	isShowing(): boolean {
		return this.showing
	}

	private refresh(): void {
		// Formatting needs a piece to format, so it shows only while one is open.
		this.showing = this.inWritingContext && vscode.window.activeTextEditor?.document.languageId === "markdown"
		if (this.showing) {
			this.item.show()
		} else {
			this.item.hide()
		}
	}

	dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose()
		}
	}
}
