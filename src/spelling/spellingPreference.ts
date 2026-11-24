import * as vscode from "vscode"
import { strings } from "../ui/strings"
import {
	BRITISH_DICTIONARY_EXTENSION,
	Spelling,
	SPELLING_SETTING,
	SpellingAnswer,
	spellCheckLanguage,
	suggestedSpelling,
} from "./spellingChoice"

const ANSWER_KEY = "writersStudio.spelling"

/**
 * Remembers whether the writer spells the British or the American way.
 *
 * Kept as this extension's own state, not as a setting: the setting it leads to
 * is written by the writing look, from the catalog, like every other.
 */
export class SpellingPreference {
	constructor(private readonly context: vscode.ExtensionContext) {}

	answer(): SpellingAnswer | undefined {
		return this.context.globalState.get<SpellingAnswer>(ANSWER_KEY)
	}

	async remember(answer: SpellingAnswer): Promise<void> {
		await this.context.globalState.update(ANSWER_KEY, answer)
	}

	/** Forgets the answer, as a fresh install would. For the test suite. */
	async forgetForTests(): Promise<void> {
		await this.context.globalState.update(ANSWER_KEY, undefined)
	}

	britishAvailable(): boolean {
		return vscode.extensions.getExtension(BRITISH_DICTIONARY_EXTENSION) !== undefined
	}

	/** The value the writing look gives the spell checker's language, if any. */
	languageSetting(): string | undefined {
		return spellCheckLanguage(this.answer(), this.britishAvailable())
	}

	/**
	 * Asked once, the first time the writing look is set up, so the answer always
	 * takes effect. A writer who already chose a language for the spell checker
	 * is not asked, and keeps it.
	 */
	async askIfNeeded(): Promise<void> {
		if (this.answer() !== undefined) {
			return
		}
		if (writerChoseALanguage()) {
			await this.remember("theirs")
			return
		}
		// Closing the question without answering takes the suggestion, which
		// can be changed later, rather than asking again every time.
		await this.remember((await this.ask()) ?? suggestedSpelling(systemLocale()))
	}

	/** Shows the question. Undefined when it was closed without an answer. */
	async ask(): Promise<Spelling | undefined> {
		const suggested = suggestedSpelling(systemLocale())
		const labels = suggested === "british"
			? [strings.spelling.british, strings.spelling.american]
			: [strings.spelling.american, strings.spelling.british]
		// A dialog rather than a notification: notifications that arrive during
		// setup end up unseen behind the bell.
		const picked = await vscode.window.showInformationMessage(
			strings.spelling.question,
			{ modal: true, detail: strings.spelling.detail },
			...labels,
		)
		if (picked === strings.spelling.british) {
			return "british"
		}
		if (picked === strings.spelling.american) {
			return "american"
		}
		return undefined
	}
}

function writerChoseALanguage(): boolean {
	const inspected = vscode.workspace.getConfiguration().inspect(SPELLING_SETTING)
	return (
		inspected?.globalValue !== undefined ||
		inspected?.workspaceValue !== undefined ||
		inspected?.workspaceFolderValue !== undefined
	)
}

/**
 * The language and region the computer is set to, such as `en-GB`. VS Code
 * passes the system's own to the extension host; the runtime's is a fallback,
 * and often just `en-US` for an app started from the Dock.
 */
function systemLocale(): string | undefined {
	try {
		const config = JSON.parse(process.env.VSCODE_NLS_CONFIG ?? "{}") as { osLocale?: unknown }
		if (typeof config.osLocale === "string" && config.osLocale.length > 0) {
			return config.osLocale
		}
	} catch {
		// Not set, or not readable: fall back below.
	}
	return Intl.DateTimeFormat().resolvedOptions().locale
}
