import * as vscode from "vscode"
import { strings } from "../ui/strings"

/**
 * The writer's own dictionary.
 *
 * The spelling itself is done by Code Spell Checker. This wraps it so the writer
 * only ever sees "add this word to my dictionary" and never the underlying
 * settings, command names, or the word "cSpell".
 *
 * Words are written to the user dictionary setting directly rather than through
 * the other extension's commands, because command names there have changed
 * between releases while the setting has not.
 */
const USER_WORDS_SETTING = "cSpell.userWords"

export class Dictionary {
	/** Adds the word under the cursor, or a word the writer types. */
	async addWord(): Promise<void> {
		const word = await this.resolveWord()
		if (!word) {
			return
		}

		// Adding to the dictionary writes a setting, so it waits for a folder the
		// writer has vouched for.
		if (!vscode.workspace.isTrusted) {
			void vscode.window.showInformationMessage(strings.dictionary.needsTrust)
			return
		}

		const config = vscode.workspace.getConfiguration()
		const inspected = config.inspect<string[]>(USER_WORDS_SETTING)
		if (inspected === undefined) {
			void vscode.window.showInformationMessage(strings.dictionary.unavailable)
			return
		}

		const existing = inspected.globalValue ?? []
		if (existing.some((candidate) => candidate.toLowerCase() === word.toLowerCase())) {
			void vscode.window.showInformationMessage(strings.dictionary.added(word))
			return
		}

		try {
			await config.update(
				USER_WORDS_SETTING,
				[...existing, word].sort((a, b) => a.localeCompare(b)),
				vscode.ConfigurationTarget.Global,
			)
			void vscode.window.showInformationMessage(strings.dictionary.added(word))
		} catch {
			void vscode.window.showInformationMessage(strings.dictionary.unavailable)
		}
	}

	private async resolveWord(): Promise<string | undefined> {
		const editor = vscode.window.activeTextEditor
		if (editor) {
			const selected = editor.document.getText(editor.selection).trim()
			if (selected.length > 0 && !/\s/.test(selected)) {
				return selected
			}

			const range = editor.document.getWordRangeAtPosition(editor.selection.active, /[\p{L}\p{N}'’-]+/u)
			if (range) {
				const word = editor.document.getText(range).trim()
				if (word.length > 0) {
					return word
				}
			}
		}

		// No word under the cursor: ask, rather than doing nothing.
		const typed = await vscode.window.showInputBox({
			title: strings.dictionary.prompt,
			validateInput: (value) => (/\s/.test(value.trim()) ? strings.dictionary.noWord : undefined),
		})
		const word = typed?.trim()
		return word && word.length > 0 ? word : undefined
	}
}
