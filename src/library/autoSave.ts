import * as vscode from "vscode"
import type { LibraryService } from "./libraryService"

/** How long after the last keystroke a piece is saved. */
export const AUTOSAVE_DELAY_MS = 1000

const PIECE = /\.(md|markdown)$/i

/**
 * Saves pieces in the writing folder a moment after the writer stops typing.
 *
 * VS Code's own autosave is a setting, and settings are only changed once the
 * writer trusts the folder and accepts the writing look. A writer who said no
 * to either was promised that their work saves itself and got nothing but hot
 * exit. Saving here changes no setting, so it needs neither.
 *
 * Only files inside the writing folder are touched: a writer who also codes
 * keeps exactly the saving behaviour they chose everywhere else.
 */
export class PieceAutoSave implements vscode.Disposable {
	private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
	private readonly subscriptions: vscode.Disposable[]

	constructor(
		private readonly library: LibraryService,
		private readonly delayMs = AUTOSAVE_DELAY_MS,
	) {
		this.subscriptions = [
			vscode.workspace.onDidChangeTextDocument((event) => {
				if (event.contentChanges.length > 0) {
					this.schedule(event.document)
				}
			}),
			vscode.workspace.onDidSaveTextDocument((document) => this.cancel(document)),
			vscode.workspace.onDidCloseTextDocument((document) => this.cancel(document)),
		]
	}

	dispose(): void {
		for (const timer of this.timers.values()) {
			clearTimeout(timer)
		}
		this.timers.clear()
		for (const subscription of this.subscriptions) {
			subscription.dispose()
		}
	}

	private schedule(document: vscode.TextDocument): void {
		if (!this.isPiece(document)) {
			return
		}
		this.cancel(document)
		const key = document.uri.toString()
		this.timers.set(
			key,
			setTimeout(() => {
				this.timers.delete(key)
				void this.save(document)
			}, this.delayMs),
		)
	}

	private cancel(document: vscode.TextDocument): void {
		const key = document.uri.toString()
		const timer = this.timers.get(key)
		if (timer !== undefined) {
			clearTimeout(timer)
			this.timers.delete(key)
		}
	}

	private isPiece(document: vscode.TextDocument): boolean {
		return !document.isUntitled && PIECE.test(document.uri.path) && this.library.isInLibrary(document.uri)
	}

	private async save(document: vscode.TextDocument): Promise<void> {
		// Saved by VS Code's autosave, or by the writer, in the meantime.
		if (document.isClosed || !document.isDirty) {
			return
		}
		// A name inside the folder can be a link to anywhere on the disk.
		if (!(await this.library.isInLibraryResolved(document.uri))) {
			return
		}
		try {
			// A save asked for by an extension counts as one the writer asked for,
			// so VS Code would run "format on save" and trim spaces on it. A
			// developer's formatter could then rewrite the page while it is being
			// typed. VS Code's own delayed autosave skips those steps, and so does
			// this, for the piece being typed in.
			if (vscode.window.activeTextEditor?.document === document) {
				await vscode.commands.executeCommand("workbench.action.files.saveWithoutFormatting")
			} else {
				await document.save()
			}
		} catch (error) {
			// Nothing is lost: the edit stays in the editor, hot exit keeps it,
			// and the next keystroke tries again. Logged for a bug report only.
			// eslint-disable-next-line no-console
			console.error("[writers-studio] saving a piece failed", error)
		}
	}
}
