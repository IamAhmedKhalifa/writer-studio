import { execFile } from "child_process"
import { randomBytes } from "crypto"
import * as vscode from "vscode"

/** If the browser copy has not answered by now, fall back instead of hanging. */
const TIMEOUT_MS = 2000

/** Starting the system's script runner can be slow on a busy machine. */
const MAC_TIMEOUT_MS = 5000

/**
 * Puts formatted text on the clipboard, so that pasting into a blog editor, a
 * newsletter, or a word processor arrives with its headings, bold text, and
 * links intact. `plainText` goes alongside it for places that only take plain
 * text, such as a search box or a text message.
 *
 * Why this is roundabout: the VS Code API can only place plain text on the
 * clipboard. A rich paste needs an HTML flavour on the system clipboard as well.
 *
 * - On macOS the HTML is handed to the system clipboard directly, through the
 *   script runner (`osascript`) that comes with every Mac. A web view cannot do
 *   it there: its copy is refused, which is what finding F10 was.
 * - Elsewhere, and on a Mac if that fails, a web view selects the rendered
 *   content and copies it the way a browser would. Nothing platform-specific is
 *   shipped with the extension either way.
 *
 * Every failure path returns false so the caller can fall back to plain text; a
 * failed rich copy must never lose the writer's work or leave a stray panel
 * behind.
 */
export async function copyRichText(bodyHtml: string, plainText: string): Promise<boolean> {
	if (process.platform === "darwin" && (await copyRichTextOnMac(bodyHtml, plainText))) {
		return true
	}
	return copyRichTextThroughWebView(bodyHtml)
}

/**
 * Runs inside `osascript` as JavaScript for Automation. It reads one JSON
 * object from standard input, so the writer's text is never part of a command
 * line, and writes both flavours in one go. The type names are spelled out
 * because the AppKit constants do not arrive as strings in this bridge.
 */
const MAC_SCRIPT = `ObjC.import("AppKit");
function run() {
  const data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
  const input = JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding)));
  const board = $.NSPasteboard.generalPasteboard;
  board.clearContents;
  const html = board.setStringForType($(input.html), $("public.html"));
  const text = board.setStringForType($(input.text), $("public.utf8-plain-text"));
  return html && text ? "copied" : "refused";
}`

function copyRichTextOnMac(bodyHtml: string, plainText: string): Promise<boolean> {
	return new Promise((resolve) => {
		try {
			const child = execFile(
				"osascript",
				["-l", "JavaScript", "-e", MAC_SCRIPT],
				{ timeout: MAC_TIMEOUT_MS },
				(error, stdout) => resolve(!error && stdout.trim() === "copied"),
			)
			child.stdin?.on("error", () => resolve(false))
			// The meta tag is what a browser puts in front of copied HTML; some
			// word processors read the bytes rather than the text and need it to
			// get accented letters and curly quotes right.
			child.stdin?.end(JSON.stringify({ html: `<meta charset="utf-8">${bodyHtml}`, text: plainText }))
		} catch {
			resolve(false)
		}
	})
}

async function copyRichTextThroughWebView(bodyHtml: string): Promise<boolean> {
	let panel: vscode.WebviewPanel | undefined

	try {
		panel = vscode.window.createWebviewPanel(
			"writersStudio.copy",
			"Copying\u2026",
			{ viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
			{ enableScripts: true, retainContextWhenHidden: false },
		)

		const copied = new Promise<boolean>((resolve) => {
			const timer = setTimeout(() => resolve(false), TIMEOUT_MS)
			panel?.webview.onDidReceiveMessage((message: { copied?: boolean }) => {
				clearTimeout(timer)
				resolve(message?.copied === true)
			})
			panel?.onDidDispose(() => {
				clearTimeout(timer)
				resolve(false)
			})
		})

		panel.webview.html = buildCopyPage(bodyHtml)
		return await copied
	} catch {
		return false
	} finally {
		panel?.dispose()
	}
}

function buildCopyPage(bodyHtml: string): string {
	const nonce = makeNonce()
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
  body { font-family: Georgia, serif; padding: 1rem; opacity: 0; }
</style>
</head>
<body>
<div id="piece">${bodyHtml}</div>
<script nonce="${nonce}">
  const bridge = acquireVsCodeApi();
  function copyNow() {
    try {
      const piece = document.getElementById("piece");
      const range = document.createRange();
      range.selectNodeContents(piece);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      const copied = document.execCommand("copy");
      selection.removeAllRanges();
      bridge.postMessage({ copied: copied === true });
    } catch (error) {
      bridge.postMessage({ copied: false });
    }
  }
  // A short delay so the panel is focused before the copy is attempted.
  window.addEventListener("load", () => setTimeout(copyNow, 40));
</script>
</body>
</html>`
}

/**
 * A nonce is a security token: it decides what may run in the web view. That
 * rules out `Math.random`, whose sequence is predictable from earlier output.
 */
function makeNonce(): string {
	return randomBytes(24).toString("base64url")
}
