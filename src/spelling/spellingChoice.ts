/**
 * British or American spelling. Pure: no VS Code imports, unit tested.
 *
 * The spell checker only knows American English until its British English
 * dictionary is installed, and then only uses it when told to. A writer in
 * London saw "colour" underlined in their own welcome piece.
 */

export type Spelling = "british" | "american"

/**
 * What the writer told us. `theirs` means they had already chosen a spelling
 * language for the spell checker themselves, which is left exactly as it is.
 */
export type SpellingAnswer = Spelling | "theirs"

export const BRITISH_DICTIONARY_EXTENSION = "streetsidesoftware.code-spell-checker-british-english"

/** The spell checker's own setting, written to the writing folder only. */
export const SPELLING_SETTING = "cSpell.language"

/** English-speaking places that spell the American way. */
const AMERICAN_REGIONS = new Set(["us", "ph", "pr", "as", "gu", "mp", "um", "vi", "lr"])

/**
 * The spelling to suggest for a system locale such as `en-GB` or `en_AU`.
 * British wherever English is spoken outside the American-spelling regions;
 * American otherwise, which is also what the spell checker does unasked.
 */
export function suggestedSpelling(locale: string | undefined): Spelling {
	const [language, region] = (locale ?? "").toLowerCase().replace(/_/g, "-").split("-")
	if (language !== "en" || !region) {
		return "american"
	}
	return AMERICAN_REGIONS.has(region) ? "american" : "british"
}

/**
 * The spell checker language for an answer, or undefined when nothing should be
 * written: no answer yet, the writer's own choice, or British without the
 * British dictionary, which would mark every word as a mistake.
 */
export function spellCheckLanguage(answer: SpellingAnswer | undefined, britishInstalled: boolean): string | undefined {
	if (answer === "american") {
		return "en"
	}
	if (answer === "british") {
		return britishInstalled ? "en-GB" : undefined
	}
	return undefined
}
