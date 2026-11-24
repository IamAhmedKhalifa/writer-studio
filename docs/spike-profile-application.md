# Spike: how to apply the writing look

**Status:** resolved. **Decision:** user settings, captured for exact reversal.
**Task:** plan §6 task 3. Run before anything depending on it (tasks 5, 6, 10).

## Question

The distribution strategy depends on a one-click setup that makes VS Code stop
looking like a developer tool. Can an extension create and apply a VS Code
*Profile* programmatically?

## Findings

1. **No public API.** The `vscode` extension API exposes no namespace for
   reading, creating, switching, or applying profiles. There is no
   `vscode.workspace.profiles`, and `ExtensionContext` gives no profile handle.
2. **Profile commands are internal.** The commands that back the Profiles UI
   (import/export/create/switch) are not contributed API. They are not listed in
   the documented command set, their identifiers have changed across releases,
   and they open interactive UI rather than accepting a settings payload. Calling
   them would be an undocumented dependency that can silently break on any
   VS Code update — unacceptable for the one feature the whole onboarding rests
   on.
3. **Profile import is a user gesture.** Sharing a profile works by publishing a
   profile template and having the user run *Import Profile* and confirm. That is
   several steps of developer-flavoured UI, which is precisely the audience
   problem this product exists to solve.
4. **UI state is not settings.** The parts of the window most worth hiding —
   which view containers appear in the activity bar, which views are visible —
   are stored as workbench UI state, not as configuration. No extension API
   writes them. Profiles can carry them; settings cannot.

## Decision

Apply the look as **settings**, captured before modification so it can be
reversed exactly. See `src/profile/settingsCatalog.ts` and
`src/profile/writerProfile.ts`.

- **Two scopes, declared per setting.** `everywhere` (global) is reserved for
  what must follow the writer between windows: the theme, the typography,
  autosave. `library` (the writing folder) is the default and covers everything
  that would be hostile in another project — Git, problem markers, the window
  title, line numbers, the preview stylesheet. A writer who also uses VS Code for
  code keeps their normal setup outside the library.
- **The snapshot is written before the first change.** A crash halfway through
  must never leave changed settings with no record of the originals.
- **The resolved target is stored in the snapshot**, not recomputed on restore. A
  library-scoped setting falls back to global when no folder is open, so
  recomputing could read one target and write another, blanking a global value.
- **A value already equal to ours is never recorded as the writer's.** Otherwise
  uninstalling (which deletes the snapshot but not the settings) and re-applying
  would capture the writing look as the baseline and make it permanent.
- **Object-valued settings are merged, not replaced**, so the writer's own
  entries in `files.exclude` survive.
- **A failed restore keeps what it could not put back**, rather than discarding
  the record and reporting success.
- **Applying requires a trusted folder.** A folder the writer has not vouched for
  must not be able to provoke changes to editor-wide settings.
- Updates for settings owned by an uninstalled companion extension throw; these
  are caught per key and reported as `skipped`, and the caller says so.

### Workspace Trust is deliberately left alone

An earlier version set `security.workspace.trust.enabled: false` globally to
avoid the trust dialog on first open. That is not an acceptable trade: it removes
the protection that stops a downloaded folder from running code, for every folder
the writer ever opens, in exchange for hiding one dialog. The dialog is explained
in plain English in `media/walkthrough/look.md` instead, and the settings writes,
the dictionary, and the rich clipboard all check `workspace.isTrusted` first.

## Accepted limitations

These cannot be solved from an extension and are **not** bugs:

| Cannot hide | Mitigation |
| --- | --- |
| Command Palette | Left as a harmless escape hatch; our own commands are gated by `when` clauses so it is not polluted |
| Menu bar (macOS) | `window.menuBarVisibility: compact` helps on Windows/Linux only |
| Activity bar items for Source Control / Run / Extensions / Testing | `git.enabled: false`, `scm.diffDecorations: none`, `debug.showInStatusBar: never` remove the badges and prompts; the icons remain |
| Problems panel existence | `problems.decorations.enabled: false` plus `markdown.validate.enabled: false` remove the squiggles and counts that would appear |
| The Workspace Trust dialog on first open | Explained in plain words in the walkthrough. Switching it off was rejected: see above |

## If this needs revisiting

A profile-based approach becomes viable only if VS Code ships a stable public
API for profile creation. Until then the escalation path is a forked
distribution (rejected in the plan, §2), not undocumented commands.
