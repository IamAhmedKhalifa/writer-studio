import * as vscode from "vscode"
import { SettingScope, WRITER_SETTINGS } from "./settingsCatalog"

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
	/** Whether the writer had their own value before we touched it. */
	hadValue: boolean
	value: unknown
}

interface Snapshot {
	version: number
	appliedAt: string
	entries: SnapshotEntry[]
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
 * Three properties matter more than anything else here, because a writer's whole
 * editor depends on them:
 *
 *   1. The snapshot is written *before* the first change. A crash halfway through
 *      must never leave changed settings with no record of the originals.
 *   2. A value that already equals what this extension would write is never
 *      recorded as the writer's own. Otherwise reinstalling and re-applying would
 *      capture the writing look as the baseline and make it permanent.
 *   3. A failed restore keeps the entries it could not put back, so the record
 *      survives for a second attempt instead of being thrown away.
 */
export class WriterProfile {
	/** Guards against two overlapping applies both capturing a baseline. */
	private inFlight: Promise<ApplyResult> | undefined

	constructor(private readonly context: vscode.ExtensionContext) {}

	isApplied(): boolean {
		return this.context.globalState.get<Snapshot>(SNAPSHOT_KEY)?.version === SNAPSHOT_VERSION
	}

	async apply(): Promise<ApplyResult> {
		// Re-entrancy guard: a second caller joins the first rather than starting
		// its own capture.
		this.inFlight ??= this.applyOnce().finally(() => {
			this.inFlight = undefined
		})
		return this.inFlight
	}

	private async applyOnce(): Promise<ApplyResult> {
		// A folder the writer has not vouched for must not be able to provoke
		// changes to their editor-wide settings.
		if (!vscode.workspace.isTrusted) {
			return { applied: 0, skipped: WRITER_SETTINGS.map((setting) => setting.key) }
		}

		const existing = this.context.globalState.get<Snapshot>(SNAPSHOT_KEY)
		const entries = existing?.entries ?? this.capture()

		// Persisted first. Everything below can fail; the record must not.
		await this.context.globalState.update(SNAPSHOT_KEY, {
			version: SNAPSHOT_VERSION,
			appliedAt: new Date().toISOString(),
			entries,
		} satisfies Snapshot)

		const skipped: string[] = []
		let applied = 0
		const byKey = new Map(entries.map((entry) => [entry.key, entry]))

		for (const setting of WRITER_SETTINGS) {
			// The captured target is authoritative, so the write goes exactly where
			// the previous value was read from.
			const target = byKey.get(setting.key)?.target ?? this.targetFor(setting.scope)
			const previous = byKey.get(setting.key)
			const next = setting.merge
				? mergeObjects(previous?.hadValue ? previous.value : undefined, setting.value)
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

	async restore(): Promise<RestoreResult> {
		const snapshot = this.context.globalState.get<Snapshot>(SNAPSHOT_KEY)
		if (!snapshot) {
			return { restored: 0, failed: [], hadSnapshot: false }
		}

		const config = vscode.workspace.getConfiguration()
		const failed: SnapshotEntry[] = []
		let restored = 0

		for (const entry of snapshot.entries) {
			try {
				await config.update(entry.key, entry.hadValue ? entry.value : undefined, entry.target)
				restored++
			} catch {
				failed.push(entry)
			}
		}

		if (failed.length > 0) {
			// Keep exactly what is still outstanding, so a second attempt (or a
			// later VS Code version that registers the setting) can finish the job.
			await this.context.globalState.update(SNAPSHOT_KEY, {
				...snapshot,
				entries: failed,
			} satisfies Snapshot)
		} else {
			await this.context.globalState.update(SNAPSHOT_KEY, undefined)
		}

		return { restored, failed: failed.map((entry) => entry.key), hadSnapshot: true }
	}

	/**
	 * Throws the record away while leaving the settings applied, which is what
	 * uninstalling and reinstalling does. Exists so the test suite can prove that
	 * re-applying afterwards does not capture the writing look as the baseline.
	 */
	async forgetSnapshotForTests(): Promise<void> {
		await this.context.globalState.update(SNAPSHOT_KEY, undefined)
	}

	// ---- Internals ---------------------------------------------------------

	private capture(): SnapshotEntry[] {
		return WRITER_SETTINGS.map((setting) => {
			const target = this.targetFor(setting.scope)
			const current = this.readAt(setting.key, target)
			// A value identical to ours is not a baseline worth keeping: it is
			// almost certainly a leftover from an earlier install whose record was
			// lost. Recording it would make the writing look permanent.
			const isOurs = current !== undefined && JSON.stringify(current) === JSON.stringify(setting.value)
			return {
				key: setting.key,
				target,
				hadValue: current !== undefined && !isOurs,
				value: isOurs ? undefined : current,
			}
		})
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
