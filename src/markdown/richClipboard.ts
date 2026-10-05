import { randomBytes } from "crypto"
import * as vscode from "vscode"

/** If the browser copy has not answered by now, fall back instead of hanging. */
const TIMEOUT_MS = 2000

/**
 * Puts formatted text on the clipboard, so that pasting into a blog editor, a
 * newsletter, or a word processor arrives with its headings, bold text, and
 * links intact.
 *
 * Why this is roundabout: the VS Code API can only place plain text on the
 * clipboard. The system clipboard needs a `text/html` flavour for a rich paste,
 * and the only way to produce one without shipping platform-specific helper
 * programs is to let a web view select the rendered content and copy it the way
 * a browser would.
 *
 * The panel exists for a fraction of a second and is always closed again. Every
 * failure path returns false so the caller can fall back to plain text; a failed
 * rich copy must never lose the writer's work or leave a stray panel behind.
 */
export async function copyRichText(bodyHtml: string): Promise<boolean> {
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
