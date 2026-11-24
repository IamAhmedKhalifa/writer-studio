import * as path from "path"
import * as vscode from "vscode"
import { extractTitle } from "../library/naming"
import { toPlainText } from "../stats/wordCount"
import { strings } from "../ui/strings"
import { remoteImageHosts, renderBody, renderPage } from "./render"
import { copyRichText } from "./richClipboard"

/** `a.com`, `a.com and b.com`, `a.com, b.com and c.com`. */
function listPlaces(places: readonly string[]): string {
	if (places.length <= 1) {
		return places[0] ?? ""
	}
	return `${places.slice(0, -1).join(", ")} and ${places[places.length - 1]}`
}

/**
 * Getting finished work out of the app: onto the clipboard, or into a web page
 * the writer can hand to somebody.
 */
export class Handoff {
	constructor(private readonly extensionUri: vscode.Uri) {}

	/** Formatted text, ready to paste into a blog, newsletter, or document. */
	async copyForWebsite(): Promise<void> {
		const document = this.activeDocument()
		if (!document) {
			return
		}

		const html = renderBody(document.getText())

		// The rich copy renders the document in a web view. In a folder the writer
		// has not vouched for, fall straight through to the plain path rather than
		// rendering its contents at all.
		const rich = vscode.workspace.isTrusted ? await copyRichText(html) : false
		if (rich) {
			void vscode.window.showInformationMessage(strings.handoff.copiedHtml)
			return
		}

		// Falling back to the markup itself, which still pastes correctly into
		// the HTML view that every blogging tool provides.
		await vscode.env.clipboard.writeText(html)
		void vscode.window.showInformationMessage(strings.handoff.copiedHtmlAsMarkup)
	}

	/** The words with every formatting mark removed. */
	async copyAsPlainText(): Promise<void> {
		const document = this.activeDocument()
		if (!document) {
			return
		}
		await vscode.env.clipboard.writeText(toPlainText(document.getText()))
		void vscode.window.showInformationMessage(strings.handoff.copiedPlain)
	}

	/** A single styled file that opens in any web browser. */
	async exportAsWebPage(): Promise<void> {
		const document = this.activeDocument()
		if (!document) {
			return
		}

		const markdown = document.getText()
		const title = extractTitle(markdown) ?? path.basename(document.uri.fsPath, path.extname(document.uri.fsPath))
		const suggested = vscode.Uri.file(
			path.join(path.dirname(document.uri.fsPath), `${path.basename(document.uri.fsPath, ".md")}.html`),
		)

		const target = await vscode.window.showSaveDialog({
			defaultUri: suggested,
			filters: { "Web page": ["html"] },
			saveLabel: strings.handoff.saveLabel,
			title: strings.handoff.saveTitle,
		})
		if (!target) {
			return
		}

		try {
			const css = await this.readExportStyles()
			const page = renderPage(markdown, title, css)
			await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(page))

			// An exported page is meant to be one self-contained file. A picture
			// stored on somebody else's website is the one thing that breaks that
			// promise, and the writer is the only person who can decide whether
			// that matters, so they are told rather than left to find out.
			const places = remoteImageHosts(markdown)
			const name = path.basename(target.fsPath)
			void vscode.window.showInformationMessage(
				places.length > 0
					? strings.handoff.exportedNeedsInternet(name, listPlaces(places))
					: strings.handoff.exported(name),
			)
		} catch {
			void vscode.window.showErrorMessage(strings.handoff.exportFailed)
		}
	}

	/** Side-by-side view of the finished piece. */
	async showPreview(): Promise<void> {
		if (!this.activeDocument()) {
			return
		}
		await vscode.commands.executeCommand("markdown.showPreviewToSide")
	}

	private activeDocument(): vscode.TextDocument | undefined {
		const editor = vscode.window.activeTextEditor
		if (!editor) {
			void vscode.window.showInformationMessage(strings.handoff.nothingOpen)
			return undefined
		}
		if (editor.document.languageId !== "markdown") {
			void vscode.window.showInformationMessage(strings.handoff.notWriting)
			return undefined
		}
		return editor.document
	}

	private async readExportStyles(): Promise<string> {
		const uri = vscode.Uri.joinPath(this.extensionUri, "media", "writer-export.css")
		try {
			return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))
		} catch {
			// A page without styling is still a usable page.
			return ""
		}
	}
}
