import * as vscode from "vscode"
import { findParagraph } from "./paragraph"

/** Short enough to feel immediate, long enough not to run on every keystroke. */
const DEBOUNCE_MS = 80

/**
 * Fades every paragraph except the one being written in.
 *
 * This is the one visual flourish that can misbehave, so it is switched off for
 * very long documents and can be turned off entirely in the settings.
 */
export class ParagraphDimming {
	private decoration: vscode.TextEditorDecorationType | undefined
	private readonly disposables: vscode.Disposable[] = []
	private timer: NodeJS.Timeout | undefined
	private active = false

	enable(): void {
		if (this.active) {
			return
		}
		this.active = true
		this.createDecoration()

		this.disposables.push(
			vscode.window.onDidChangeTextEditorSelection((event) => this.schedule(event.textEditor)),
			vscode.window.onDidChangeActiveTextEditor((editor) => this.schedule(editor)),
			vscode.workspace.onDidChangeTextDocument((event) => {
				const editor = vscode.window.activeTextEditor
				if (editor && event.document === editor.document) {
					this.schedule(editor)
				}
			}),
			vscode.workspace.onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration("writersStudio.focus")) {
					this.createDecoration()
					this.schedule(vscode.window.activeTextEditor)
				}
			}),
		)

		this.apply(vscode.window.activeTextEditor)
	}

	disable(): void {
		this.active = false
		if (this.timer) {
			clearTimeout(this.timer)
			this.timer = undefined
		}
		for (const disposable of this.disposables) {
			disposable.dispose()
		}
		this.disposables.length = 0
		// Disposing the decoration type removes it from every editor at once.
		this.decoration?.dispose()
		this.decoration = undefined
	}

	dispose(): void {
		this.disable()
	}

	private createDecoration(): void {
		this.decoration?.dispose()
		const opacity = vscode.workspace.getConfiguration("writersStudio.focus").get("dimOpacity", 0.4)
		const clamped = Math.min(Math.max(opacity, 0.05), 1)
		this.decoration = vscode.window.createTextEditorDecorationType({
			opacity: `${clamped}`,
			isWholeLine: false,
		})
	}

	private schedule(editor: vscode.TextEditor | undefined): void {
		if (!this.active) {
			return
		}
		if (this.timer) {
			clearTimeout(this.timer)
		}
		this.timer = setTimeout(() => {
			this.timer = undefined
			this.apply(editor ?? vscode.window.activeTextEditor)
		}, DEBOUNCE_MS)
	}

	private apply(editor: vscode.TextEditor | undefined): void {
		if (!this.active || !this.decoration || !editor) {
			return
		}

		const settings = vscode.workspace.getConfiguration("writersStudio.focus")
		if (!settings.get("dimParagraphs", true)) {
			editor.setDecorations(this.decoration, [])
			return
		}

		const document = editor.document
		if (document.languageId !== "markdown") {
			editor.setDecorations(this.decoration, [])
			return
		}

		// A guard rather than a slow editor: very long pieces are left alone.
		// Measured through the document's own offsets, because `getText()` would
		// build a copy of the whole document on every keystroke just to read its
		// length.
		const lastLine = document.lineCount - 1
		const characters = document.offsetAt(document.lineAt(lastLine).range.end)
		if (characters > settings.get("maxCharactersForDimming", 200000)) {
			editor.setDecorations(this.decoration, [])
			return
		}

		// Walked outward from the cursor rather than materialising every line: the
		// paragraph is a handful of lines even when the piece is thousands.
		const paragraph = findParagraph(
			(line) => (line >= 0 && line <= lastLine ? document.lineAt(line).text : undefined),
			editor.selection.active.line,
			document.lineCount,
		)
		if (!paragraph) {
			editor.setDecorations(this.decoration, [])
			return
		}

		const ranges: vscode.Range[] = []
		if (paragraph.startLine > 0) {
			ranges.push(new vscode.Range(0, 0, paragraph.startLine - 1, Number.MAX_SAFE_INTEGER))
		}
		if (paragraph.endLine < lastLine) {
			ranges.push(new vscode.Range(paragraph.endLine + 1, 0, lastLine, Number.MAX_SAFE_INTEGER))
		}

		editor.setDecorations(this.decoration, ranges)
	}
}
