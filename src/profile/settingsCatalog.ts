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
 *     between windows, chiefly the theme and the editor's typography.
 *
 * Nothing here may disable a security feature. Workspace Trust is deliberately
 * absent: hiding a prompt is not worth removing the protection that stops a
 * malicious folder from running code, and the writer cannot weigh that trade.
 */

export type SettingScope = "everywhere" | "library"

interface SettingSpec {
	readonly key: string
	readonly value: unknown
	readonly scope: SettingScope
	/**
	 * Object-valued settings are merged into whatever the writer already had,
	 * rather than replacing it, so applying the look cannot silently discard
	 * their own entries.
	 */
	readonly merge?: boolean
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
	{ key: "window.menuBarVisibility", value: "compact", scope: "everywhere" },
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
	{ key: "files.exclude", value: { "**/.DS_Store": true, "**/Thumbs.db": true }, scope: "library", merge: true },

	// ---- Silence everything built for programmers, in the library only ------
	{ key: "git.enabled", value: false, scope: "library" },
	{ key: "git.openRepositoryInParentFolders", value: "never", scope: "library" },
	{ key: "scm.diffDecorations", value: "none", scope: "library" },
	{ key: "problems.decorations.enabled", value: false, scope: "library" },
	{ key: "extensions.ignoreRecommendations", value: true, scope: "library" },

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
	{ key: "cSpell.spellCheckDelayMs", value: 500, scope: "library" },
	{ key: "cSpell.suggestionMenuType", value: "quickPick", scope: "everywhere" },
	{ key: "cSpell.allowCompoundWords", value: false, scope: "library" },
	{ key: "cSpell.showCommandsInEditorContextMenu", value: false, scope: "everywhere" },

	// ---- Markdown editing helpers (Markdown All in One) --------------------
	{ key: "markdown.extension.toc.levels", value: "2..3", scope: "library" },
	{ key: "markdown.extension.bold.indicator", value: "**", scope: "library" },
	{ key: "markdown.extension.italic.indicator", value: "*", scope: "library" },
	{ key: "markdown.extension.orderedList.marker", value: "ordered", scope: "library" },
	{ key: "markdown.extension.tableFormatter.enabled", value: true, scope: "library" },
	{ key: "markdown.extension.preview.autoShowPreviewToSide", value: false, scope: "library" },

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
