/**
 * Every user-facing string produced by the code lives here.
 *
 * Rule for this file: a person who has never written code must understand every
 * sentence. Banned words: workspace, folder-as-project, repository, commit,
 * lint, diagnostic, extension host, JSON, config, plugin, terminal, CLI, path
 * (when addressed to the reader), buffer, URI, markdown syntax jargon.
 *
 * Nothing outside this file may contain user-visible prose, with three declared
 * exceptions that belong to the same review surface:
 *   - `package.json` command titles, view names, setting descriptions, and the
 *     getting-started walkthrough text, which VS Code requires in the manifest.
 *   - `media/walkthrough/*.md`, the pages of that walkthrough.
 *   - `media/seed/*.md`, the starter documents copied into a writer's library.
 *
 * Reviewing those four places should be enough to prove the product speaks
 * plain English.
 */

export const strings = {
	setup: {
		welcomeTitle: "Welcome. Where should your writing live?",
		welcomeDetail:
			"Everything you write will be kept together in one place, so it is easy to find later. You can change this whenever you like.",
		useDocuments: "Use my Documents",
		useHome: "Use my home folder",
		chooseAnother: "Choose a different place\u2026",
		pickerTitle: "Choose where your writing should live",
		pickerButton: "Keep my writing here",
		created: (place: string) => `Your writing will be kept in ${place}.`,
		folderInUse: (place: string) => `${place} already has other things in it.`,
		folderInUseDetail: (inside: string) =>
			`Your writing can go in a new folder inside it, ${inside}, with a welcome piece and some templates to start from.\n\nOr it can use this folder as it is. Nothing in it is changed and no starter pieces are added, but any writing already at the top of it will appear in My Writing.`,
		folderInUseInside: "Make a new folder inside it",
		folderInUseAsItIs: "Use it as it is",
		applyLookPrompt: "Would you like to turn on the writing look?",
		applyLookDetail:
			"It hides everything built for programmers and gives you a calm page to write on. You can undo it any time.",
		applyLookYes: "Yes, set it up",
		applyLookNo: "Leave it as it is",
		applyLookLater:
			"You can turn the writing look on later from the \u22ef menu at the top of My Writing: choose \u201cSet up the writing look\u201d.",
		lookApplied: "The writing look is on. You can undo this any time with \u201cRestore the normal VS Code look\u201d.",
		lookAppliedPartly: (count: number) =>
			`The writing look is mostly on. ${count} ${count === 1 ? "setting" : "settings"} could not be changed, which usually means a helper is switched off.`,
		lookNotApplied: "The writing look could not be turned on. Nothing on your computer was changed.",
		lookRestored: "Everything is back to the way it was.",
		lookRestoredPartly: (count: number) =>
			`Most things are back to the way they were. ${count} ${count === 1 ? "setting" : "settings"} could not be changed back, so you can safely try again.`,
		lookRestoreNothingToDo: "Nothing to undo \u2014 the writing look is not switched on.",
		lookRestoreNeedsLibrary: "Everything else is back to normal. Your writing still has the writing look.",
		lookRestoreNeedsLibraryDetail:
			"Your writing is not open in this window, so its page layout could not be changed back from here. Open your writing to finish.",
		lookNeedsLibrary:
			"Let's open your writing first, so these changes apply to your writing and not to anything else you have open.",
		lookNeedsLibraryOpen: "Open my writing",
		replaceWindowPrompt: "Where would you like your writing to open?",
		replaceWindowDetail: "This window currently has something else open in it.",
		replaceWindowHere: "Open it in this window",
		replaceWindowNew: "Open it in a new window",
		alreadySetUp: "Your writing is already set up.",
		reopenPrompt: (place: string) =>
			`Your writing lives in ${place}, but a different set of files is open right now. Would you like to switch to your writing?`,
		reopenYes: "Switch to my writing",
		reopenNo: "Stay here",
	},

	library: {
		viewTitle: "My Writing",
		newDraftPlaceholder: "What is this piece called? (you can leave this blank)",
		newDraftPrompt: "Give your piece a name",
		renamePrompt: "What should this be called?",
		renameInvalid: "That name cannot be used. Please try letters, numbers, spaces, and dashes.",
		renameTaken: "You already have a piece with that name.",
		trashConfirm: (title: string) => `Move \u201c${title}\u201d to the trash?`,
		trashConfirmDetail: "It will be kept in the Trash at the bottom of My Writing, so you can put it back.",
		trashConfirmYes: "Move to trash",
		trashed: (title: string) =>
			`\u201c${title}\u201d was moved to the trash. You can find it at the bottom of My Writing.`,
		undo: "Undo",
		trashGroup: "Trash",
		trashCount: (count: number) => (count === 1 ? "1 piece" : `${count.toLocaleString()} pieces`),
		trashTooltip: "Pieces you moved to the trash. Right-click one to put it back.",
		trashedTooltip: "In the trash. Right-click to put it back.",
		putBack: (title: string) => `\u201c${title}\u201d is back with the rest of your writing.`,
		noLibraryYet: "Let's set up a place for your writing first.",
		setUpNow: "Set it up",
		lastEdited: (when: string) => `Last worked on ${when}`,
		wordsLabel: (count: number) => `${count.toLocaleString()} words`,
	},

	drafts: {
		templatePickTitle: "What are you writing?",
		templateBlank: "A blank page",
		templateBlankDetail: "Just start typing.",
	},

	focus: {
		on: "Focus mode is on. Press it again to come back.",
		off: "Focus mode is off.",
		notFullyRestored:
			"Focus mode is off, but the page could not be put fully back just now. It will be fixed the next time VS Code starts.",
		statusOn: "Focus",
		statusName: "Focus mode",
		statusTooltip: "Turn focus mode on or off",
	},

	stats: {
		statusText: (words: number, minutes: number) =>
			`${words.toLocaleString()} ${words === 1 ? "word" : "words"} \u00b7 ${minutes} min read`,
		statusTextSelection: (words: number) =>
			`${words.toLocaleString()} ${words === 1 ? "word" : "words"} selected`,
		tooltip: "Words in this piece. Click for more detail.",
		detail: (words: number, characters: number, charactersNoSpaces: number, paragraphs: number, minutes: number) =>
			[
				`Words: ${words.toLocaleString()}`,
				`Characters: ${characters.toLocaleString()}`,
				`Characters without spaces: ${charactersNoSpaces.toLocaleString()}`,
				`Paragraphs: ${paragraphs.toLocaleString()}`,
				`Reading time: about ${minutes} ${minutes === 1 ? "minute" : "minutes"}`,
			].join("\n"),
		detailTitle: "About this piece",
	},

	dictionary: {
		prompt: "Which word should be added to your dictionary?",
		added: (word: string) => `\u201c${word}\u201d will no longer be marked as a spelling mistake.`,
		noWord: "Put your cursor on the word you want to keep, then try again.",
		unavailable: "The spelling checker is not available right now.",
		needsTrust:
			"Your dictionary can only be changed once you have said you trust this folder. Choose \u201cYes, I trust it\u201d when VS Code asks.",
	},

	spelling: {
		question: "Which spelling do you use?",
		detail:
			"Many words spelled the other way will be underlined as mistakes. You can change this later with \u201cChoose British or American spelling\u201d.",
		british: "British: colour, organise",
		american: "American: color, organize",
		changed: (british: boolean) => `Spelling is now ${british ? "British" : "American"}.`,
		takesEffectWithLook: "Saved. Your spelling choice takes effect when the writing look is on.",
		takesEffectInWriting: "Saved. Your spelling choice takes effect the next time your writing is open.",
		britishMissing:
			"British spelling needs its own dictionary, which is missing. Installing Writer\u2019s Studio again brings it back.",
		needsTrust:
			"Spelling can only be changed once you have said you trust this folder. Choose \u201cYes, I trust it\u201d when VS Code asks.",
	},

	handoff: {
		copiedHtml: "Copied. You can paste this straight into your website or a document.",
		copiedHtmlAsMarkup:
			"Copied. Paste this into the HTML view of your website \u2014 in WordPress choose a Custom HTML block, in Ghost an HTML card.",
		copiedPlain: "Copied as plain text.",
		exported: (name: string) => `Saved as ${name}.`,
		exportedNeedsInternet: (name: string, places: string) =>
			`Saved as ${name}. Some pictures in it are kept on ${places}, so this file needs the internet to show them.`,
		exportFailed: "That could not be saved. Please try a different place.",
		saveLabel: "Save the web page",
		saveTitle: "Save this piece as a web page",
		nothingOpen: "Open a piece of writing first.",
		notWriting: "This only works on a piece of writing.",
		notInLibrary: "This only works on pieces kept in your writing.",
	},

	formatting: {
		menuTitle: "Formatting",
		buttonTooltip: "Bold, italic, headings, lists, links and quotations",
		bold: "Bold",
		italic: "Italic",
		heading: "Heading",
		quote: "Quotation",
		bulletList: "Bulleted list",
		numberedList: "Numbered list",
		link: "Link",
		table: "Table",
		tableOfContents: "List of contents",
		tableOfContentsUnavailable: "A list of contents is not available right now.",
		linkPrompt: "Where should this link go?",
		linkPlaceholder: "https://example.com",
		linkTextPrompt: "What words should the link show?",
		headingPickTitle: "How large should this heading be?",
		headingLevel: (level: number) => `Heading ${level}`,
		headingLevelDetail: (level: number) =>
			level === 1 ? "The title of the piece" : level === 2 ? "A main section" : "A smaller section",
	},

	errors: {
		couldNotCreatePlace: (place: string) =>
			`${place} could not be created. Please choose somewhere else, such as inside your Documents.`,
		couldNotWrite: "That change could not be saved.",
		somethingWentWrong: "Something went wrong. Nothing was changed.",
	},

	buttons: {
		showMe: "Show me",
	},
} as const
