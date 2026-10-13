import * as vscode from "vscode"
import { describeWhen } from "../ui/relativeTime"
import { strings } from "../ui/strings"
import { DocumentEntry, LibraryService } from "./libraryService"

export class DocumentTreeItem extends vscode.TreeItem {
	/**
	 * @param trashed A piece in the trash: same row, but its right-click menu
	 *   offers to put it back instead of rename, copy, or move to trash.
	 */
	constructor(
		readonly entry: DocumentEntry,
		readonly trashed = false,
	) {
		super(entry.title, vscode.TreeItemCollapsibleState.None)

		this.id = entry.uri.toString()
		this.resourceUri = entry.uri
		this.contextValue = trashed ? "writersStudio.trashedDocument" : "writersStudio.document"
		this.iconPath = new vscode.ThemeIcon("book")
		this.description = entry.modified > 0 ? describeWhen(entry.modified) : undefined

		const lines = [entry.title]
		if (entry.modified > 0) {
			lines.push(strings.library.lastEdited(describeWhen(entry.modified)))
		}
		if (entry.words !== undefined) {
			lines.push(strings.library.wordsLabel(entry.words))
		}
		if (trashed) {
			lines.push(strings.library.trashedTooltip)
		}
		this.tooltip = lines.join("\n")

		// A single click opens the piece, which is what a writer expects.
		this.command = {
			command: "vscode.open",
			title: strings.buttons.showMe,
			arguments: [entry.uri, { preview: false } satisfies vscode.TextDocumentShowOptions],
		}
	}
}

/** The Trash, at the bottom of the list, holding what was moved there. */
export class TrashTreeItem extends vscode.TreeItem {
	constructor(count: number) {
		super(strings.library.trashGroup, vscode.TreeItemCollapsibleState.Collapsed)
		this.id = "writersStudio.trash"
		this.contextValue = "writersStudio.trash"
		this.iconPath = new vscode.ThemeIcon("trash")
		this.description = strings.library.trashCount(count)
		this.tooltip = strings.library.trashTooltip
	}
}

type LibraryTreeElement = DocumentTreeItem | TrashTreeItem

export class LibraryTreeProvider implements vscode.TreeDataProvider<LibraryTreeElement> {
	private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<void>()
	readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event

	private readonly disposables: vscode.Disposable[] = []

	constructor(private readonly library: LibraryService) {
		this.disposables.push(this.library.onDidChange(() => this.refresh()))
	}

	dispose(): void {
		this.onDidChangeTreeDataEmitter.dispose()
		for (const disposable of this.disposables) {
			disposable.dispose()
		}
	}

	refresh(): void {
		this.onDidChangeTreeDataEmitter.fire()
	}

	getTreeItem(element: LibraryTreeElement): vscode.TreeItem {
		return element
	}

	async getChildren(element?: LibraryTreeElement): Promise<LibraryTreeElement[]> {
		if (element instanceof TrashTreeItem) {
			const trashed = await this.library.listTrash()
			return trashed.map((entry) => new DocumentTreeItem(entry, true))
		}
		// Otherwise a flat list: one piece of writing is the unit of work. The
		// trash is the one group, last, and only there when it has something in it.
		if (element) {
			return []
		}
		const [entries, trashed] = await Promise.all([this.library.listDocuments(), this.library.listTrash()])
		const items: LibraryTreeElement[] = entries.map((entry) => new DocumentTreeItem(entry))
		if (trashed.length > 0) {
			items.push(new TrashTreeItem(trashed.length))
		}
		return items
	}
}
