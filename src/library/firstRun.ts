import * as os from "os"
import * as path from "path"
import * as vscode from "vscode"
import { WriterProfile } from "../profile/writerProfile"
import { strings } from "../ui/strings"
import { LibraryService } from "./libraryService"

const REOPEN_PROMPT_KEY = "writersStudio.suppressReopenPrompt"
const SETUP_OFFERED_KEY = "writersStudio.setupOffered"
const PENDING_SETUP_KEY = "writersStudio.pendingSetup"

interface PendingSetup {
	/** Apply the writing look once the library is the folder that is open. */
	applyLook: boolean
	/** Open the welcome piece. */
	openWelcome: boolean
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

	private async adoptLibrary(uri: vscode.Uri): Promise<void> {
		try {
			await this.library.ensureLibrary(uri)
		} catch {
			void vscode.window.showErrorMessage(strings.errors.couldNotCreatePlace(this.describe(uri)))
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

	private async finishSetup(pending: PendingSetup): Promise<void> {
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

	async restoreNormalLook(): Promise<void> {
		const result = await this.profile.restore()

		if (!result.hadSnapshot) {
			void vscode.window.showInformationMessage(strings.setup.lookRestoreNothingToDo)
			return
		}
		if (result.failed.length > 0) {
			void vscode.window.showWarningMessage(strings.setup.lookRestoredPartly(result.failed.length))
			return
		}
		void vscode.window.showInformationMessage(strings.setup.lookRestored)
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
		try {
			const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(library, "Welcome.md"))
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
