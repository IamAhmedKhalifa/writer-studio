import * as vscode from "vscode"
import { strings } from "../ui/strings"
import { computeStats, countWords, readingMinutes } from "./wordCount"

/** Long enough that typing never feels heavy, short enough to feel live. */
const DEBOUNCE_MS = 250

/**
 * Shows words and reading time at the bottom of the window, for the piece the
 * writer is looking at. When text is selected, it counts the selection instead,
 * which is what writers expect when checking the length of a section.
 */
export class WritingStatusBar {
	private readonly item: vscode.StatusBarItem
	private readonly disposables: vscode.Disposable[] = []
	private timer: NodeJS.Timeout | undefined

	/**
	 * The last count, keyed by document and version. Moving the cursor around a
	 * long piece used to recount every word in it several times a second for a
	 * number that could not have changed.
	 */
	private counted: { key: string; words: number } | undefined

	/** Whether the previous update was showing a selection count. */
	private hadSelection = false

	/**
	 * Whether the writer is looking at their own writing.
	 *
	 * Without this the count appeared on any Markdown file anywhere, so a
	 * developer editing a README in an unrelated project got a writing app's word
	 * count in their status bar. Everything else this extension shows is gated on
	 * the same context.
	 */
	private inWritingContext = false

	constructor() {
		this.item = vscode.window.createStatusBarItem("writersStudio.stats", vscode.StatusBarAlignment.Left, 100)
		this.item.name = strings.library.viewTitle
		this.item.tooltip = strings.stats.tooltip
		this.item.command = "writersStudio.showStatsDetail"

		this.disposables.push(
			this.item,
			vscode.window.onDidChangeActiveTextEditor(() => this.scheduleUpdate()),
			vscode.window.onDidChangeTextEditorSelection((event) => {
				if (event.textEditor !== vscode.window.activeTextEditor) {
					return
				}
				// Only the presence of a selection changes what is displayed, so
				// plain cursor movement is ignored entirely.
				const hasSelection = event.selections.some((selection) => !selection.isEmpty)
				if (hasSelection || this.hadSelection) {
					this.scheduleUpdate()
				}
			}),
			vscode.workspace.onDidChangeTextDocument((event) => {
				if (event.document === vscode.window.activeTextEditor?.document) {
					this.scheduleUpdate()
				}
			}),
			vscode.workspace.onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration("writersStudio")) {
					this.scheduleUpdate()
				}
			}),
		)

		this.update()
	}

	/** Told by the extension whether the writer is looking at their writing. */
	setInWritingContext(inWriting: boolean): void {
		if (this.inWritingContext === inWriting) {
			return
		}
		this.inWritingContext = inWriting
		this.update()
	}

	dispose(): void {
		if (this.timer) {
			clearTimeout(this.timer)
		}
		for (const disposable of this.disposables) {
			disposable.dispose()
		}
	}

	private scheduleUpdate(): void {
		if (this.timer) {
			clearTimeout(this.timer)
		}
		this.timer = setTimeout(() => {
			this.timer = undefined
			this.update()
		}, DEBOUNCE_MS)
	}

	private update(): void {
		const editor = vscode.window.activeTextEditor
		const settings = vscode.workspace.getConfiguration("writersStudio")

		if (
			!this.inWritingContext ||
			!editor ||
			editor.document.languageId !== "markdown" ||
			!settings.get("showStatusBarCount", true)
		) {
			this.item.hide()
			return
		}

		const selectedText = editor.selections
			.filter((selection) => !selection.isEmpty)
			.map((selection) => editor.document.getText(selection))
			.join("\n")

		if (selectedText.length > 0) {
			this.hadSelection = true
			this.item.text = strings.stats.statusTextSelection(countWords(selectedText))
			this.item.show()
			return
		}

		this.hadSelection = false
		const words = this.countDocument(editor.document)
		const minutes = readingMinutes(words, settings.get("wordsPerMinute", 200))
		this.item.text = strings.stats.statusText(words, minutes)
		this.item.show()
	}

	/** Counts the document, reusing the answer while its version is unchanged. */
	private countDocument(document: vscode.TextDocument): number {
		const key = `${document.uri.toString()}@${document.version}`
		if (this.counted?.key === key) {
			return this.counted.words
		}
		const words = countWords(document.getText())
		this.counted = { key, words }
		return words
	}

	/** The detail panel behind a click on the count. */
	async showDetail(): Promise<void> {
		const editor = vscode.window.activeTextEditor
		if (!editor || editor.document.languageId !== "markdown") {
			void vscode.window.showInformationMessage(strings.handoff.nothingOpen)
			return
		}

		const stats = computeStats(editor.document.getText())
		const minutes = readingMinutes(
			stats.words,
			vscode.workspace.getConfiguration("writersStudio").get("wordsPerMinute", 200),
		)

		await vscode.window.showInformationMessage(strings.stats.detailTitle, {
			modal: true,
			detail: strings.stats.detail(
				stats.words,
				stats.characters,
				stats.charactersNoSpaces,
				stats.paragraphs,
				minutes,
			),
		})
	}
}
