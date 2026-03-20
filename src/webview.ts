import * as vscode from "vscode";

export function getWebviewContent(
  webview: vscode.Webview,
  state: {
    isLoading: boolean;
    status: string;
    commitMessage: string;
    logs: string[];
    repoInfo: { branch: string; remote: string };
    hasChanges: boolean;
    changedFiles: string[];
    error: string;
  }
): string {
  const logsHtml = state.logs
    .map((log) => {
      const isError = log.startsWith("✗") || log.toLowerCase().includes("error") || log.toLowerCase().includes("failed");
      const isSuccess = log.startsWith("✓") || log.startsWith("🎉");
      const isInfo = log.startsWith("→") || log.startsWith("⠿");
      const cls = isError ? "log-error" : isSuccess ? "log-success" : isInfo ? "log-info" : "log-default";
      return `<div class="log-line ${cls}">${escapeHtml(log)}</div>`;
    })
    .join("");

  const filesHtml = state.changedFiles
    .map((f) => `<div class="file-chip">📄 ${escapeHtml(f)}</div>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Smart Commit</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Syne:wght@400;600;700;800&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0d0d0f;
    --surface: #131316;
    --surface2: #1a1a1f;
    --border: #2a2a35;
    --accent: #7c6af7;
    --accent2: #a78bfa;
    --green: #34d399;
    --red: #f87171;
    --yellow: #fbbf24;
    --text: #e8e8f0;
    --muted: #6b6b85;
    --mono: 'JetBrains Mono', monospace;
    --sans: 'Syne', sans-serif;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    font-size: 13px;
    min-height: 100vh;
    padding: 0;
    overflow-x: hidden;
  }

  .header {
    padding: 20px 16px 14px;
    border-bottom: 1px solid var(--border);
    background: linear-gradient(135deg, #0d0d0f 0%, #13131a 100%);
    position: relative;
    overflow: hidden;
  }

  .header::before {
    content: '';
    position: absolute;
    top: -40px; right: -40px;
    width: 120px; height: 120px;
    background: radial-gradient(circle, rgba(124,106,247,0.15) 0%, transparent 70%);
    pointer-events: none;
  }

  .header-top {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .logo {
    width: 28px; height: 28px;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
    box-shadow: 0 0 16px rgba(124,106,247,0.4);
  }

  .title {
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.02em;
    color: var(--text);
  }

  .subtitle {
    font-size: 10px;
    color: var(--muted);
    font-family: var(--mono);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .repo-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 5px 8px;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--muted);
  }

  .branch-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 6px var(--green);
    flex-shrink: 0;
  }

  .content {
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .section-label {
    font-size: 9px;
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--muted);
    margin-bottom: 6px;
  }

  .files-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .file-chip {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 7px;
    font-size: 10px;
    font-family: var(--mono);
    color: var(--muted);
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .no-changes {
    background: var(--surface2);
    border: 1px dashed var(--border);
    border-radius: 8px;
    padding: 20px;
    text-align: center;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.6;
  }

  .no-changes .icon { font-size: 28px; margin-bottom: 8px; }

  .commit-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 12px;
    font-family: var(--mono);
    font-size: 11px;
    line-height: 1.6;
    color: #c4c4d8;
    min-height: 90px;
    white-space: pre-wrap;
    word-break: break-word;
    transition: border-color 0.2s;
  }

  .commit-box.has-content {
    border-color: rgba(124,106,247,0.4);
    background: linear-gradient(135deg, #131316 0%, #14141c 100%);
  }

  .commit-box.placeholder {
    color: var(--muted);
    font-style: italic;
  }

  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 11px 16px;
    border-radius: 8px;
    border: none;
    font-family: var(--sans);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.03em;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
    overflow: hidden;
  }

  .btn-primary {
    background: linear-gradient(135deg, var(--accent) 0%, #6355e0 100%);
    color: #fff;
    box-shadow: 0 4px 20px rgba(124,106,247,0.35);
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 28px rgba(124,106,247,0.5);
    background: linear-gradient(135deg, var(--accent2) 0%, var(--accent) 100%);
  }

  .btn-primary:active:not(:disabled) { transform: translateY(0); }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .btn-secondary {
    background: var(--surface2);
    border: 1px solid var(--border);
    color: var(--muted);
    font-size: 11px;
    padding: 7px 12px;
  }

  .btn-secondary:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent2);
  }

  .spinner {
    width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,0.25);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .logs-wrap {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 12px;
    font-family: var(--mono);
    font-size: 10px;
    line-height: 1.7;
    max-height: 140px;
    overflow-y: auto;
  }

  .logs-wrap::-webkit-scrollbar { width: 4px; }
  .logs-wrap::-webkit-scrollbar-track { background: transparent; }
  .logs-wrap::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .log-error { color: var(--red); }
  .log-success { color: var(--green); }
  .log-info { color: var(--accent2); }
  .log-default { color: var(--muted); }

  .divider {
    height: 1px;
    background: var(--border);
    margin: 0 -16px;
  }

  .btn-row {
    display: flex;
    gap: 8px;
  }

  .btn-row .btn { flex: 1; }

  .progress-bar {
    height: 2px;
    background: var(--border);
    border-radius: 1px;
    overflow: hidden;
    margin-top: 6px;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent2));
    border-radius: 1px;
    animation: progress-pulse 1.5s ease-in-out infinite;
    width: 60%;
  }

  @keyframes progress-pulse {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(250%); }
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: rgba(124,106,247,0.12);
    border: 1px solid rgba(124,106,247,0.25);
    color: var(--accent2);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 9px;
    font-family: var(--mono);
    font-weight: 600;
    letter-spacing: 0.05em;
  }
</style>
</head>
<body>

<div class="header">
  <div class="header-top">
    <div class="logo">⚡</div>
    <div>
      <div class="title">Smart Commit</div>
      <div class="subtitle">Powered by llama3.2 · Ollama</div>
    </div>
  </div>
  <div class="repo-badge">
    <div class="branch-dot"></div>
    <span>${escapeHtml(state.repoInfo.branch)}</span>
    <span style="color:#3a3a50">·</span>
    <span style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(state.repoInfo.remote)}</span>
  </div>
</div>

<div class="content">

  ${
    !state.hasChanges && !state.isLoading
      ? `
    <div class="no-changes">
      <div class="icon">✨</div>
      <div style="font-weight:700;color:var(--text);margin-bottom:4px">All clean!</div>
      <div>No uncommitted changes detected<br>in your workspace.</div>
    </div>
  `
      : `
    ${
      state.changedFiles.length > 0
        ? `
    <div>
      <div class="section-label">Changed files <span class="badge">${state.changedFiles.length}</span></div>
      <div class="files-wrap">${filesHtml}</div>
    </div>
    `
        : ""
    }

    <div>
      <div class="section-label" style="display:flex;align-items:center;justify-content:space-between">
        <span>Commit message</span>
        ${state.commitMessage ? `<span class="badge">AI Generated</span>` : ""}
      </div>
      <div class="commit-box ${state.commitMessage ? "has-content" : "placeholder"}">${
        state.commitMessage
          ? escapeHtml(state.commitMessage)
          : state.isLoading
          ? "Analyzing changes with llama3.2..."
          : "Click Generate to create an AI commit message"
      }</div>
      ${state.isLoading ? `<div class="progress-bar"><div class="progress-fill"></div></div>` : ""}
    </div>
  `
  }

  ${
    state.logs.length > 0
      ? `
  <div>
    <div class="section-label">Activity log</div>
    <div class="logs-wrap">${logsHtml}</div>
  </div>
  `
      : ""
  }

  ${
    state.hasChanges || state.isLoading
      ? `
  <div class="divider"></div>

  <div class="btn-row">
    <button class="btn btn-primary" onclick="sendMessage('generate')" ${state.isLoading ? "disabled" : ""}>
      ${state.isLoading ? `<div class="spinner"></div> Generating...` : "⚡ Generate Message"}
    </button>
  </div>

  ${
    state.commitMessage
      ? `
  <div class="btn-row">
    <button class="btn btn-secondary" onclick="sendMessage('commit')" ${state.isLoading ? "disabled" : ""}>
      🔒 Commit Only
    </button>
    <button class="btn btn-primary" onclick="sendMessage('commitAndPush')" ${state.isLoading ? "disabled" : ""}>
      🚀 Commit & Push
    </button>
  </div>
  `
      : ""
  }
  `
      : ""
  }

</div>

<script>
  const vscode = acquireVsCodeApi();
  function sendMessage(cmd) {
    vscode.postMessage({ command: cmd });
  }
</script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
