import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import * as vscode from "vscode"
import { PREVIEW_STYLESHEET_PATH } from "../profile/settingsCatalog"
import { countWords } from "../stats/wordCount"
import {
	copyTitle,
	displayTitleFromFileName,
	draftFileName,
	extractTitle,
	retitleHeading,
	rewriteTitleLine,
	slugify,
	uniqueFileName,
} from "./naming"
import { fillTemplate } from "./templates"

const LIBRARY_KEY = "writersStudio.libraryPath"

const TEMPLATES_DIRECTORY = "Templates"
const TRASH_DIRECTORY = "Trash"
const DOCUMENT_EXTENSIONS = [".md", ".markdown"]

/** Files larger than this are listed but not counted, to keep the list quick. */
const MAX_BYTES_FOR_COUNTING = 1_000_000

/**
 * Autosave writes about once a second while someone types. Without this the
 * watcher turned every one of those saves into a full re-read of the library.
 */
const WATCHER_DEBOUNCE_MS = 750

export interface DocumentEntry {
	readonly uri: vscode.Uri
	readonly fileName: string
	readonly title: string
	readonly modified: number
	readonly words: number | undefined
}

interface TemplateEntry {
	readonly uri: vscode.Uri
	readonly title: string
}

/** A described document, remembered so an unchanged file is never re-read. */
interface CachedEntry {
	readonly modified: number
	readonly size: number
	readonly entry: DocumentEntry
}

export class LibraryService {
	private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
	readonly onDidChange = this.onDidChangeEmitter.event

	private watcher: vscode.FileSystemWatcher | undefined
	private notifyTimer: NodeJS.Timeout | undefined

	/** Keyed by file path, invalidated by modification time and size. */
	private readonly describeCache = new Map<string, CachedEntry>()

	constructor(private readonly context: vscode.ExtensionContext) {}

	dispose(): void {
		if (this.notifyTimer) {
			clearTimeout(this.notifyTimer)
		}
		this.watcher?.dispose()
		this.onDidChangeEmitter.dispose()
	}

	// ---- Where the writing lives ------------------------------------------

	getLibraryUri(): vscode.Uri | undefined {
		const stored = this.context.globalState.get<string>(LIBRARY_KEY)
		return stored ? vscode.Uri.file(stored) : undefined
	}

	async setLibraryUri(uri: vscode.Uri): Promise<void> {
		await this.context.globalState.update(LIBRARY_KEY, uri.fsPath)
		this.startWatching()
		this.announceChange()
	}

	/** `~/Documents/Writing`, or `~/Writing` where there is no Documents folder. */
	async suggestedLibraryUri(): Promise<vscode.Uri> {
		const home = os.homedir()
		const documents = vscode.Uri.file(path.join(home, "Documents"))
		try {
			const stat = await vscode.workspace.fs.stat(documents)
			if (stat.type & vscode.FileType.Directory) {
				return vscode.Uri.joinPath(documents, "Writing")
			}
		} catch {
			// No Documents folder on this machine.
		}
		return vscode.Uri.file(path.join(home, "Writing"))
	}

	/** True when the writer's library is the set of files currently open. */
	isLibraryOpen(): boolean {
		const library = this.getLibraryUri()
		if (!library) {
			return false
		}
		const folders = vscode.workspace.workspaceFolders ?? []
		return folders.some((folder) => this.isSamePath(folder.uri.fsPath, library.fsPath))
	}

	/** True when some other set of files is open instead. */
	hasDifferentFolderOpen(): boolean {
		const folders = vscode.workspace.workspaceFolders ?? []
		return folders.length > 0 && !this.isLibraryOpen()
	}

	async openLibrary(inNewWindow: boolean): Promise<void> {
		const library = this.getLibraryUri()
		if (!library) {
			return
		}
		await vscode.commands.executeCommand("vscode.openFolder", library, { forceNewWindow: inNewWindow })
	}

	// ---- Creating the library ----------------------------------------------

	/** Creates the library and its starter content. Safe to call repeatedly. */
	async ensureLibrary(uri: vscode.Uri): Promise<void> {
		await vscode.workspace.fs.createDirectory(uri)
		await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, TEMPLATES_DIRECTORY))
		await this.seedIfMissing(uri, "Welcome.md", "welcome.md")
		await this.seedIfMissing(uri, path.posix.join(TEMPLATES_DIRECTORY, "Blog post.md"), "template-blog-post.md")
		await this.seedIfMissing(uri, path.posix.join(TEMPLATES_DIRECTORY, "Essay.md"), "template-essay.md")
		await this.seedIfMissing(uri, path.posix.join(TEMPLATES_DIRECTORY, "Newsletter.md"), "template-newsletter.md")
		await this.installPreviewStylesheet(uri)
	}

	/**
	 * Copies the preview stylesheet into the library so `markdown.styles` can point
	 * at it with a relative path.
	 *
	 * The alternative was contributing the stylesheet globally, which restyled the
	 * Markdown preview in every project the writer ever opened and could not be
	 * undone by the restore command, because a manifest contribution is not a
	 * setting. Overwritten on every setup so an improved stylesheet reaches
	 * existing libraries.
	 */
	private async installPreviewStylesheet(library: vscode.Uri): Promise<void> {
		const target = vscode.Uri.joinPath(library, ...PREVIEW_STYLESHEET_PATH)
		const source = vscode.Uri.joinPath(this.context.extensionUri, "media", "writer-preview.css")
		try {
			await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(library, PREVIEW_STYLESHEET_PATH[0]))
			await vscode.workspace.fs.writeFile(target, await vscode.workspace.fs.readFile(source))
		} catch {
			// A plain preview is not worth failing setup over.
		}
	}

	private async seedIfMissing(library: vscode.Uri, relativePath: string, assetName: string): Promise<void> {
		const target = vscode.Uri.joinPath(library, ...relativePath.split("/"))
		if (await this.exists(target)) {
			return
		}
		const source = vscode.Uri.joinPath(this.context.extensionUri, "media", "seed", assetName)
		try {
			const content = await vscode.workspace.fs.readFile(source)
			await vscode.workspace.fs.writeFile(target, content)
		} catch {
			// A missing starter file must never block setup.
		}
	}

	// ---- Reading the library ------------------------------------------------

	async listDocuments(): Promise<DocumentEntry[]> {
		const library = this.getLibraryUri()
		if (!library) {
			return []
		}

		let children: [string, vscode.FileType][]
		try {
			children = await vscode.workspace.fs.readDirectory(library)
		} catch {
			return []
		}

		const candidates = children.filter(([name, type]) => {
			if (type & vscode.FileType.Directory) {
				return false
			}
			// A symlink in the library can point anywhere on the disk. Reading one
			// would put a file from outside the library into the list, so they are
			// left out entirely.
			if (type & vscode.FileType.SymbolicLink) {
				return false
			}
			return this.isDocument(name)
		})

		// Described in parallel: this used to be a serialised read of every file in
		// the library, which on a few hundred pieces meant hundreds of round trips
		// before the sidebar could draw.
		const entries = await Promise.all(
			candidates.map(([name]) => this.describe(vscode.Uri.joinPath(library, name), name)),
		)

		this.pruneCache(new Set(entries.map((entry) => entry.uri.fsPath)), library)
		return [...entries].sort((a, b) => b.modified - a.modified)
	}

	async listTemplates(): Promise<TemplateEntry[]> {
		const library = this.getLibraryUri()
		if (!library) {
			return []
		}
		const templatesUri = vscode.Uri.joinPath(library, TEMPLATES_DIRECTORY)
		try {
			const children = await vscode.workspace.fs.readDirectory(templatesUri)
			return children
				.filter(([name, type]) => !(type & vscode.FileType.Directory) && this.isDocument(name))
				.map(([name]) => ({
					uri: vscode.Uri.joinPath(templatesUri, name),
					title: displayTitleFromFileName(name),
				}))
				.sort((a, b) => a.title.localeCompare(b.title))
		} catch {
			return []
		}
	}

	/**
	 * Reads a document's title and word count, reusing the previous answer when the
	 * file has not changed.
	 *
	 * The cache is what makes the sidebar affordable. Autosave means one file
	 * changes every second or so while somebody writes; without this, every one of
	 * those saves re-read and re-counted every other piece in the library too.
	 */
	private async describe(uri: vscode.Uri, fileName: string): Promise<DocumentEntry> {
		let modified = 0
		let words: number | undefined
		let title: string | undefined

		try {
			const stat = await vscode.workspace.fs.stat(uri)
			modified = stat.mtime

			const cached = this.describeCache.get(uri.fsPath)
			if (cached && cached.modified === stat.mtime && cached.size === stat.size) {
				return cached.entry
			}

			if (stat.size <= MAX_BYTES_FOR_COUNTING) {
				const content = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))
				title = extractTitle(content)
				words = countWords(content)
			}

			const entry: DocumentEntry = {
				uri,
				fileName,
				title: title ?? displayTitleFromFileName(fileName),
				modified,
				words,
			}
			this.describeCache.set(uri.fsPath, { modified: stat.mtime, size: stat.size, entry })
			return entry
		} catch {
			// Listed without detail rather than hidden.
			return {
				uri,
				fileName,
				title: displayTitleFromFileName(fileName),
				modified,
				words: undefined,
			}
		}
	}

	/**
	 * Forgets cache entries for pieces no longer in `directory`. Entries for other
	 * folders, the trash among them, are left for their own listing to manage.
	 */
	private pruneCache(live: Set<string>, directory: vscode.Uri): void {
		for (const key of this.describeCache.keys()) {
			if (this.isSamePath(path.dirname(key), directory.fsPath) && !live.has(key)) {
				this.describeCache.delete(key)
			}
		}
	}

	// ---- Changing the library ----------------------------------------------

	async createDraft(title: string | undefined, templateUri?: vscode.Uri): Promise<vscode.Uri | undefined> {
		const library = this.getLibraryUri()
		if (!library) {
			return undefined
		}

		const existing = await this.existingFileNames(library)
		const desired = draftFileName(title ?? "", new Date())
		const fileName = uniqueFileName(desired, existing)
		const target = vscode.Uri.joinPath(library, fileName)

		let content = title ? `# ${title}\n\n` : ""
		if (templateUri) {
			try {
				const template = new TextDecoder().decode(await vscode.workspace.fs.readFile(templateUri))
				content = fillTemplate(template, title)
			} catch {
				// Fall back to the blank page rather than failing.
			}
		}

		await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(content))
		this.announceChange()
		return target
	}

	async renameDocument(uri: vscode.Uri, newTitle: string): Promise<vscode.Uri | undefined> {
		const library = this.getLibraryUri()
		if (!library) {
			return undefined
		}
		const slug = slugify(newTitle)
		if (!slug) {
			return undefined
		}

		const currentName = path.basename(uri.fsPath)
		const datePrefix = /^(\d{4}-\d{2}-\d{2})-/.exec(currentName)?.[1]
		const extension = path.extname(currentName) || ".md"
		const desired = `${datePrefix ? `${datePrefix}-` : ""}${slug}${extension}`
		if (desired.toLowerCase() === currentName.toLowerCase()) {
			// The file name is already right, but the title the writer typed may
			// still differ from the one on the page: "morning" to "Morning", or an
			// added question mark, both reduce to the same file name. Rewriting the
			// heading is the whole of the rename in that case, so it must not be
			// skipped just because there is no file to move.
			await this.retitleHeadingInPlace(uri, newTitle)
			this.announceChange()
			return uri
		}

		const existing = (await this.existingFileNames(library)).filter(
			(name) => name.toLowerCase() !== currentName.toLowerCase(),
		)
		const target = vscode.Uri.joinPath(library, uniqueFileName(desired, existing))

		// A workspace edit is used rather than a plain rename so that an open
		// piece stays open, and links to it elsewhere are updated.
		const edit = new vscode.WorkspaceEdit()
		edit.renameFile(uri, target, { overwrite: false })
		const applied = await vscode.workspace.applyEdit(edit)
		if (!applied) {
			return undefined
		}

		await this.retitleHeadingInPlace(target, newTitle)

		this.announceChange()
		return target
	}

	/**
	 * Puts the new name into the piece's own title line.
	 *
	 * The sidebar titles every piece by that line, so renaming the file on its own
	 * left the previous name on screen: from the writer's side, Rename did nothing.
	 *
	 * Which line that is, and whether it may be rewritten at all, is decided by
	 * `retitleHeading` against the single scan the sidebar itself uses. A piece
	 * titled by its opening sentence is left untouched: the sidebar will go on
	 * showing that sentence, which is a far better outcome than rewriting the
	 * first line of somebody's essay because they renamed a file.
	 */
	private async retitleHeadingInPlace(uri: vscode.Uri, newTitle: string): Promise<void> {
		try {
			// A piece the writer has open is edited through the editor, so the page
			// in front of them updates and Undo puts the old title back. A piece
			// that is not open is written straight to disk: opening it merely to
			// change one line would pull it into the editor's document store and
			// record a local history entry for a file nobody is looking at.
			const open = vscode.workspace.textDocuments.find(
				(document) => document.uri.toString() === uri.toString(),
			)
			if (open) {
				await this.retitleOpenDocument(open, newTitle)
				return
			}

			const content = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))
			const rewritten = rewriteTitleLine(content, newTitle)
			if (rewritten !== undefined) {
				await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(rewritten))
			}
		} catch {
			// The file name is the rename that matters; the heading is a courtesy.
		}
	}

	private async retitleOpenDocument(document: vscode.TextDocument, newTitle: string): Promise<void> {
		const heading = retitleHeading(document.getText(), newTitle)
		if (!heading) {
			return
		}
		const line = document.lineAt(heading.lineIndex)
		if (line.text === heading.text) {
			return
		}

		const edit = new vscode.WorkspaceEdit()
		edit.replace(document.uri, line.range, heading.text)
		if (await vscode.workspace.applyEdit(edit)) {
			// Saved because the sidebar reads titles from the file on disk.
			await document.save()
		}
	}

	async duplicateDocument(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
		const library = this.getLibraryUri()
		if (!library) {
			return undefined
		}
		const currentName = path.basename(uri.fsPath)
		const extension = path.extname(currentName) || ".md"
		const stem = currentName.slice(0, currentName.length - extension.length)
		const existing = await this.existingFileNames(library)
		const target = vscode.Uri.joinPath(library, uniqueFileName(`${copyTitle(stem)}${extension}`, existing))
		await vscode.workspace.fs.copy(uri, target, { overwrite: false })
		this.announceChange()
		return target
	}

	/**
	 * Moves a piece into a Trash folder inside the library rather than deleting
	 * it, so that "move to trash" is always reversible by the writer.
	 */
	async trashDocument(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
		const library = this.getLibraryUri()
		if (!library) {
			return undefined
		}
		const trash = vscode.Uri.joinPath(library, TRASH_DIRECTORY)
		await vscode.workspace.fs.createDirectory(trash)

		const currentName = path.basename(uri.fsPath)
		const existing = await this.existingFileNames(trash)
		const target = vscode.Uri.joinPath(trash, uniqueFileName(currentName, existing))
		await vscode.workspace.fs.rename(uri, target, { overwrite: false })
		this.announceChange()
		return target
	}

	/**
	 * The pieces in the trash, newest first.
	 *
	 * Listed in the sidebar because a trash nobody can find is not a way to get
	 * anything back: a writer looked in the app, every menu, and the computer's
	 * own bin, and found nothing.
	 */
	async listTrash(): Promise<DocumentEntry[]> {
		const library = this.getLibraryUri()
		if (!library) {
			return []
		}
		const trash = vscode.Uri.joinPath(library, TRASH_DIRECTORY)
		let children: [string, vscode.FileType][]
		try {
			children = await vscode.workspace.fs.readDirectory(trash)
		} catch {
			return []
		}
		const entries = await Promise.all(
			children
				.filter(([name, type]) => type === vscode.FileType.File && this.isDocument(name))
				.map(([name]) => this.describe(vscode.Uri.joinPath(trash, name), name)),
		)
		this.pruneCache(new Set(entries.map((entry) => entry.uri.fsPath)), trash)
		return entries.sort((a, b) => b.modified - a.modified)
	}

	/**
	 * Moves a piece out of the trash and back among the others, under a new name
	 * if one of the same name has been written since. Returns where it went, or
	 * undefined when `uri` is not in this library's trash.
	 */
	async restoreFromTrash(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
		const library = this.getLibraryUri()
		if (!library) {
			return undefined
		}
		const trash = vscode.Uri.joinPath(library, TRASH_DIRECTORY)
		if (!this.isSamePath(path.dirname(uri.fsPath), trash.fsPath) || !(await this.isInLibraryResolved(uri))) {
			return undefined
		}

		const existing = await this.existingFileNames(library)
		const target = vscode.Uri.joinPath(library, uniqueFileName(path.basename(uri.fsPath), existing))
		await vscode.workspace.fs.rename(uri, target, { overwrite: false })
		this.announceChange()
		return target
	}

	/**
	 * True when the document sits inside the writer's library, judged on the path
	 * alone.
	 *
	 * Cheap enough for a context key that updates on every editor change. Use
	 * `isInLibraryResolved` before acting on a file, because this cannot see that a
	 * name inside the library is a link to somewhere else.
	 */
	isInLibrary(uri: vscode.Uri): boolean {
		const library = this.getLibraryUri()
		if (!library || uri.scheme !== "file") {
			return false
		}
		return isContained(library.fsPath, uri.fsPath)
	}

	/**
	 * True when the document really is inside the library once every link in both
	 * paths has been followed.
	 *
	 * Comparing paths textually is not enough before copying, renaming, or moving a
	 * file: a symlink sitting in the library satisfies the textual check while
	 * pointing anywhere on the disk.
	 */
	async isInLibraryResolved(uri: vscode.Uri): Promise<boolean> {
		const library = this.getLibraryUri()
		if (!library || uri.scheme !== "file") {
			return false
		}
		try {
			const [realLibrary, realTarget] = await Promise.all([
				fs.realpath(library.fsPath),
				fs.realpath(uri.fsPath),
			])
			return isContained(realLibrary, realTarget)
		} catch {
			// A path that cannot be resolved is not one to act on.
			return false
		}
	}

	// ---- Watching ----------------------------------------------------------

	startWatching(): void {
		this.watcher?.dispose()
		const library = this.getLibraryUri()
		if (!library) {
			return
		}
		// The trash too, so a piece moved there or back outside the app shows up.
		const pattern = new vscode.RelativePattern(
			library,
			`{*.md,*.markdown,${TRASH_DIRECTORY}/*.md,${TRASH_DIRECTORY}/*.markdown}`,
		)
		this.watcher = vscode.workspace.createFileSystemWatcher(pattern)
		this.watcher.onDidCreate(() => this.notifyChanged())
		this.watcher.onDidDelete(() => this.notifyChanged())
		this.watcher.onDidChange(() => this.notifyChanged())
	}

	/**
	 * Announces a change to the library, at most once per debounce window.
	 *
	 * Autosave fires the watcher roughly once a second for as long as somebody
	 * keeps typing. Each announcement redraws the sidebar, so without coalescing a
	 * writing session became a permanent background re-read of the library.
	 */
	private notifyChanged(): void {
		if (this.notifyTimer) {
			clearTimeout(this.notifyTimer)
		}
		this.notifyTimer = setTimeout(() => {
			this.notifyTimer = undefined
			this.onDidChangeEmitter.fire()
		}, WATCHER_DEBOUNCE_MS)
	}

	/**
	 * Announces a change this service made itself, at once.
	 *
	 * A writer who renames a piece must see the list update immediately, so this
	 * does not wait for the watcher's debounce window. Any announcement already
	 * queued by the watcher is dropped first, because it would only redraw the
	 * list a second time for the change being announced now. A watcher event that
	 * arrives afterwards is still honoured, so a change made outside the app is
	 * never swallowed.
	 */
	private announceChange(): void {
		if (this.notifyTimer) {
			clearTimeout(this.notifyTimer)
			this.notifyTimer = undefined
		}
		this.onDidChangeEmitter.fire()
	}

	// ---- Helpers -----------------------------------------------------------

	private async existingFileNames(directory: vscode.Uri): Promise<string[]> {
		try {
			return (await vscode.workspace.fs.readDirectory(directory)).map(([name]) => name)
		} catch {
			return []
		}
	}

	private isDocument(name: string): boolean {
		if (name.startsWith(".")) {
			return false
		}
		const extension = path.extname(name).toLowerCase()
		return DOCUMENT_EXTENSIONS.includes(extension)
	}

	private async exists(uri: vscode.Uri): Promise<boolean> {
		try {
			await vscode.workspace.fs.stat(uri)
			return true
		} catch {
			return false
		}
	}

	private isSamePath(a: string, b: string): boolean {
		const left = normalisePath(a)
		const right = normalisePath(b)
		return process.platform === "linux" ? left === right : left.toLowerCase() === right.toLowerCase()
	}
}

function normalisePath(value: string): string {
	return path.resolve(value).replace(/[\\/]+$/, "")
}

/** True when `target` is somewhere beneath `parent`, and is not `parent` itself. */
function isContained(parent: string, target: string): boolean {
	const relative = path.relative(normalisePath(parent), normalisePath(target))
	return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative)
}


