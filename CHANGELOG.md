# Changelog

Everything that changes in Writer's Studio, written down so you know what to
expect after an update.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
version numbers follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0]

The first release. Writer's Studio turns VS Code into a quiet place to write,
with nothing to configure and nothing to learn beyond three keyboard shortcuts.

### Added

- **A home for your writing.** On first run Writer's Studio suggests a
  **Writing** folder inside your **Documents**, or lets you pick somewhere in
  iCloud or Dropbox. A welcome piece opens there and explains the rest.
- **One list of everything you have written.** The sidebar shows your pieces
  newest first, titled by their own heading rather than by a file name.
  Right-click any piece to rename it, duplicate it, or move it to the trash.
  The trash is a folder inside your writing, so nothing is ever deleted outright.
- **A writing look.** One click hides the parts of the window built for
  programmers and switches to a calm page in a serif typeface, in one of two
  themes: **Paper** for daylight and **Night** for late sessions.
- **Focus mode.** Press Cmd+Alt+Z (Ctrl+Alt+Z on Windows and Linux) to move the
  page to the middle of the window, fade every paragraph except the one you are
  writing, and keep the line you are typing on in a comfortable place on screen.
- **Formatting without symbols.** Bold, italic, links, headings, quotations,
  lists, and tables from the **Formatting** button at the top of the window, or
  from Cmd+B, Cmd+I, and Cmd+Alt+M.
- **A word count that counts the way an editor does.** Words, characters, and
  reading time at the bottom of the window. Settings at the top of a file, code
  samples, and the addresses inside links are left out. Select a passage to count
  just that passage.
- **Spelling.** Misspelled words are underlined. Right-click for suggestions, or
  add names and words you use often to your own dictionary.
- **Getting your work out.** **Copy for pasting into a website** for WordPress,
  Ghost, Substack, Medium, or a word processor; **Copy as plain text** with no
  stray symbols; and **Save as a web page**, which writes one self-contained file
  you can send to anyone or print.
- **Templates** for a blog post, an essay, and a newsletter, in a Templates
  folder you can add your own to.
- **Saving on its own.** Your work saves a second after you stop typing. There is
  no save button, and closing the window cannot lose a draft.
- **A way back.** **Writing: Restore the normal VS Code look** puts every
  setting Writer's Studio changed back exactly as it was, including any you had
  customised yourself.

### Security

- Writer's Studio has no account, collects nothing, and makes no network
  requests of its own. Your writing never leaves your computer.
- HTML pasted into a piece is shown as text rather than run, so nothing copied
  from the web can run when you preview, copy, or publish.
- VS Code's question about whether you trust your writing folder is left on.
  If you say no, your writing still opens and works, but anything that changes a
  setting waits until you say yes: the writing look, adding words to your
  dictionary, and keeping the typing line in place in focus mode. Copying for a
  website gives you the HTML rather than formatted text.

### Known limitations

- VS Code does not let an extension hide the Command Palette, the menu bar, or
  some icons in the left-hand bar. They stay, quietly, and you never need them.
- Cmd+B is Bold. Showing and hiding the sidebar moved to Cmd+Alt+B.
- Where your system will not accept formatted text on the clipboard, copying
  falls back to the HTML itself, and the message tells you which happened.
- Pressing Cmd+I on a passage containing two separate italic phrases adds
  emphasis rather than removing it. Press it on one phrase at a time.
- One piece at a time: multi-chapter projects and export to Word or PDF are
  planned for a later release.
