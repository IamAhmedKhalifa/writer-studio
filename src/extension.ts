import * as vscode from "vscode"
import { FocusMode } from "./focus/focusMode"
import { PieceAutoSave } from "./library/autoSave"
import { DocumentCommands } from "./library/documentCommands"
import { FirstRun } from "./library/firstRun"
import { LibraryService } from "./library/libraryService"
import { LibraryTreeProvider } from "./library/libraryTreeProvider"
import { Handoff } from "./markdown/handoff"
import { WriterProfile } from "./profile/writerProfile"
import { WritingStatusBar } from "./stats/statusBar"
import { Dictionary } from "./spelling/dictionary"
import { SpellingPreference } from "./spelling/spellingPreference"
import { FormattingButton } from "./ui/formattingButton"
import { strings } from "./ui/strings"
import { Toolbar } from "./ui/toolbar"

/**
 * Context key that gates every command and menu item, so a developer who
 * installs this by accident never sees writing commands in their palette while
 * working on code.
 */
const WRITING_CONTEXT_KEY = "writersStudio.inWritingContext"

/**
 * Handed back from activation so the test suite can drive the same objects the
 * commands use. Not intended for other extensions to consume.
 */
export interface InternalApi {
	readonly library: LibraryService
	readonly profile: WriterProfile
	readonly focus: FocusMode
	readonly spelling: SpellingPreference
	readonly formattingButton: FormattingButton
	readonly firstRun: FirstRun
}

export async function activate(context: vscode.ExtensionContext): Promise<InternalApi> {
	const library = new LibraryService(context)
	const spelling = new SpellingPreference(context)
	const profile = new WriterProfile(
		context,
		() => library.getLibraryUri(),
		(choice) => (choice === "spelling" ? spelling.languageSetting() : undefined),
	)
	const firstRun = new FirstRun(context, library, profile, spelling)
	const documents = new DocumentCommands(library, firstRun)
	const tree = new LibraryTreeProvider(library)
	const focus = new FocusMode(context)
	const statusBar = new WritingStatusBar()
	const formattingButton = new FormattingButton()

	// Module-level so `deactivate` can await the settings restore.
	activeFocusMode = focus
	const toolbar = new Toolbar()
	const dictionary = new Dictionary()
	const handoff = new Handoff(context.extensionUri)

	context.subscriptions.push(library, tree, focus, statusBar, formattingButton, new PieceAutoSave(library))

	context.subscriptions.push(
		vscode.window.createTreeView("writersStudio.library", {
			treeDataProvider: tree,
			showCollapseAll: false,
		}),
	)

	const register = (command: string, run: (...args: never[]) => unknown): void => {
		context.subscriptions.push(
			vscode.commands.registerCommand(command, async (...args: never[]) => {
				try {
					await run(...args)
				} catch (error) {
					// A writer sees one plain sentence and never a stack trace. The
					// cause still goes to the extension host log, because a failure
					// that leaves no trace anywhere cannot be diagnosed from a bug
					// report that says only "something went wrong".
					// The extension host log is the only place a developer can read
					// this, and it is never shown to the writer.
					// eslint-disable-next-line no-console
					console.error(`[writers-studio] ${command} failed`, error)
					void vscode.window.showErrorMessage(strings.errors.somethingWentWrong)
				}
			}),
		)
	}

	// ---- Setting up --------------------------------------------------------
	register("writersStudio.runSetup", () => firstRun.offerSetup())
	register("writersStudio.chooseLibrary", () => firstRun.chooseLibrary())
	register("writersStudio.setUpWritingLook", () => firstRun.applyWritingLook())
	register("writersStudio.restoreNormalLook", () => firstRun.restoreNormalLook())
	register("writersStudio.openWalkthrough", () =>
		vscode.commands.executeCommand(
			"workbench.action.openWalkthrough",
			`${context.extension.id}#writersStudio.gettingStarted`,
			false,
		),
	)

	// ---- The library -------------------------------------------------------
	register("writersStudio.openLibrary", () => documents.openLibrary())
	register("writersStudio.newDraft", () => documents.newDraft())
	register("writersStudio.newDraftFromTemplate", () => documents.newDraftFromTemplate())
	register("writersStudio.refreshLibrary", () => tree.refresh())
	register("writersStudio.renameDocument", (item) => documents.rename(item))
	register("writersStudio.duplicateDocument", (item) => documents.duplicate(item))
	register("writersStudio.trashDocument", (item) => documents.trash(item))
	register("writersStudio.putBackDocument", (item) => documents.putBack(item))
	register("writersStudio.revealDocument", (item) => documents.reveal(item))

	// ---- Writing -----------------------------------------------------------
	register("writersStudio.toggleFocusMode", () => focus.toggle())
	register("writersStudio.showStatsDetail", () => statusBar.showDetail())
	register("writersStudio.addToDictionary", () => dictionary.addWord())
	register("writersStudio.chooseSpelling", () => firstRun.chooseSpelling())

	// ---- Formatting --------------------------------------------------------
	register("writersStudio.showFormattingMenu", () => toolbar.showMenu())
	register("writersStudio.formatBold", () => toolbar.toggleBold())
	register("writersStudio.formatItalic", () => toolbar.toggleItalic())
	register("writersStudio.formatQuote", () => toolbar.toggleQuote())
	register("writersStudio.formatBulletList", () => toolbar.toggleBulletList())
	register("writersStudio.formatNumberedList", () => toolbar.toggleNumberedList())
	register("writersStudio.formatHeading", () => toolbar.setHeading())
	register("writersStudio.formatLink", () => toolbar.insertLink())
	register("writersStudio.insertTable", () => toolbar.insertTable())
	register("writersStudio.insertTableOfContents", () => toolbar.insertTableOfContents())

	// ---- Handing work over -------------------------------------------------
	register("writersStudio.copyAsHtml", () => handoff.copyForWebsite())
	register("writersStudio.copyAsPlainText", () => handoff.copyAsPlainText())
	register("writersStudio.exportAsWebPage", () => handoff.exportAsWebPage())
	register("writersStudio.showPreview", () => handoff.showPreview())

	// ---- Context ----------------------------------------------------------
	/**
	 * The last answer, so a repeat is not pushed to the workbench.
	 *
	 * This runs on every library change, and the library changes about once a
	 * second while somebody types, because autosave keeps the file watcher busy.
	 * The answer almost never changes during a writing session, so recomputing is
	 * cheap but re-publishing it is not: each `setContext` is a round trip to the
	 * workbench, and each status bar update is another.
	 */
	let lastInWriting: boolean | undefined

	const updateContext = async (): Promise<void> => {
		const editor = vscode.window.activeTextEditor
		const inWriting =
			library.getLibraryUri() !== undefined &&
			(library.isLibraryOpen() || (editor !== undefined && library.isInLibrary(editor.document.uri)))
		if (inWriting === lastInWriting) {
			return
		}
		lastInWriting = inWriting

		await vscode.commands.executeCommand("setContext", WRITING_CONTEXT_KEY, inWriting)
		// The status bar items are the only controls VS Code cannot gate with a
		// `when` clause, so they are told the same answer directly.
		focus.setInWritingContext(inWriting)
		statusBar.setInWritingContext(inWriting)
		formattingButton.setInWritingContext(inWriting)
	}

	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(() => void updateContext()),
		vscode.workspace.onDidChangeWorkspaceFolders(() => void updateContext()),
		library.onDidChange(() => void updateContext()),
	)

	library.startWatching()
	await updateContext()

	// Put back anything a previous session left changed after an unclean exit,
	// before focus mode can be entered again.
	await focus.recover()

	// Never interrupt a test run with a dialog that waits for a person, and never
	// await the first-run flow: it shows a dialog, and an activation that waits
	// for a human keeps the extension reported as still starting up.
	if (context.extensionMode !== vscode.ExtensionMode.Test) {
		void firstRun.runIfNeeded()
		// The writing look waits for trust; this is the moment it can be offered.
		context.subscriptions.push(vscode.workspace.onDidGrantWorkspaceTrust(() => void firstRun.trustGranted()))
	}

	return { library, profile, focus, spelling, formattingButton, firstRun }
}

/**
 * Held outside `activate` so shutdown can await focus mode leaving cleanly.
 * `dispose` cannot be awaited, so relying on it raced the extension host exiting
 * and regularly lost, stranding global settings.
 */
let activeFocusMode: FocusMode | undefined

export async function deactivate(): Promise<void> {
	await activeFocusMode?.shutdown()
	activeFocusMode = undefined
}
