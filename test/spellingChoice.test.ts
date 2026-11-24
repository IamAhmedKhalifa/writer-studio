import * as assert from "node:assert/strict"
import { spellCheckLanguage, suggestedSpelling } from "../src/spelling/spellingChoice"

describe("spellingChoice", () => {
	describe("suggestedSpelling", () => {
		it("suggests British where English is spelled the British way", () => {
			for (const locale of ["en-GB", "en_GB", "en-AU", "en-NZ", "en-IE", "en-ZA", "en-IN", "en-gb"]) {
				assert.equal(suggestedSpelling(locale), "british", locale)
			}
		})

		it("suggests American in the United States and places that follow it", () => {
			for (const locale of ["en-US", "en_US", "en-PH", "en-PR"]) {
				assert.equal(suggestedSpelling(locale), "american", locale)
			}
		})

		it("suggests what the spell checker does anyway when it cannot tell", () => {
			for (const locale of ["en", "fr-FR", "", undefined]) {
				assert.equal(suggestedSpelling(locale), "american", String(locale))
			}
		})
	})

	describe("spellCheckLanguage", () => {
		it("gives the spell checker the language for each answer", () => {
			assert.equal(spellCheckLanguage("american", true), "en")
			assert.equal(spellCheckLanguage("british", true), "en-GB")
		})

		it("writes nothing without the British dictionary, which would mark every word", () => {
			assert.equal(spellCheckLanguage("british", false), undefined)
		})

		it("writes nothing without an answer, or over the writer's own choice", () => {
			assert.equal(spellCheckLanguage(undefined, true), undefined)
			assert.equal(spellCheckLanguage("theirs", true), undefined)
		})
	})
})
