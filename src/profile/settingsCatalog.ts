/**
 * The single source of truth for every setting the writing look changes.
 *
 * Nothing else in the codebase may write a VS Code setting persistently. If a
 * feature needs one, it belongs here so that `Restore the normal VS Code look`
 * can undo it exactly.
 *
 * Focus mode changes a handful of settings *temporarily*; those live in
 * `FOCUS_MODE_SETTING_KEYS` and are restored when focus mode ends.
 *
 * Two rules keep the blast radius honest:
 *
 *   - `scope: "library"` is the default for anything that would be hostile in a
 *     writer's other projects. Those are written to the library folder only, so a
 *     person who also uses VS Code for code keeps Git, problems, and their window
 *     title everywhere else.
 *   - `scope: "everywhere"` is reserved for the things that must follow the writer
 *     between windows, chiefly the theme and the editor's typography, and for
 *     settings their owner declares application- or machine-wide, which VS Code
 *     refuses to store in a folder at all.
 *
 * Nothing here may disable a security feature. Workspace Trust is deliberately
 * absent: hiding a prompt is not worth removing the protection that stops a
 * malicious folder from running code, and the writer cannot weigh that trade.
 */

export type SettingScope = "everywhere" | "library"

export interface SettingSpec {
	readonly key: string
	readonly value: unknown
	readonly scope: SettingScope
	/**
	 * Object-valued settings are merged into whatever the writer already had,
	 * rather than replacing it, so applying the look cannot silently discard
	 * their own entries.
	 */
	readonly merge?: boolean
	/**
	 * Where VS Code has the setting at all. Writing one it does not register on
	 * this platform is refused, and was reported to every Mac writer as a
	 * setting that "could not be changed". Absent means everywhere.
	 */
	readonly platforms?: readonly NodeJS.Platform[]
	/**
	 * The optional companion extension that declares the setting. VS Code refuses
	 * to write a setting nothing declares, so these are left alone while that
	 * companion is not installed. Absent for VS Code's own settings and for those
	 * of required companions.
	 */
	readonly owner?: string
	/**
	 * Added in a later VS Code than the oldest one Writer's Studio runs on, so it
	 * is left alone where VS Code does not have it yet, rather than reported as a
	 * setting that "could not be changed". The test suite checks that the current
	 * VS Code has every one of these, so this cannot hide a misspelled key.
	 */
	readonly newerVSCodeOnly?: boolean
	/**
	 * Set from an answer the writer gave rather than fixed here: `value` is then
	 * only the default, and the profile is told the real value when it applies
	 * the look. Left alone entirely while there is no answer to use.
	 */
	readonly fromChoice?: WriterChoice
}

/** Questions whose answers decide a setting's value. */
export type WriterChoice = "spelling"

/** The companion that adds Markdown editing helpers. Optional: see package.json. */
export const MARKDOWN_HELPER_EXTENSION = "yzhang.markdown-all-in-one"

/**
 * Whether applying `setting` can succeed: VS Code has it on `platform`, its
 * optional owner, if any, is installed, and a setting from a newer VS Code is
 * known to this one.
 */
export function appliesOn(
	setting: SettingSpec,
	platform: NodeJS.Platform = process.platform,
	isInstalled: (extensionId: string) => boolean = () => true,
	isKnown: (key: string) => boolean = () => true,
): boolean {
	const onThisPlatform = setting.platforms === undefined || setting.platforms.includes(platform)
	return (
		onThisPlatform &&
		(setting.owner === undefined || isInstalled(setting.owner)) &&
		(!setting.newerVSCodeOnly || isKnown(setting.key))
	)
}

/** Serif stack that resolves on macOS, Windows, and Linux without downloads. */
const PROSE_FONT = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif"

/**
 * Where the preview stylesheet is copied to inside the library. A dot-prefixed
 * folder keeps it out of the writer's sight and out of the sidebar, which ignores
 * dot files.
 */
export const PREVIEW_STYLESHEET_PATH = [".writing", "preview.css"] as const

/** The same location as `markdown.styles` wants it: relative to the library. */
const PREVIEW_STYLESHEET_SETTING = `./${PREVIEW_STYLESHEET_PATH.join("/")}`

export const WRITER_SETTINGS: readonly SettingSpec[] = [
	// ---- The page itself ---------------------------------------------------
	{ key: "workbench.colorTheme", value: "Writer's Studio Paper", scope: "everywhere" },
	{ key: "editor.fontFamily", value: PROSE_FONT, scope: "everywhere" },
	{ key: "editor.fontSize", value: 17, scope: "everywhere" },
	{ key: "editor.lineHeight", value: 1.8, scope: "everywhere" },
	{ key: "editor.fontLigatures", value: false, scope: "everywhere" },
	{ key: "editor.cursorBlinking", value: "smooth", scope: "everywhere" },
	{ key: "editor.cursorSmoothCaretAnimation", value: "on", scope: "everywhere" },
	{ key: "editor.smoothScrolling", value: true, scope: "everywhere" },

	// ---- Prose layout, in the library only ---------------------------------
	{ key: "editor.wordWrap", value: "bounded", scope: "library" },
	{ key: "editor.wordWrapColumn", value: 78, scope: "library" },
	{ key: "editor.scrollBeyondLastLine", value: true, scope: "library" },

	// ---- Remove the gutter and margins meant for code ----------------------
	{ key: "editor.lineNumbers", value: "off", scope: "library" },
	{ key: "editor.minimap.enabled", value: false, scope: "library" },
	{ key: "editor.glyphMargin", value: false, scope: "library" },
	{ key: "editor.folding", value: false, scope: "library" },
	{ key: "editor.guides.indentation", value: false, scope: "library" },
	{ key: "editor.guides.bracketPairs", value: false, scope: "library" },
	{ key: "editor.renderWhitespace", value: "none", scope: "library" },
	{ key: "editor.renderLineHighlight", value: "none", scope: "library" },
	{ key: "editor.overviewRulerBorder", value: false, scope: "library" },
	{ key: "editor.hideCursorInOverviewRuler", value: true, scope: "library" },
	{ key: "editor.stickyScroll.enabled", value: false, scope: "library" },
	{ key: "editor.codeLens", value: false, scope: "library" },
	{ key: "breadcrumbs.enabled", value: false, scope: "library" },

	// ---- Stop the editor behaving like a code editor -----------------------
	{
		key: "editor.quickSuggestions",
		value: { other: false, comments: false, strings: false },
		scope: "library",
		merge: true,
	},
	{ key: "editor.suggestOnTriggerCharacters", value: false, scope: "library" },
	{ key: "editor.acceptSuggestionOnEnter", value: "off", scope: "library" },
	{ key: "editor.parameterHints.enabled", value: false, scope: "library" },
	{ key: "editor.matchBrackets", value: "never", scope: "library" },
	{ key: "editor.autoClosingBrackets", value: "never", scope: "library" },
	{ key: "editor.autoClosingQuotes", value: "never", scope: "library" },
	{ key: "editor.autoSurround", value: "never", scope: "library" },
	{ key: "editor.occurrencesHighlight", value: "off", scope: "library" },
	{ key: "editor.selectionHighlight", value: false, scope: "library" },
	{ key: "editor.emptySelectionClipboard", value: false, scope: "library" },
	{ key: "editor.formatOnSave", value: false, scope: "library" },
	{ key: "editor.formatOnPaste", value: false, scope: "library" },
	// Curly quotes, em dashes and accented characters must never be flagged.
	{ key: "editor.unicodeHighlight.ambiguousCharacters", value: false, scope: "library" },
	{ key: "editor.unicodeHighlight.nonBasicASCII", value: false, scope: "library" },
	{ key: "editor.unicodeHighlight.invisibleCharacters", value: false, scope: "library" },

	// ---- Window chrome -----------------------------------------------------
	{ key: "workbench.editor.showTabs", value: "none", scope: "everywhere" },
	{ key: "workbench.editor.editorActionsLocation", value: "titleBar", scope: "everywhere" },
	{ key: "workbench.editor.enablePreview", value: false, scope: "everywhere" },
	{ key: "workbench.startupEditor", value: "none", scope: "everywhere" },
	{ key: "workbench.tips.enabled", value: false, scope: "everywhere" },
	{ key: "workbench.statusBar.visible", value: true, scope: "everywhere" },
	{ key: "window.commandCenter", value: false, scope: "everywhere" },
	// macOS keeps its menu bar at the top of the screen and has no such setting.
	{ key: "window.menuBarVisibility", value: "compact", scope: "everywhere", platforms: ["win32", "linux"] },
	// Window title and Git belong to the library: a writer who also codes must
	// keep both in their other projects.
	{ key: "window.title", value: "${activeEditorShort}", scope: "library" },

	// ---- Never lose work ---------------------------------------------------
	{ key: "files.autoSave", value: "afterDelay", scope: "everywhere" },
	{ key: "files.autoSaveDelay", value: 1000, scope: "everywhere" },
	{ key: "files.defaultLanguage", value: "markdown", scope: "library" },
	// Two trailing spaces mean "line break" in Markdown. Never strip them.
	{ key: "files.trimTrailingWhitespace", value: false, scope: "library" },
	{ key: "files.insertFinalNewline", value: true, scope: "library" },
	// The two dot folders hold this app's own machinery. Left visible, VS Code's
	// file list showed a writer `.vscode` and `.writing` above their pieces.
	{
		key: "files.exclude",
		value: { "**/.DS_Store": true, "**/Thumbs.db": true, ".vscode": true, ".writing": true },
		scope: "library",
		merge: true,
	},

	// ---- Silence everything built for programmers, in the library only ------
	{ key: "git.enabled", value: false, scope: "library" },
	{ key: "git.openRepositoryInParentFolders", value: "never", scope: "library" },
	{ key: "scm.diffDecorations", value: "none", scope: "library" },
	{ key: "problems.decorations.enabled", value: false, scope: "library" },
	{ key: "extensions.ignoreRecommendations", value: true, scope: "library" },
	// AI coding help filled the right-click menu with Fix, Explain, and Review,
	// and put a Sign In button in the title bar. Off in the writing folder only,
	// so a writer who also codes keeps it in their projects.
	{ key: "chat.disableAIFeatures", value: true, scope: "library", newerVSCodeOnly: true },
	{ key: "chat.titleBar.signIn.enabled", value: false, scope: "library", newerVSCodeOnly: true },

	// ---- Reading and previewing --------------------------------------------
	// The preview stylesheet is copied into the library and pointed at from here,
	// so it never restyles Markdown previews in a writer's other projects.
	{ key: "markdown.styles", value: [PREVIEW_STYLESHEET_SETTING], scope: "library" },
	{ key: "markdown.preview.fontFamily", value: PROSE_FONT, scope: "library" },
	{ key: "markdown.validate.enabled", value: false, scope: "library" },
	{ key: "markdown.updateLinksOnFileMove.enabled", value: "always", scope: "library" },
	{ key: "markdown.editor.pasteUrlAsFormattedLink.enabled", value: "smart", scope: "library" },
	{ key: "markdown.editor.filePaste.copyIntoWorkspace", value: "mediaFiles", scope: "library" },
	{ key: "markdown.editor.drop.copyIntoWorkspace", value: "mediaFiles", scope: "library" },

	// ---- Spelling (Code Spell Checker) -------------------------------------
	{ key: "cSpell.enabled", value: true, scope: "everywhere" },
	{
		key: "cSpell.enabledFileTypes",
		value: { markdown: true, plaintext: true },
		scope: "library",
		merge: true,
	},
	// The spell checker declares this one application-wide, so it cannot live in
	// the library: a folder-level write is refused, which used to leave the 50 ms
	// default underlining half-typed words and every apply and restore reporting
	// one setting it could not change.
	{ key: "cSpell.spellCheckDelayMs", value: 500, scope: "everywhere" },
	{ key: "cSpell.suggestionMenuType", value: "quickPick", scope: "everywhere" },
	{ key: "cSpell.allowCompoundWords", value: false, scope: "library" },
	// British or American, as the writer answered. The writing folder only, so
	// their code projects keep whatever the spell checker uses there.
	{ key: "cSpell.language", value: "en", scope: "library", fromChoice: "spelling" },
	{ key: "cSpell.showCommandsInEditorContextMenu", value: false, scope: "everywhere" },
	// Writer's Studio lists "Spelling Suggestions…" at the top of the right-click
	// menu itself. The spell checker's own copy sat near the bottom, under the
	// programming items, and would now be a second one.
	{ key: "cSpell.showSuggestionsLinkInEditorContextMenu", value: false, scope: "library" },

	// ---- Markdown editing helpers (Markdown All in One) --------------------
	// An optional companion: a writer can remove it, and VS Code switches it off
	// in a folder that is not trusted, so these apply only while it is there.
	{ key: "markdown.extension.toc.levels", value: "2..3", scope: "library", owner: MARKDOWN_HELPER_EXTENSION },
	{ key: "markdown.extension.bold.indicator", value: "**", scope: "library", owner: MARKDOWN_HELPER_EXTENSION },
	{ key: "markdown.extension.italic.indicator", value: "*", scope: "library", owner: MARKDOWN_HELPER_EXTENSION },
	{ key: "markdown.extension.orderedList.marker", value: "ordered", scope: "library", owner: MARKDOWN_HELPER_EXTENSION },
	{ key: "markdown.extension.tableFormatter.enabled", value: true, scope: "library", owner: MARKDOWN_HELPER_EXTENSION },
	{
		key: "markdown.extension.preview.autoShowPreviewToSide",
		value: false,
		scope: "library",
		owner: MARKDOWN_HELPER_EXTENSION,
	},

	// ---- Defaults that focus mode builds on --------------------------------
	{ key: "zenMode.centerLayout", value: true, scope: "everywhere" },
	{ key: "zenMode.hideLineNumbers", value: true, scope: "everywhere" },
	{ key: "zenMode.showTabs", value: "none", scope: "everywhere" },
	{ key: "zenMode.silentNotifications", value: true, scope: "everywhere" },
	{ key: "zenMode.fullScreen", value: false, scope: "everywhere" },
]

/**
 * Settings focus mode toggles on entry and restores on exit. Kept apart from the
 * permanent catalog because these must never outlive a focus session, and
 * persisted separately so an unclean shutdown can still be recovered from.
 */
export const FOCUS_MODE_SETTING_KEYS = [
	"editor.cursorSurroundingLines",
	"editor.cursorSurroundingLinesStyle",
	"editor.scrollbar.vertical",
	"editor.scrollbar.horizontal",
] as const

export type FocusModeSettingKey = (typeof FOCUS_MODE_SETTING_KEYS)[number]
