import * as path from "path"
import * as vscode from "vscode"
import { appliesOn, SettingScope, SettingSpec, WRITER_SETTINGS, WriterChoice } from "./settingsCatalog"

/**
 * The catalog, less anything VS Code does not have on this platform or in this
 * version, and anything owned by an optional companion that is not installed.
 * Worked out on each use, because a companion can be added or removed while VS
 * Code is running.
 */
function settingsHere(answerTo: (choice: WriterChoice) => unknown): SettingSpec[] {
	const isInstalled = (extensionId: string) => vscode.extensions.getExtension(extensionId) !== undefined
	// A setting VS Code knows has a default; an unknown one comes back bare.
	const isKnown = (key: string) => vscode.workspace.getConfiguration().inspect(key)?.defaultValue !== undefined
	const here: SettingSpec[] = []
	for (const setting of WRITER_SETTINGS) {
		if (!appliesOn(setting, process.platform, isInstalled, isKnown)) {
			continue
		}
		if (setting.fromChoice === undefined) {
			here.push(setting)
			continue
		}
		// No answer, or one that says to leave the setting alone.
		const value = answerTo(setting.fromChoice)
		if (value !== undefined) {
			here.push({ ...setting, value })
		}
	}
	return here
}

const SNAPSHOT_KEY = "writersStudio.lookSnapshot"
const SNAPSHOT_VERSION = 2

interface SnapshotEntry {
	key: string
	/**
	 * The configuration target the value was read from and must go back to, as the
	 * numeric `vscode.ConfigurationTarget`.
	 *
	 * Resolved once at capture time and stored, rather than recomputed on restore.
	 * A library-scoped setting falls back to global when no folder is open, so
	 * recomputing could read one target and write another — which would blank a
	 * value the writer had set globally.
	 */
	target: number
	/**
	 * For a setting stored in a folder, which folder, as a URI string.
	 *
	 * A folder-level write goes to whatever folder the current window has open,
	 * so a target alone does not say where a value lives. Restoring from a window
	 * showing a code project used to "put back" the writing folder's settings
	 * into that project instead, record them as done, and leave the writing
	 * folder changed for good.
	 *
	 * Absent on global entries, and on entries recorded before this was tracked;
	 * those belong to the library, the only folder the look is ever applied in.
	 */
	place?: string
	/** Whether the writer had their own value before we touched it. */
	hadValue: boolean
	value: unknown
}

interface Snapshot {
	version: number
	appliedAt: string
	entries: SnapshotEntry[]
	/**
	 * Folders that had no settings file of their own until the look was applied
	 * there. Once everything in one has been put back, the empty file is removed
	 * too, so the folder ends up exactly as it was found.
	 */
	createdSettingsFiles?: string[]
}

export interface ApplyResult {
	applied: number
	/**
	 * Keys VS Code refused. Expected when a companion extension is disabled, since
	 * nothing declares those settings; also covers a read-only settings file.
	 */
	skipped: string[]
}

export interface RestoreResult {
	restored: number
	/** Keys that could not be put back. The snapshot is kept for these. */
	failed: string[]
	/**
	 * Settings that belong to a folder this window does not have open, usually
	 * the writing folder seen from a code project. Kept on record, untouched, until
	 * restore runs with that folder open.
	 */
	waiting: number
	/** False when there was nothing to undo in the first place. */
	hadSnapshot: boolean
}

/**
 * Applies and reverses the writing look.
 *
 * Strategy note (see docs/spike-profile-application.md): VS Code has no stable
 * public API for creating or applying an editor profile, so the look is applied
 * as settings, captured beforehand so it can be reversed exactly.
 *
 * Four properties matter more than anything else here, because a writer's whole
 * editor depends on them:
 *
 *   1. The snapshot is written *before* the first change. A crash halfway through
 *      must never leave changed settings with no record of the originals.
 *   2. A value that already equals what this extension would write is never
 *      recorded as the writer's own. Otherwise reinstalling and re-applying would
 *      capture the writing look as the baseline and make it permanent.
 *   3. A failed restore keeps the entries it could not put back, so the record
 *      survives for a second attempt instead of being thrown away.
 *   4. A folder's settings are only ever put back in that folder. An entry for a
 *      folder that is not open stays on record rather than being written into
 *      whichever folder happens to be.
 */
export class WriterProfile {
	/** Guards against two overlapping applies both capturing a baseline. */
	private inFlight: Promise<ApplyResult> | undefined

	/** Runs applies and restores one after another, so no two use the record at once. */
	private queue: Promise<unknown> = Promise.resolve()
	/** How many are queued or running. */
	private queued = 0

	/** Set by the test suite to stand in for "a different folder is open". */
	private pretendPlace: { value: string | undefined } | undefined

	/**
	 * @param libraryUri Where the writing lives, used to place entries recorded
	 *   before entries carried their own folder.
	 * @param answerTo The value a setting set by one of the writer's answers
	 *   should take, or undefined to leave it alone.
	 */
	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly libraryUri: () => vscode.Uri | undefined = () => undefined,
		private readonly answerTo: (choice: WriterChoice) => unknown = () => undefined,
	) {}

	isApplied(): boolean {
		return this.context.globalState.get<Snapshot>(SNAPSHOT_KEY)?.version === SNAPSHOT_VERSION
	}

	/**
	 * Applies the writing look, or with `only`, just those of its settings: used
	 * when one answer changes, so nothing the writer has adjusted since is reset.
	 */
	async apply(options: { only?: readonly string[] } = {}): Promise<ApplyResult> {
		if (options.only !== undefined) {
			return this.serially(() => this.applyOnce(options.only))
		}
		// Re-entrancy guard: a second caller joins the first rather than starting
		// its own capture.
		this.inFlight ??= this.serially(() => this.applyOnce()).finally(() => {
			this.inFlight = undefined
		})
		return this.inFlight
	}

	/**
	 * Starts `work` straight away when nothing else is queued, so the record is
	 * written before the caller's next line runs; otherwise after the rest.
	 */
	private serially<T>(work: () => Promise<T>): Promise<T> {
		const run = this.queued === 0 ? work() : this.queue.then(work, work)
		this.queued++
		this.queue = run
			.catch(() => undefined)
			.then(() => {
				this.queued--
			})
		return run
	}

	private async applyOnce(only?: readonly string[]): Promise<ApplyResult> {
		const settings = settingsHere(this.answerTo).filter((setting) => only === undefined || only.includes(setting.key))

		// A folder the writer has not vouched for must not be able to provoke
		// changes to their editor-wide settings.
		if (!vscode.workspace.isTrusted) {
			return { applied: 0, skipped: settings.map((setting) => setting.key) }
		}

		const existing = this.context.globalState.get<Snapshot>(SNAPSHOT_KEY)
		// Adjusting part of the look only makes sense while the look is on.
		// Otherwise it would leave a one-setting record that reads as "applied".
		if (only !== undefined && existing === undefined) {
			return { applied: 0, skipped: [] }
		}
		const place = this.currentPlace()
		const entries = [...(existing?.entries ?? [])]

		// Every write below needs a record of what it replaces, at the same target
		// and in the same folder. An existing record is reused where it already
		// covers a write, so our own earlier values are never captured as the
		// writer's; anything it does not cover is captured now. Reusing a partial
		// record wholesale, as this once did, re-applied settings that nothing
		// would ever undo.
		const planned = settings.map((setting) => {
			const target = this.targetFor(setting.scope)
			let entry = entries.find((candidate) => this.covers(candidate, setting.key, target, place))
			if (!entry) {
				entry = this.capture(setting.key, setting.value, target, place)
				entries.push(entry)
			}
			return { setting, target, entry }
		})

		const createdSettingsFiles = [...(existing?.createdSettingsFiles ?? [])]
		const snapshot: Snapshot = {
			version: SNAPSHOT_VERSION,
			appliedAt: existing?.appliedAt ?? new Date().toISOString(),
			entries,
			createdSettingsFiles,
		}

		// Persisted first. Everything below can fail; the record must not.
		await this.context.globalState.update(SNAPSHOT_KEY, snapshot)

		// Noted before the first write creates it, so restore can remove the file
		// again rather than leave an empty one behind in the writer's folder.
		const writesToFolder = planned.some(({ target }) => isFolderTarget(target))
		if (writesToFolder && place && !vscode.workspace.workspaceFile) {
			const alreadyNoted = createdSettingsFiles.some((noted) => this.samePlace(noted, place))
			if (!alreadyNoted && !(await exists(settingsFileIn(place)))) {
				createdSettingsFiles.push(place)
				await this.context.globalState.update(SNAPSHOT_KEY, snapshot)
			}
		}

		const skipped: string[] = []
		let applied = 0

		for (const { setting, target, entry } of planned) {
			const next = setting.merge
				? mergeObjects(entry.hadValue ? entry.value : undefined, setting.value)
				: setting.value
			try {
				await vscode.workspace.getConfiguration().update(setting.key, next, target)
				applied++
			} catch {
				skipped.push(setting.key)
			}
		}

		return { applied, skipped }
	}

	/** Undoes the writing look, after any apply still under way. */
	async restore(): Promise<RestoreResult> {
		return this.serially(() => this.restoreOnce())
	}

	private async restoreOnce(): Promise<RestoreResult> {
		const snapshot = this.context.globalState.get<Snapshot>(SNAPSHOT_KEY)
		if (!snapshot) {
			return { restored: 0, failed: [], waiting: 0, hadSnapshot: false }
		}

		const place = this.currentPlace()
		const config = vscode.workspace.getConfiguration()
		const failed: SnapshotEntry[] = []
		const waiting: SnapshotEntry[] = []
		let restored = 0

		for (const entry of snapshot.entries) {
			// Writing this here would put the value into the wrong folder and lose
			// the record of the right one.
			if (isFolderTarget(entry.target) && !this.samePlace(this.placeOf(entry), place)) {
				waiting.push(entry)
				continue
			}
			try {
				await config.update(entry.key, entry.hadValue ? entry.value : undefined, entry.target)
				restored++
			} catch {
				failed.push(entry)
			}
		}

		const outstanding = [...failed, ...waiting]
		let createdSettingsFiles = snapshot.createdSettingsFiles ?? []
		const finishedHere =
			place !== undefined &&
			!outstanding.some((entry) => isFolderTarget(entry.target) && this.samePlace(this.placeOf(entry), place))
		if (finishedHere && createdSettingsFiles.some((noted) => this.samePlace(noted, place))) {
			await removeSettingsFileIfEmpty(place)
			createdSettingsFiles = createdSettingsFiles.filter((noted) => !this.samePlace(noted, place))
		}

		if (outstanding.length > 0) {
			// Keep exactly what is still outstanding, so a second attempt (or a
			// later VS Code version that registers the setting, or the right folder
			// being opened) can finish the job.
			await this.context.globalState.update(SNAPSHOT_KEY, {
				...snapshot,
				entries: outstanding,
				createdSettingsFiles,
			} satisfies Snapshot)
		} else {
			await this.context.globalState.update(SNAPSHOT_KEY, undefined)
		}

		return {
			restored,
			failed: failed.map((entry) => entry.key),
			waiting: waiting.length,
			hadSnapshot: true,
		}
	}

	/**
	 * Throws the record away while leaving the settings applied, which is what
	 * uninstalling and reinstalling does. Exists so the test suite can prove that
	 * re-applying afterwards does not capture the writing look as the baseline.
	 */
	async forgetSnapshotForTests(): Promise<void> {
		await this.context.globalState.update(SNAPSHOT_KEY, undefined)
	}

	/**
	 * Behaves as if `folder` were the open folder (or none, for `undefined`).
	 * Exists so the test suite can restore "from another window" without a
	 * second window.
	 */
	pretendFolderIsOpenForTests(folder: vscode.Uri | undefined): void {
		this.pretendPlace = { value: folder?.toString() }
	}

	stopPretendingForTests(): void {
		this.pretendPlace = undefined
	}

	// ---- Internals ---------------------------------------------------------

	private capture(key: string, ours: unknown, target: vscode.ConfigurationTarget, place: string | undefined): SnapshotEntry {
		const current = this.readAt(key, target)
		// A value identical to ours is not a baseline worth keeping: it is
		// almost certainly a leftover from an earlier install whose record was
		// lost. Recording it would make the writing look permanent.
		const isOurs = current !== undefined && JSON.stringify(current) === JSON.stringify(ours)
		return {
			key,
			target,
			place: isFolderTarget(target) ? place : undefined,
			hadValue: current !== undefined && !isOurs,
			value: isOurs ? undefined : current,
		}
	}

	/** Whether `entry` already records the value a write of `key` would replace. */
	private covers(entry: SnapshotEntry, key: string, target: number, place: string | undefined): boolean {
		if (entry.key !== key || entry.target !== target) {
			return false
		}
		return !isFolderTarget(target) || this.samePlace(this.placeOf(entry), place)
	}

	private placeOf(entry: SnapshotEntry): string | undefined {
		return entry.place ?? this.libraryUri()?.toString()
	}

	/**
	 * The folder a folder-level write lands in from this window: the workspace
	 * file when there is one, otherwise the first folder.
	 */
	private currentPlace(): string | undefined {
		if (this.pretendPlace) {
			return this.pretendPlace.value
		}
		return vscode.workspace.workspaceFile?.toString() ?? vscode.workspace.workspaceFolders?.[0]?.uri.toString()
	}

	private samePlace(a: string | undefined, b: string | undefined): boolean {
		if (a === undefined || b === undefined) {
			return false
		}
		const left = vscode.Uri.parse(a)
		const right = vscode.Uri.parse(b)
		if (left.scheme !== "file" || right.scheme !== "file") {
			return left.toString() === right.toString()
		}
		const normalise = (value: string) => path.resolve(value).replace(/[\\/]+$/, "")
		const leftPath = normalise(left.fsPath)
		const rightPath = normalise(right.fsPath)
		return process.platform === "linux" ? leftPath === rightPath : leftPath.toLowerCase() === rightPath.toLowerCase()
	}

	private readAt(key: string, target: vscode.ConfigurationTarget): unknown {
		const inspected = vscode.workspace.getConfiguration().inspect(key)
		return target === vscode.ConfigurationTarget.Global ? inspected?.globalValue : inspected?.workspaceValue
	}

	/**
	 * Library-scoped settings go to the folder the writing lives in, so a writer
	 * who also uses VS Code for code keeps their normal setup everywhere else.
	 * Without a folder open there is nowhere to put them, so they fall back to
	 * global rather than being silently dropped.
	 */
	private targetFor(scope: SettingScope): vscode.ConfigurationTarget {
		if (scope === "everywhere") {
			return vscode.ConfigurationTarget.Global
		}
		return (vscode.workspace.workspaceFolders?.length ?? 0) > 0
			? vscode.ConfigurationTarget.Workspace
			: vscode.ConfigurationTarget.Global
	}
}

function isFolderTarget(target: number): boolean {
	return target === vscode.ConfigurationTarget.Workspace || target === vscode.ConfigurationTarget.WorkspaceFolder
}

function settingsFileIn(place: string): vscode.Uri {
	return vscode.Uri.joinPath(vscode.Uri.parse(place), ".vscode", "settings.json")
}

async function exists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri)
		return true
	} catch {
		return false
	}
}

/**
 * Deletes a settings file this extension created, once nothing is left in it,
 * and its folder if that is empty too. Anything the writer has put there since,
 * including a comment, keeps both.
 */
async function removeSettingsFileIfEmpty(place: string): Promise<void> {
	const file = settingsFileIn(place)
	try {
		const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(file)).trim()
		const parsed: unknown = text.length === 0 ? {} : JSON.parse(text)
		if (!isPlainObject(parsed) || Object.keys(parsed).length > 0) {
			return
		}
		await vscode.workspace.fs.delete(file)
		const folder = vscode.Uri.joinPath(file, "..")
		if ((await vscode.workspace.fs.readDirectory(folder)).length === 0) {
			await vscode.workspace.fs.delete(folder)
		}
	} catch {
		// Unreadable, not plain JSON, or already gone: leaving the file is safe.
	}
}

/**
 * Shallow-merges our keys into whatever the writer already had, so applying the
 * look adds to an object setting instead of replacing it. Their own entries in
 * `files.exclude` survive, and restore puts the original object back whole.
 */
function mergeObjects(existing: unknown, ours: unknown): unknown {
	if (!isPlainObject(ours)) {
		return ours
	}
	if (!isPlainObject(existing)) {
		return ours
	}
	return { ...existing, ...ours }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}
