import * as vscode from "vscode"
import { strings } from "../ui/strings"
import { FirstRun } from "./firstRun"
import { LibraryService } from "./libraryService"
import { DocumentTreeItem } from "./libraryTreeProvider"
import { displayTitleFromFileName, isValidTitle } from "./naming"

/**
 * The commands behind the sidebar buttons and right-click menu.
 *
 * Every one of these is safe to run when nothing is set up yet: the writer is
 * offered setup instead of being shown an error.
 */
export class DocumentCommands {
	constructor(
		private readonly library: LibraryService,
		private readonly firstRun: FirstRun,
	) {}

	async newDraft(): Promise<void> {
		if (!(await this.ensureLibrary())) {
			return
		}

		const title = await vscode.window.showInputBox({
			title: strings.library.newDraftPrompt,
			placeHolder: strings.library.newDraftPlaceholder,
			validateInput: (value) =>
				value.trim().length === 0 || isValidTitle(value) ? undefined : strings.library.renameInvalid,
		})
		// Escape means "changed my mind", which is not the same as a blank name.
		if (title === undefined) {
			return
		}

		await this.createAndOpen(title.trim() || undefined)
	}

	async newDraftFromTemplate(): Promise<void> {
		if (!(await this.ensureLibrary())) {
			return
		}

		const templates = await this.library.listTemplates()
		const blankChoice: vscode.QuickPickItem = {
			label: strings.drafts.templateBlank,
			detail: strings.drafts.templateBlankDetail,
		}
		const picked = await vscode.window.showQuickPick(
			[blankChoice, ...templates.map((template) => ({ label: template.title }))],
			{ title: strings.drafts.templatePickTitle },
		)
		if (!picked) {
			return
		}

		const title = await vscode.window.showInputBox({
			title: strings.library.newDraftPrompt,
			placeHolder: strings.library.newDraftPlaceholder,
			validateInput: (value) =>
				value.trim().length === 0 || isValidTitle(value) ? undefined : strings.library.renameInvalid,
		})
		if (title === undefined) {
			return
		}

		const template = templates.find((candidate) => candidate.title === picked.label)
		await this.createAndOpen(title.trim() || undefined, template?.uri)
	}

	async rename(item?: DocumentTreeItem): Promise<void> {
		const target = await this.resolveTarget(item)
		if (!target) {
			return
		}

		const current = item?.entry.title ?? displayTitleFromFileName(basename(target))
		const existing = (await this.library.listDocuments()).filter(
			(entry) => entry.uri.toString() !== target.toString(),
		)

		const newTitle = await vscode.window.showInputBox({
			title: strings.library.renamePrompt,
			value: current,
			valueSelection: [0, current.length],
			validateInput: (value) => {
				if (!isValidTitle(value)) {
					return strings.library.renameInvalid
				}
				const clash = existing.some((entry) => entry.title.toLowerCase() === value.trim().toLowerCase())
				return clash ? strings.library.renameTaken : undefined
			},
		})
		if (newTitle === undefined || newTitle.trim() === current) {
			return
		}

		try {
			// A rename can decline without throwing, for instance when the new name
			// reduces to nothing usable. Silence would leave the writer believing it
			// had worked.
			const renamed = await this.library.renameDocument(target, newTitle.trim())
			if (!renamed) {
				void vscode.window.showErrorMessage(strings.errors.couldNotWrite)
			}
		} catch {
			void vscode.window.showErrorMessage(strings.errors.couldNotWrite)
		}
	}

	async duplicate(item?: DocumentTreeItem): Promise<void> {
		const target = await this.resolveTarget(item)
		if (!target) {
			return
		}
		try {
			const copy = await this.library.duplicateDocument(target)
			if (copy) {
				await this.open(copy)
			}
		} catch {
			void vscode.window.showErrorMessage(strings.errors.couldNotWrite)
		}
	}

	async trash(item?: DocumentTreeItem): Promise<void> {
		const target = await this.resolveTarget(item)
		if (!target) {
			return
		}

		const title = item?.entry.title ?? displayTitleFromFileName(basename(target))
		const confirmed = await vscode.window.showWarningMessage(
			strings.library.trashConfirm(title),
			{ modal: true, detail: strings.library.trashConfirmDetail },
			strings.library.trashConfirmYes,
		)
		if (confirmed !== strings.library.trashConfirmYes) {
			return
		}

		// Close the piece first so the writer is not left looking at a file that
		// has moved out from under them.
		await this.closeIfOpen(target)

		try {
			await this.library.trashDocument(target)
			void vscode.window.showInformationMessage(strings.library.trashed(title))
		} catch {
			void vscode.window.showErrorMessage(strings.errors.couldNotWrite)
		}
	}

	async reveal(item?: DocumentTreeItem): Promise<void> {
		const target = await this.resolveTarget(item)
		if (!target) {
			return
		}
		await vscode.commands.executeCommand("revealFileInOS", target)
	}

	async openLibrary(): Promise<void> {
		if (!(await this.ensureLibrary())) {
			return
		}
		if (this.library.isLibraryOpen()) {
			void vscode.window.showInformationMessage(strings.setup.alreadySetUp)
			await vscode.commands.executeCommand("writersStudio.library.focus")
			return
		}
		// Replacing the window is what the writer asked for by choosing this
		// command, so it does not ask again.
		await this.library.openLibrary(false)
	}

	// ---- Helpers -----------------------------------------------------------

	private async createAndOpen(title: string | undefined, templateUri?: vscode.Uri): Promise<void> {
		try {
			const created = await this.library.createDraft(title, templateUri)
			if (created) {
				await this.open(created)
			}
		} catch {
			void vscode.window.showErrorMessage(strings.errors.couldNotWrite)
		}
	}

	private async open(uri: vscode.Uri): Promise<void> {
		const document = await vscode.workspace.openTextDocument(uri)
		const editor = await vscode.window.showTextDocument(document, { preview: false })
		// Put the cursor at the end so the writer can simply start typing.
		const end = document.lineAt(document.lineCount - 1).range.end
		editor.selection = new vscode.Selection(end, end)
	}

	private async closeIfOpen(uri: vscode.Uri): Promise<void> {
		for (const group of vscode.window.tabGroups.all) {
			for (const tab of group.tabs) {
				const input = tab.input
				if (input instanceof vscode.TabInputText && input.uri.toString() === uri.toString()) {
					await vscode.window.tabGroups.close(tab)
				}
			}
		}
	}

	/**
	 * The piece the writer means: the one they right-clicked, or the open one.
	 *
	 * Every candidate is checked for real containment in the library, links
	 * followed, before it is handed back. These commands rename, copy, and move
	 * files, and a registered command can be invoked with any argument at all, so
	 * the sidebar item is not evidence that the file belongs to the writer's
	 * library.
	 */
	private async resolveTarget(item?: DocumentTreeItem): Promise<vscode.Uri | undefined> {
		const candidate = item?.entry.uri ?? vscode.window.activeTextEditor?.document.uri

		if (!candidate) {
			void vscode.window.showInformationMessage(strings.handoff.nothingOpen)
			return undefined
		}
		if (!(await this.library.isInLibraryResolved(candidate))) {
			void vscode.window.showInformationMessage(strings.handoff.notInLibrary)
			return undefined
		}
		return candidate
	}

	private async ensureLibrary(): Promise<boolean> {
		if (this.library.getLibraryUri()) {
			return true
		}
		const choice = await vscode.window.showInformationMessage(
			strings.library.noLibraryYet,
			strings.library.setUpNow,
		)
		if (choice === strings.library.setUpNow) {
			await this.firstRun.offerSetup()
		}
		return this.library.getLibraryUri() !== undefined
	}
}

function basename(uri: vscode.Uri): string {
	const parts = uri.path.split("/")
	return parts[parts.length - 1] ?? ""
}
