import * as vscode from "vscode"
import { frontMatterEndLine } from "../markdown/markdownText"
import {
	buildLink,
	buildTable,
	normaliseUrl,
	setHeadingLevelForLines,
	toggleLinePrefix,
	toggleNumberedList,
	toggleWrapped,
	underlines,
} from "./formatting"
import { strings } from "./strings"

/** A Markdown command from a companion extension, with our own fallback. */
const TOC_COMMAND = "markdown.extension.toc.create"

/**
 * How far into a piece to look for a settings block. It is always at the very
 * top, so this only has to be generous enough to cover a long one.
 */
const FRONT_MATTER_SCAN_LINES = 200

/**
 * The Formatting button and the keyboard shortcuts behind it.
 *
 * Writers are never asked to type Markdown punctuation. Everything here works on
 * the selection, or on the word or line under the cursor when nothing is
 * selected, which is what a word processor does.
 */
export class Toolbar {
	async showMenu(): Promise<void> {
		const items: (vscode.QuickPickItem & { command: string })[] = [
			{ label: `$(bold) ${strings.formatting.bold}`, command: "writersStudio.formatBold" },
			{ label: `$(italic) ${strings.formatting.italic}`, command: "writersStudio.formatItalic" },
			{ label: `$(text-size) ${strings.formatting.heading}`, command: "writersStudio.formatHeading" },
			{ label: `$(quote) ${strings.formatting.quote}`, command: "writersStudio.formatQuote" },
			{ label: `$(list-unordered) ${strings.formatting.bulletList}`, command: "writersStudio.formatBulletList" },
			{
				label: `$(list-ordered) ${strings.formatting.numberedList}`,
				command: "writersStudio.formatNumberedList",
			},
			{ label: `$(link) ${strings.formatting.link}`, command: "writersStudio.formatLink" },
			{ label: `$(table) ${strings.formatting.table}`, command: "writersStudio.insertTable" },
			{
				label: `$(list-tree) ${strings.formatting.tableOfContents}`,
				command: "writersStudio.insertTableOfContents",
			},
		]

		const picked = await vscode.window.showQuickPick(items, { title: strings.formatting.menuTitle })
		if (picked) {
			await vscode.commands.executeCommand(picked.command)
		}
	}

	// ---- Character formatting ----------------------------------------------

	async toggleBold(): Promise<void> {
		await this.wrapSelections("**")
	}

	async toggleItalic(): Promise<void> {
		await this.wrapSelections("*")
	}

	private async wrapSelections(marker: string): Promise<void> {
		const editor = this.activeEditor()
		if (!editor) {
			return
		}

		// Remembered so the cursor can be placed between the markers afterwards
		// when there was nothing to wrap.
		let emptyInsertAt: vscode.Position | undefined

		await editor.edit((builder) => {
			for (const selection of editor.selections) {
				// With nothing selected, format the word the cursor is inside,
				// which is what a writer expects from a word processor.
				const wordRange = selection.isEmpty
					? editor.document.getWordRangeAtPosition(selection.active)
					: undefined
				const range = selection.isEmpty ? wordRange ?? selection : selection

				if (selection.isEmpty && !wordRange && editor.selections.length === 1) {
					emptyInsertAt = selection.active
				}

				const text = editor.document.getText(range)
				builder.replace(range, toggleWrapped(text, marker))
			}
		})

		if (emptyInsertAt) {
			// Put the cursor inside the new pair so typing continues in bold
			// rather than after the closing markers.
			const inside = emptyInsertAt.translate(0, marker.length)
			editor.selection = new vscode.Selection(inside, inside)
		}
	}

	// ---- Line formatting ----------------------------------------------------

	async toggleQuote(): Promise<void> {
		await this.transformLines((lines) => toggleLinePrefix(lines, "> "))
	}

	async toggleBulletList(): Promise<void> {
		await this.transformLines((lines) => toggleLinePrefix(lines, "- "))
	}

	async toggleNumberedList(): Promise<void> {
		await this.transformLines((lines) => toggleNumberedList(lines))
	}

	async setHeading(): Promise<void> {
		const editor = this.activeEditor()
		if (!editor) {
			return
		}

		const picked = await vscode.window.showQuickPick(
			[1, 2, 3].map((level) => ({
				label: strings.formatting.headingLevel(level),
				detail: strings.formatting.headingLevelDetail(level),
				level,
			})),
			{ title: strings.formatting.headingPickTitle },
		)
		if (!picked) {
			return
		}

		// The underline of an existing `A title` / `=======` heading is taken in
		// with the line above it, so it is rewritten rather than left behind as a
		// row of equals signs under the new heading.
		await this.transformLines((lines) => setHeadingLevelForLines(lines, picked.level), {
			absorbSetextUnderline: true,
		})
	}

	private async transformLines(
		transform: (lines: readonly string[]) => string[],
		options?: { absorbSetextUnderline?: boolean },
	): Promise<void> {
		const editor = this.activeEditor()
		if (!editor) {
			return
		}

		// Selections are reduced to a set of line blocks first. Two cursors on the
		// same line would otherwise produce two overlapping replacements, which
		// VS Code rejects outright, failing the whole edit.
		const blocks = this.selectedLineBlocks(editor)
		if (options?.absorbSetextUnderline) {
			this.absorbSetextUnderlines(editor, blocks)
		}

		await editor.edit((builder) => {
			for (const [startLine, endLine] of blocks) {
				const range = new vscode.Range(
					startLine,
					0,
					endLine,
					editor.document.lineAt(endLine).range.end.character,
				)

				const lines: string[] = []
				for (let line = startLine; line <= endLine; line++) {
					lines.push(editor.document.lineAt(line).text)
				}
				builder.replace(range, transform(lines).join("\n"))
			}
		})
	}

	/**
	 * The contiguous blocks of whole lines covered by the current selections,
	 * merged and sorted.
	 *
	 * A selection dragged through the end of a paragraph ends at column 0 of the
	 * following line. That line is not one the writer selected, so it is excluded;
	 * otherwise quoting a paragraph silently quotes the blank line after it too.
	 */
	private selectedLineBlocks(editor: vscode.TextEditor): [number, number][] {
		const lines = new Set<number>()

		for (const selection of editor.selections) {
			const startLine = selection.start.line
			const endLine =
				selection.end.character === 0 && selection.end.line > startLine
					? selection.end.line - 1
					: selection.end.line
			for (let line = startLine; line <= endLine; line++) {
				lines.add(line)
			}
		}

		const sorted = [...lines].sort((a, b) => a - b)
		const blocks: [number, number][] = []
		for (const line of sorted) {
			const last = blocks[blocks.length - 1]
			if (last && line === last[1] + 1) {
				last[1] = line
				continue
			}
			blocks.push([line, line])
		}
		return blocks
	}

	/**
	 * Grows a block by one line when the line just past it underlines the last
	 * line of the block.
	 *
	 * A writer with the cursor on `A quiet morning` never selects the `=======`
	 * beneath it, yet that underline is part of the same heading. Left out of the
	 * edit it survives as a paragraph of its own, which looks like damage.
	 *
	 * A block only grows when the line below really does underline the line above.
	 * A row of dashes under an existing heading is a horizontal rule, and taking
	 * one of those into an edit the writer never made would delete it. The line
	 * that closes a settings block at the top of the piece is excluded for the
	 * same reason: `summary:` above a row of dashes is indistinguishable from an
	 * underlined heading unless you can see that the block is still open.
	 *
	 * Blocks are already merged and sorted, so a block can only ever grow into a
	 * line no other block holds: two adjacent lines would have been one block.
	 */
	private absorbSetextUnderlines(editor: vscode.TextEditor, blocks: [number, number][]): void {
		const settingsBlockEnd = this.frontMatterEndLine(editor.document)

		for (const block of blocks) {
			const next = block[1] + 1
			if (next >= editor.document.lineCount || next === settingsBlockEnd) {
				continue
			}
			if (underlines(editor.document.lineAt(block[1]).text, editor.document.lineAt(next).text)) {
				block[1] = next
			}
		}
	}

	/** Reads only the top of the document, where a settings block can be. */
	private frontMatterEndLine(document: vscode.TextDocument): number | undefined {
		const limit = Math.min(document.lineCount, FRONT_MATTER_SCAN_LINES)
		const top: string[] = []
		for (let line = 0; line < limit; line++) {
			top.push(document.lineAt(line).text)
		}
		return frontMatterEndLine(top)
	}

	// ---- Inserting ----------------------------------------------------------

	async insertLink(): Promise<void> {
		const editor = this.activeEditor()
		if (!editor) {
			return
		}

		const selection = editor.selection
		const selectedText = editor.document.getText(selection)

		const address = await vscode.window.showInputBox({
			title: strings.formatting.linkPrompt,
			placeHolder: strings.formatting.linkPlaceholder,
		})
		if (!address || address.trim().length === 0) {
			return
		}

		let words = selectedText
		if (words.trim().length === 0) {
			const typed = await vscode.window.showInputBox({ title: strings.formatting.linkTextPrompt })
			if (typed === undefined) {
				return
			}
			words = typed
		}

		const markdown = buildLink(words, normaliseUrl(address))
		await editor.edit((builder) => builder.replace(selection, markdown))
	}

	async insertTable(): Promise<void> {
		const editor = this.activeEditor()
		if (!editor) {
			return
		}
		const table = buildTable(3, 3)
		await editor.edit((builder) => {
			for (const selection of editor.selections) {
				builder.replace(selection, `${table}\n`)
			}
		})
	}

	async insertTableOfContents(): Promise<void> {
		if (!this.activeEditor()) {
			return
		}
		const available = (await vscode.commands.getCommands(true)).includes(TOC_COMMAND)
		if (!available) {
			void vscode.window.showInformationMessage(strings.formatting.tableOfContentsUnavailable)
			return
		}
		await vscode.commands.executeCommand(TOC_COMMAND)
	}

	private activeEditor(): vscode.TextEditor | undefined {
		const editor = vscode.window.activeTextEditor
		if (!editor) {
			void vscode.window.showInformationMessage(strings.handoff.nothingOpen)
			return undefined
		}
		if (editor.document.languageId !== "markdown") {
			void vscode.window.showInformationMessage(strings.handoff.notWriting)
			return undefined
		}
		return editor
	}
}
