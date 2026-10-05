import * as vscode from "vscode"
import { describeWhen } from "../ui/relativeTime"
import { strings } from "../ui/strings"
import { DocumentEntry, LibraryService } from "./libraryService"

export class DocumentTreeItem extends vscode.TreeItem {
	constructor(readonly entry: DocumentEntry) {
		super(entry.title, vscode.TreeItemCollapsibleState.None)

		this.id = entry.uri.toString()
		this.resourceUri = entry.uri
		this.contextValue = "writersStudio.document"
		this.iconPath = new vscode.ThemeIcon("book")
		this.description = entry.modified > 0 ? describeWhen(entry.modified) : undefined

		const lines = [entry.title]
		if (entry.modified > 0) {
			lines.push(strings.library.lastEdited(describeWhen(entry.modified)))
		}
		if (entry.words !== undefined) {
			lines.push(strings.library.wordsLabel(entry.words))
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

export class LibraryTreeProvider implements vscode.TreeDataProvider<DocumentTreeItem> {
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

	getTreeItem(element: DocumentTreeItem): vscode.TreeItem {
		return element
	}

	async getChildren(element?: DocumentTreeItem): Promise<DocumentTreeItem[]> {
		// A flat list: one piece of writing is the unit of work.
		if (element) {
			return []
		}
		const entries = await this.library.listDocuments()
		return entries.map((entry) => new DocumentTreeItem(entry))
	}
}
