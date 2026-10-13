# Writer's Studio

**A calm place to write. You do not need to know how to code.**

Writer's Studio turns VS Code into a writing app: one list of everything you have
written, a page instead of a control panel, and a single button that turns your
finished piece into something you can paste into your blog.

It is for bloggers, essayists, and newsletter writers. There is nothing to
configure and nothing to learn beyond three keyboard shortcuts.

---

## Getting started, if you have never used this before

1. **Install VS Code.** It is a free app from Microsoft. Download it from
   [code.visualstudio.com](https://code.visualstudio.com) and open it once.
2. **Install Writer's Studio.** In VS Code, click the Extensions button in the
   left-hand bar, search for *Writer's Studio*, and click **Install**.
3. **Answer one question.** Writer's Studio asks where your writing should live
   and suggests a **Writing** folder inside your **Documents**. Accept it, or
   pick somewhere in iCloud or Dropbox if you want your writing on more than one
   computer.
4. **Say yes to the writing look.** This hides everything in the window that was
   built for programmers.
5. **Start writing.** A welcome piece opens and explains the rest. When you are
   done reading, delete it.

That is the whole setup. Your work saves itself a second after you stop typing;
there is no save button and you cannot lose a draft by closing the window.

## Three shortcuts

| What you want | Press |
| --- | --- |
| **Bold** | Cmd+B / Ctrl+B |
| *Italic* | Cmd+I / Ctrl+I |
| Focus mode on or off | Cmd+Alt+Z / Ctrl+Alt+Z |

Three more, when you want them: **Cmd+Alt+N** starts a new piece, **Cmd+Alt+M**
opens every formatting option in one menu, and **Cmd+Alt+B** shows or hides the
list of your writing. Everything is also on the **Formatting** button at the top
of the window, so there is nothing to memorise.

## What it does

**One list of your writing.** The sidebar shows everything you have written,
newest first, titled by its own heading rather than by a file name. Right-click
any piece to rename it, copy it, or move it to the trash. Renaming a piece that
has a heading changes that heading too, so the new name is what you see in the
list and at the top of the page; a piece with no heading keeps its opening
sentence as its label, because rewriting your first sentence would be worse than
leaving it. Nothing is ever deleted outright: the trash is a folder inside your
writing, listed at the bottom of the sidebar, and right-clicking a piece there
puts it back.

**Focus mode.** The page moves to the middle of the window, every paragraph
except the one you are writing fades, and the line you are typing on stays in a
comfortable place on screen instead of sliding to the bottom.

**A word count that counts the way an editor does.** Words, characters, and
reading time, at the bottom of the window. The block of settings at the top of a
file, code samples, and the addresses inside links are all left out of the count.
Select a passage to count just that passage.

**Spelling.** Misspelled words get an underline. Right-click for suggestions, or
choose **Add this word to my dictionary** for names and words you use often.

**Getting your work out.** Right-click and choose **Copy for pasting into a
website**, then paste into WordPress, Ghost, Substack, Medium, or a word
processor. **Save as a web page** writes a single, self-contained file you can
send to anyone; it prints properly too.

**Templates.** A blog post, an essay, and a newsletter to start from, in a
Templates folder you can add your own to.

**Two themes.** Paper for daylight, Night for late sessions. Both use a serif
typeface at a size meant for reading.

## Everything stays on your computer

Writer's Studio has no account to sign into, collects nothing, and makes no
network requests of its own. Your unpublished writing never leaves your machine.

It does not change your VS Code telemetry setting either way — that choice is
yours to make, in VS Code's own settings.

## If you want the ordinary view back

Run **Writing: Restore the normal VS Code look**. Every setting Writer's Studio
changed is recorded *before* it is applied and put back exactly as it was,
including settings you had customised yourself. If any of them cannot be changed
back, the record is kept so you can safely try again.

Settings that would get in the way of other work — Git, the problem markers, the
window title, line numbers — are only ever changed inside your writing folder, so
if you also use VS Code for code, your other projects are untouched.

## Honest limitations

- **Some buttons cannot be removed.** VS Code does not let an extension hide the
  Command Palette, the menu bar, or the Source Control and Run icons in the
  left-hand bar. Writer's Studio quiets them as far as the settings allow and
  leaves the rest as harmless doors you never have to open. The reasoning is
  written up in `docs/spike-profile-application.md`.
- **VS Code will ask once whether you trust your writing folder.** Say yes — you
  made it. Writer's Studio deliberately does not switch that question off, because
  it is the protection that stops a folder downloaded from the internet running
  code on your computer. If you say no, your writing still opens and still works,
  but settings cannot be changed.
- **Cmd+B is Bold here, not the sidebar.** VS Code normally uses it to show and
  hide the sidebar; that moved to **Cmd+Alt+B**. Markdown All in One also binds
  Cmd+B to its own bold command, so whichever of the two answers, you get bold.
- **Rich pasting depends on your system.** *Copy for pasting into a website*
  tries to place formatted text on the clipboard. Where the system refuses, it
  falls back to the HTML itself, which still pastes correctly into the HTML view
  every blogging tool provides. The message tells you which one happened.
- **Raw HTML in a piece is shown, not obeyed.** If you paste `<script>` or other
  HTML into a document it appears as text. That is deliberate: it keeps anything
  you copied from the web from running when you preview, copy, or publish.
- **Selections with two separate italic phrases.** Pressing Cmd+I on a passage
  like `*one* and *two*` adds emphasis rather than removing it, because there is
  no safe way to tell which markers to strip. Press it on one phrase at a time.
- **One piece at a time.** Multi-chapter projects, a table of contents across
  files, and export to Word or PDF are planned, not present.

## Companion extensions

Two well-established extensions are installed alongside this one and do the work
they are best at. You will not see their names while writing.

- [Code Spell Checker](https://marketplace.visualstudio.com/items?itemName=streetsidesoftware.code-spell-checker)
  for spelling.
- [Markdown All in One](https://marketplace.visualstudio.com/items?itemName=yzhang.markdown-all-in-one)
  for lists that continue themselves, tidy tables, and the list of contents.

---

## For developers

```bash
npm install
npm run check   # typecheck + lint
npm test        # unit tests and integration tests in a real VS Code instance
npm run bundle  # build dist/extension.js
npm run package # build a .vsix
```

Press <kbd>F5</kbd> to launch a development instance. The two companion
extensions are declared in `extensionDependencies`, so install them in your own
VS Code first or activation will fail.

**Where things live.** `src/library` owns where writing is kept and the sidebar;
`src/profile` owns the writing look and is the only place allowed to write a
global setting; `src/focus` owns focus mode; `src/stats` counts words;
`src/markdown` renders and exports; `src/ui/strings.ts` holds every user-facing
sentence the code produces.

**Four rules worth keeping.**

1. Every setting the writing look touches is declared in
   `src/profile/settingsCatalog.ts` and nowhere else, with an explicit scope, so it
   stays reversible and cannot leak into a writer's other projects. Nothing in that
   catalog may disable a security feature.
2. The snapshot of previous values is written before the first change, never
   after, and a value that already matches ours is never recorded as the writer's.
3. All user-facing prose lives in `src/ui/strings.ts`, the `package.json`
   contributions, `media/walkthrough/`, and `media/seed/` — reviewing those four
   places should be enough to prove the product contains no developer jargon.
4. Anything on the typing path is memoised or debounced. `src/stats/wordCount.ts`
   makes one pass over the lines, the status bar caches per document version, and
   the library caches per modification time.

Before release, run the cold-start script in `docs/cold-start-checklist.md` on a
brand-new VS Code profile. Any step that needs developer knowledge is a release
blocker.

## Licence

MIT.
