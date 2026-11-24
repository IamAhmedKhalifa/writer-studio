# Cold-start checklist

Run this on a **brand-new VS Code profile** before every release, from the
Marketplace page only — no repo, no terminal, no prior knowledge.

**The rule:** any step that requires developer knowledge is a release blocker, not
a documentation problem. Confusion is a bug.

## Setup

- [ ] Create a fresh VS Code profile, or use a machine that has never run this.
- [ ] Reach the extension from the Marketplace listing alone. The listing must
      start at "download VS Code", not at "clone the repo".
- [ ] Install. Both companion extensions install alongside without a prompt that
      needs a decision.

## First run

- [ ] The welcome question appears once, unprompted, and names a real place.
- [ ] Accepting the suggestion creates the folder and does not fail on a machine
      with no `Documents` folder.
- [ ] Declining does not ask again on the next launch, and the sidebar still
      offers to set things up.
- [ ] On a machine with no `Documents` folder, the offered button says "Use my
      home folder" and the place it names is the place it creates.
- [ ] VS Code's trust question appears at most once, and the walkthrough explains
      it before the writer meets it.
- [ ] Saying yes to the writing look hides line numbers, the minimap, the tab
      bar, and breadcrumbs, and switches to a serif face.
- [ ] Saying *no* to the trust question still opens the writing; the app explains
      why settings cannot change instead of failing silently.
- [ ] The welcome piece opens and reads as a document, not as documentation.
- [ ] Installing with another project already open offers a new window rather
      than replacing it without asking.
- [ ] The word "workspace" appears nowhere on screen at any point.

## Writing 300 words

- [ ] **New draft** produces an empty page with the cursor ready, named after
      today.
- [ ] Type 300 words. Typing never stutters and nothing pops up uninvited.
- [ ] No suggestion widget, no bracket auto-closing, no squiggles other than
      spelling.
- [ ] Curly quotes, em dashes, and accented characters are never highlighted as
      suspicious.
- [ ] Close the window without saving, reopen, and the 300 words are there.

## Formatting

- [ ] Select a phrase, press Cmd+B. It becomes bold. Press again. It reverts.
- [ ] With the cursor inside a word and nothing selected, Cmd+I italicises that
      word.
- [ ] Cmd+B on already-bold text with italic applied nests rather than corrupting.
- [ ] The **Formatting** button lists every option in plain English.
- [ ] Make a heading, a quotation, a bulleted list, and a link without typing a
      single `#`, `>`, `-`, or bracket.
- [ ] Paste a web address over selected words and get a working link.

## Spelling

- [ ] Type a misspelling. It gets an underline within a second.
- [ ] Right-click offers suggestions.
- [ ] **Add this word to my dictionary** removes the underline and the word is
      still accepted after a restart.
- [ ] The words "cSpell", "dictionary file", and "settings" never appear.

## Focus mode

- [ ] Cmd+Alt+Z centres the page, fades other paragraphs, and holds the typing
      line in place.
- [ ] Typing across a paragraph boundary updates the sharp paragraph correctly.
- [ ] Cmd+Alt+Z again restores the previous layout exactly, including the
      scrollbars.
- [ ] Toggle it ten times. Nothing accumulates and no setting is left changed.
- [ ] Open a 50,000-word piece. Fading switches itself off and typing stays fast.

## The word count

- [ ] The count at the bottom matches a hand count on a short piece.
- [ ] Selecting a passage counts only that passage.
- [ ] A piece with a settings block at the top, a code sample, and links counts
      only the prose.
- [ ] Clicking the count shows words, characters, paragraphs, and reading time.

## Handing the work over

- [ ] **Copy for pasting into a website**, then paste into each of: WordPress,
      Ghost, Substack, Medium, Google Docs. Headings, bold, italic, lists,
      blockquotes, and links all survive.
- [ ] Note which of the two messages appeared (formatted text, or the HTML
      fallback) and confirm the message told the truth.
- [ ] **Copy as plain text** pastes with no stray `*` or `#`.
- [ ] **Save as a web page** produces one file that opens in a browser with
      styling intact, with no internet connection, and prints on one sensible
      page.
- [ ] **Show what this will look like** opens a readable preview in the same
      typeface as the editor.

## Managing pieces

- [ ] The sidebar titles each piece by its first heading, not its file name.
- [ ] Rename from the sidebar keeps the date and leaves the piece open.
- [ ] Duplicate leaves the original untouched.
- [ ] Move to trash asks first, then the piece is recoverable from the Trash
      folder.
- [ ] Creating two pieces with the same name produces two files, never an
      overwrite.

## Undoing everything

- [ ] **Restore the normal VS Code look** returns the window to standard
      VS Code.
- [ ] A setting the tester had customised before installing is back at their own
      value, not at the VS Code default.
- [ ] A custom `files.exclude` entry the tester had before installing is still
      there afterwards.
- [ ] Open an unrelated code project: Git, the problem markers, and the window
      title all behave normally there, both before and after restoring.
- [ ] Quit VS Code with focus mode still on, reopen: the scrollbars are back.
- [ ] Running it twice is harmless and says so plainly.

## Performance, on a real library

- [ ] With 200+ pieces in the library, type continuously for a minute. The
      sidebar does not flicker and typing does not stutter.
- [ ] Open a 50,000-word piece and hold down an arrow key. The word count does
      not lag the cursor.

## Final pass

- [ ] No notification, dialog, hover, or status bar item contains a stack trace,
      a file path presented as an instruction, or the words: workspace,
      repository, commit, lint, diagnostic, extension host, JSON, config, plugin.
- [ ] Two non-programmer writers complete this list unaided while observed.
      Record every hesitation.
