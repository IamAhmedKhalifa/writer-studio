import * as os from "os"
import * as path from "path"
import * as vscode from "vscode"
import { WriterProfile } from "../profile/writerProfile"
import { SPELLING_SETTING } from "../spelling/spellingChoice"
import { SpellingPreference } from "../spelling/spellingPreference"
import { strings } from "../ui/strings"
import { LIBRARY_FOLDER_NAME, LibraryService, OccupiedFolderAnswer } from "./libraryService"

const REOPEN_PROMPT_KEY = "writersStudio.suppressReopenPrompt"
const SETUP_OFFERED_KEY = "writersStudio.setupOffered"
const PENDING_SETUP_KEY = "writersStudio.pendingSetup"

interface PendingSetup {
	/** Apply the writing look once the library is the folder that is open. */
	applyLook: boolean
	/** Open the welcome piece. */
	openWelcome: boolean
	/**
	 * Finish undoing the writing look. Set when restore ran from a window that did
	 * not have the writing open, so the writing folder's own part had to wait.
	 */
	restoreLook?: boolean
}

/**
 * Owns the path a brand-new writer takes: choose a place for their writing, open
 * it, turn on the writing look, read the welcome piece.
 *
 * The order matters. Opening the library reloads the window, which ends this
 * extension's run, so anything that must happen "inside" the library is recorded
 * as a pending step and finished on the way back. In particular the writing look
 * is applied only once the library is the open folder, because its
 * library-scoped settings would otherwise be written into whatever project the
 * writer happened to have open.
 *
 * Nothing here happens without the writer agreeing to it, and every step is
 * reversible.
 */
export class FirstRun {
	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly library: LibraryService,
		private readonly profile: WriterProfile,
		private readonly spelling: SpellingPreference,
	) {}

	/**
	 * Called on activation. Quiet when there is nothing to do.
	 *
	 * Never awaited by `activate`: this can show a dialog, and an activation that
	 * waits for a person leaves the extension reported as still starting up.
	 */
	async runIfNeeded(): Promise<void> {
		const pending = this.context.globalState.get<PendingSetup>(PENDING_SETUP_KEY)
		if (pending && this.library.isLibraryOpen()) {
			await this.context.globalState.update(PENDING_SETUP_KEY, undefined)
			await this.finishSetup(pending)
			return
		}

		if (!this.library.getLibraryUri()) {
			if (!this.context.globalState.get(SETUP_OFFERED_KEY)) {
				await this.offerSetup()
			}
			return
		}

		// Set up, and this window is the writing: open on the list of pieces.
		// VS Code otherwise brings back whichever sidebar was last showing, and
		// its own file list is one stray click away at the top of the left bar.
		if (this.library.isLibraryOpen()) {
			await this.catchUpOnSpelling()
			await this.showLibraryList()
			return
		}

		// Set up already, but the writer is looking at something else.
		if (this.library.hasDifferentFolderOpen() && !this.context.globalState.get(REOPEN_PROMPT_KEY)) {
			await this.offerToReopenLibrary()
		}
	}

	/** The welcome prompt. Also reachable from the sidebar and the guide. */
	async offerSetup(): Promise<void> {
		const suggested = await this.library.suggestedLibraryUri()
		// The label has to describe the place actually being offered: on a machine
		// with no Documents folder this is the home folder instead.
		const acceptLabel = this.isInsideDocuments(suggested) ? strings.setup.useDocuments : strings.setup.useHome

		const choice = await vscode.window.showInformationMessage(
			strings.setup.welcomeTitle,
			{ modal: true, detail: `${strings.setup.welcomeDetail}\n\n${this.describe(suggested)}` },
			acceptLabel,
			strings.setup.chooseAnother,
		)

		if (choice === acceptLabel) {
			await this.adoptLibrary(suggested)
			return
		}
		if (choice === strings.setup.chooseAnother) {
			await this.chooseLibrary()
			return
		}

		// Dismissed rather than answered. Asked once; the sidebar keeps the
		// invitation available so nobody is left with no way back in.
		await this.context.globalState.update(SETUP_OFFERED_KEY, true)
	}

	/** Lets the writer pick, or change, where their writing is kept. */
	async chooseLibrary(): Promise<void> {
		const suggested = await this.library.suggestedLibraryUri()
		const picked = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			defaultUri: vscode.Uri.file(path.dirname(suggested.fsPath)),
			openLabel: strings.setup.pickerButton,
			title: strings.setup.pickerTitle,
		})

		if (!picked || picked.length === 0) {
			return
		}
		await this.adoptLibrary(picked[0])
	}

	private async adoptLibrary(chosen: vscode.Uri): Promise<void> {
		let uri: vscode.Uri
		try {
			const prepared = await this.library.prepareLibrary(chosen, (folder) => this.askAboutOccupiedFolder(folder))
			if (!prepared) {
				return
			}
			uri = prepared
		} catch {
			void vscode.window.showErrorMessage(strings.errors.couldNotCreatePlace(this.describe(chosen)))
			return
		}

		await this.library.setLibraryUri(uri)
		await this.context.globalState.update(SETUP_OFFERED_KEY, true)
		void vscode.window.showInformationMessage(strings.setup.created(this.describe(uri)))

		if (this.library.isLibraryOpen()) {
			await this.finishSetup({ applyLook: !this.profile.isApplied(), openWelcome: true })
			return
		}

		// The library has to be open before the look is applied, and opening it
		// ends this run, so the rest is recorded and finished afterwards.
		await this.context.globalState.update(PENDING_SETUP_KEY, {
			applyLook: !this.profile.isApplied(),
			openWelcome: true,
		} satisfies PendingSetup)

		if (!(await this.openLibraryRespectingWindow())) {
			// The writer declined to open it anywhere; do not leave a pending step
			// waiting to surprise them later.
			await this.context.globalState.update(PENDING_SETUP_KEY, undefined)
		}
	}

	/** Asked before the writing is kept in a folder that already has things in it. */
	private async askAboutOccupiedFolder(folder: vscode.Uri): Promise<OccupiedFolderAnswer> {
		const inside = vscode.Uri.joinPath(folder, LIBRARY_FOLDER_NAME)
		const choice = await vscode.window.showInformationMessage(
			strings.setup.folderInUse(this.describe(folder)),
			{ modal: true, detail: strings.setup.folderInUseDetail(this.describe(inside)) },
			strings.setup.folderInUseInside,
			strings.setup.folderInUseAsItIs,
		)
		if (choice === strings.setup.folderInUseInside) {
			return "inside"
		}
		if (choice === strings.setup.folderInUseAsItIs) {
			return "asItIs"
		}
		return undefined
	}

	private async finishSetup(pending: PendingSetup): Promise<void> {
		if (pending.restoreLook) {
			await this.restoreNormalLook()
			return
		}
		if (pending.applyLook) {
			await this.offerWritingLook()
		}
		if (pending.openWelcome) {
			await this.openWelcome()
		}
		await this.focusLibraryView()
	}

	private async offerWritingLook(): Promise<void> {
		const choice = await vscode.window.showInformationMessage(
			strings.setup.applyLookPrompt,
			strings.setup.applyLookYes,
			strings.setup.applyLookNo,
		)
		if (choice === strings.setup.applyLookYes) {
			await this.applyWritingLook()
		}
	}

	/**
	 * Turns the writing look on, reporting honestly what happened. The library has
	 * to be the open folder first, or the library-scoped settings would land in
	 * somebody else's project.
	 */
	async applyWritingLook(): Promise<void> {
		if (!this.library.isLibraryOpen()) {
			const choice = await vscode.window.showInformationMessage(
				strings.setup.lookNeedsLibrary,
				strings.setup.lookNeedsLibraryOpen,
			)
			if (choice !== strings.setup.lookNeedsLibraryOpen) {
				return
			}
			if (!this.library.getLibraryUri()) {
				await this.offerSetup()
				return
			}
			await this.context.globalState.update(PENDING_SETUP_KEY, {
				applyLook: true,
				openWelcome: false,
			} satisfies PendingSetup)
			await this.openLibraryRespectingWindow()
			return
		}

		// Asked here, just before the look goes on, so the answer always takes
		// effect. Without trust nothing can be applied, so asking would be wasted.
		if (vscode.workspace.isTrusted) {
			await this.spelling.askIfNeeded()
		}

		const result = await this.profile.apply()

		if (result.applied === 0) {
			void vscode.window.showWarningMessage(strings.setup.lookNotApplied)
			return
		}
		if (result.skipped.length > 0) {
			void vscode.window.showInformationMessage(strings.setup.lookAppliedPartly(result.skipped.length))
		} else {
			void vscode.window.showInformationMessage(strings.setup.lookApplied)
		}
		await this.focusLibraryView()
	}

	/** Changes between British and American spelling. */
	async chooseSpelling(): Promise<void> {
		const answer = await this.spelling.ask()
		if (answer === undefined) {
			return
		}
		await this.spelling.remember(answer)

		if (answer === "british" && !this.spelling.britishAvailable()) {
			void vscode.window.showWarningMessage(strings.spelling.britishMissing)
			return
		}
		if (!this.profile.isApplied()) {
			void vscode.window.showInformationMessage(strings.spelling.takesEffectWithLook)
			return
		}
		// The setting lives in the writing folder, so it can only be written with
		// that folder open; it is caught up the next time it is.
		if (!this.library.isLibraryOpen()) {
			void vscode.window.showInformationMessage(strings.spelling.takesEffectInWriting)
			return
		}
		if (!vscode.workspace.isTrusted) {
			void vscode.window.showWarningMessage(strings.spelling.needsTrust)
			return
		}
		const result = await this.profile.apply({ only: [SPELLING_SETTING] })
		if (result.applied > 0) {
			void vscode.window.showInformationMessage(strings.spelling.changed(answer === "british"))
		} else {
			void vscode.window.showWarningMessage(strings.errors.couldNotWrite)
		}
	}

	/**
	 * Applies a spelling choice made while the writing was not open. Quiet: the
	 * writer already chose, and was told it would happen.
	 */
	private async catchUpOnSpelling(): Promise<void> {
		const wanted = this.spelling.languageSetting()
		if (wanted === undefined || !this.profile.isApplied() || !vscode.workspace.isTrusted) {
			return
		}
		const current = vscode.workspace.getConfiguration().inspect(SPELLING_SETTING)?.workspaceValue
		if (current !== wanted) {
			await this.profile.apply({ only: [SPELLING_SETTING] })
		}
	}

	async restoreNormalLook(): Promise<void> {
		const result = await this.profile.restore()

		if (!result.hadSnapshot) {
			void vscode.window.showInformationMessage(strings.setup.lookRestoreNothingToDo)
			return
		}
		// The writing folder's own part can only be undone with it open. Offering
		// to open it is pointless when it already is: what is waiting then belongs
		// to a place the writer has since moved away from, and is reported below
		// like any other setting that could not be changed back.
		if (result.waiting > 0 && !this.library.isLibraryOpen() && this.library.getLibraryUri()) {
			await this.offerToFinishRestoreInLibrary()
			return
		}
		if (result.failed.length > 0 || result.waiting > 0) {
			void vscode.window.showWarningMessage(
				strings.setup.lookRestoredPartly(result.failed.length + result.waiting),
			)
			return
		}
		void vscode.window.showInformationMessage(strings.setup.lookRestored)
	}

	private async offerToFinishRestoreInLibrary(): Promise<void> {
		const choice = await vscode.window.showInformationMessage(
			strings.setup.lookRestoreNeedsLibrary,
			{ modal: true, detail: strings.setup.lookRestoreNeedsLibraryDetail },
			strings.setup.lookNeedsLibraryOpen,
		)
		if (choice !== strings.setup.lookNeedsLibraryOpen) {
			// Nothing is lost by saying no: the record stays, and running restore
			// again from the writing finishes the job.
			return
		}
		await this.context.globalState.update(PENDING_SETUP_KEY, {
			applyLook: false,
			openWelcome: false,
			restoreLook: true,
		} satisfies PendingSetup)
		if (!(await this.openLibraryRespectingWindow())) {
			await this.context.globalState.update(PENDING_SETUP_KEY, undefined)
		}
	}

	private async offerToReopenLibrary(): Promise<void> {
		const library = this.library.getLibraryUri()
		if (!library) {
			return
		}
		const choice = await vscode.window.showInformationMessage(
			strings.setup.reopenPrompt(this.describe(library)),
			strings.setup.reopenYes,
			strings.setup.reopenNo,
		)
		if (choice === strings.setup.reopenYes) {
			await this.openLibraryRespectingWindow()
			return
		}
		// Anything other than yes, including dismissing the notification, counts as
		// "not now". Asking on every launch is the definition of nagging.
		await this.context.globalState.update(REOPEN_PROMPT_KEY, true)
	}

	/**
	 * Opens the library, asking first when doing so would throw away whatever the
	 * writer currently has open. Returns false if they declined.
	 */
	private async openLibraryRespectingWindow(): Promise<boolean> {
		if (!this.library.hasDifferentFolderOpen()) {
			await this.library.openLibrary(false)
			return true
		}

		const choice = await vscode.window.showInformationMessage(
			strings.setup.replaceWindowPrompt,
			{ modal: true, detail: strings.setup.replaceWindowDetail },
			strings.setup.replaceWindowNew,
			strings.setup.replaceWindowHere,
		)
		if (choice === strings.setup.replaceWindowNew) {
			await this.library.openLibrary(true)
			return true
		}
		if (choice === strings.setup.replaceWindowHere) {
			await this.library.openLibrary(false)
			return true
		}
		return false
	}

	private async openWelcome(): Promise<void> {
		const library = this.library.getLibraryUri()
		if (!library) {
			return
		}
		const own = vscode.Uri.joinPath(library, "Welcome.md")
		try {
			await vscode.workspace.fs.stat(own)
		} catch {
			// None in the library, because it was set up in a folder that was
			// already in use. The shipped one is shown to read, not added.
			try {
				await vscode.commands.executeCommand("markdown.showPreview", this.library.bundledWelcomeUri())
			} catch {
				// No welcome piece is not worth telling the writer about.
			}
			return
		}
		try {
			const document = await vscode.workspace.openTextDocument(own)
			await vscode.window.showTextDocument(document, { preview: false })
		} catch {
			// No welcome piece is not worth telling the writer about.
		}
	}

	private async focusLibraryView(): Promise<void> {
		try {
			await vscode.commands.executeCommand("writersStudio.library.focus")
		} catch {
			// The view may not be ready yet; the sidebar still works.
		}
	}

	/**
	 * Shows My Writing in the sidebar without taking the cursor off the page, so
	 * a writer who reopens VS Code mid-sentence can keep typing.
	 */
	private async showLibraryList(): Promise<void> {
		const wasOnThePage = vscode.window.activeTextEditor !== undefined
		try {
			await vscode.commands.executeCommand("workbench.view.extension.writersStudio")
			if (wasOnThePage) {
				await vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup")
			}
		} catch {
			// The sidebar may not be ready yet; it still works when clicked.
		}
	}

	private isInsideDocuments(uri: vscode.Uri): boolean {
		const documents = path.join(os.homedir(), "Documents")
		return uri.fsPath.startsWith(documents + path.sep)
	}

	/** A place described the way a person would say it, not as a full path. */
	private describe(uri: vscode.Uri): string {
		const home = os.homedir()
		const full = uri.fsPath
		return full.startsWith(home) ? `~${full.slice(home.length)}` : full
	}
}
