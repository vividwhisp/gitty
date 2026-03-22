import * as vscode from "vscode";
import {
  getGitDiff,
  stageAllChanges,
  commitChanges,
  pushChanges,
  isGitRepo,
  getRepoInfo,
  GitDiff,
} from "./git";
import { generateCommitMessage, checkOllamaAvailable } from "./ollama";
import { getWebviewContent } from "./webview";

interface PanelState {
  isLoading: boolean;
  status: string;
  commitMessage: string;
  logs: string[];
  repoInfo: { branch: string; remote: string };
  hasChanges: boolean;
  changedFiles: string[];
  error: string;
}

let currentPanel: vscode.WebviewView | undefined;
let panelState: PanelState = {
  isLoading: false,
  status: "idle",
  commitMessage: "",
  logs: [],
  repoInfo: { branch: "unknown", remote: "No remote" },
  hasChanges: false,
  changedFiles: [],
  error: "",
};
let currentDiff: GitDiff | undefined;

export function activate(context: vscode.ExtensionContext) {
  // Register webview view provider for activity bar
  const provider = new SmartCommitViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("smartCommit.panel", provider)
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("smartCommit.run", () => {
      vscode.commands.executeCommand("workbench.view.extension.smartCommitContainer");
    })
  );
}

class SmartCommitViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    currentPanel = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    // Load initial state
    loadInitialState().then(() => {
      refreshWebview();
    });

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "generate":
          await handleGenerate();
          break;
        case "commit":
          await handleCommit(false);
          break;
        case "commitAndPush":
          await handleCommit(true);
          break;
      }
    });

    // Refresh when panel becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        loadInitialState().then(() => refreshWebview());
      }
    });
  }
}

function getWorkspacePath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getConfig() {
  const config = vscode.workspace.getConfiguration("smartCommit");
  return {
    ollamaUrl: config.get<string>("ollamaUrl") || "http://localhost:11434",
    model: config.get<string>("model") || "llama3.2",
    autoPush: config.get<boolean>("autoPush") ?? true,
    requestTimeoutSeconds: config.get<number>("requestTimeoutSeconds") ?? 180,
  };
}

async function loadInitialState() {
  const cwd = getWorkspacePath();
  if (!cwd) {
    panelState.error = "No workspace folder open";
    panelState.hasChanges = false;
    return;
  }

  const isRepo = await isGitRepo(cwd);
  if (!isRepo) {
    panelState.error = "Not a git repository";
    panelState.hasChanges = false;
    return;
  }

  panelState.error = "";
  panelState.repoInfo = await getRepoInfo(cwd);

  try {
    currentDiff = await getGitDiff(cwd);
    panelState.hasChanges = currentDiff.allChangedFiles.length > 0;
    panelState.changedFiles = currentDiff.allChangedFiles;
  } catch (e: unknown) {
    const error = e as Error;
    panelState.error = error.message;
    panelState.hasChanges = false;
    panelState.changedFiles = [];
  }
}

async function handleGenerate() {
  const cwd = getWorkspacePath();
  if (!cwd) return;

  const cfg = getConfig();

  panelState.isLoading = true;
  panelState.logs = [];
  panelState.commitMessage = "";
  refreshWebview();

  addLog("→ Checking Ollama connection...");

  const available = await checkOllamaAvailable(cfg.ollamaUrl);
  if (!available) {
    addLog(`✗ Cannot reach Ollama at ${cfg.ollamaUrl}`);
    addLog("✗ Make sure Ollama is running: ollama serve");
    panelState.isLoading = false;
    refreshWebview();
    vscode.window.showErrorMessage(
      `Smart Commit: Cannot connect to Ollama at ${cfg.ollamaUrl}. Run 'ollama serve' first.`
    );
    return;
  }

  addLog(`✓ Ollama connected (${cfg.model})`);
  addLog("→ Staging all changes...");

  try {
    await stageAllChanges(cwd);
    currentDiff = await getGitDiff(cwd);
    panelState.changedFiles = currentDiff.allChangedFiles;

    if (!panelState.hasChanges && currentDiff.allChangedFiles.length === 0) {
      addLog("→ No changes to commit");
      panelState.isLoading = false;
      refreshWebview();
      vscode.window.showInformationMessage("Smart Commit: No changes detected.");
      return;
    }

    addLog(`✓ Staged ${currentDiff.allChangedFiles.length} file(s)`);
    addLog(`→ Generating commit message with ${cfg.model}...`);
    refreshWebview();

    const message = await generateCommitMessage(
      currentDiff,
      cfg.ollamaUrl,
      cfg.model,
      cfg.requestTimeoutSeconds * 1000
    );
    panelState.commitMessage = message;
    addLog("✓ Commit message generated!");

    panelState.hasChanges = true;
    panelState.isLoading = false;
    refreshWebview();
  } catch (e: unknown) {
    const error = e as Error;
    addLog(`✗ Error: ${error.message}`);
    panelState.isLoading = false;
    refreshWebview();
    vscode.window.showErrorMessage(`Smart Commit: ${error.message}`);
  }
}

async function handleCommit(withPush: boolean) {
  const cwd = getWorkspacePath();
  if (!cwd || !panelState.commitMessage) return;

  panelState.isLoading = true;
  refreshWebview();

  addLog("→ Committing changes...");

  const commitResult = await commitChanges(cwd, panelState.commitMessage);
  if (!commitResult.success) {
    addLog(`✗ Commit failed: ${commitResult.message}`);
    panelState.isLoading = false;
    refreshWebview();
    vscode.window.showErrorMessage(`Smart Commit: Commit failed — ${commitResult.message}`);
    return;
  }

  addLog("✓ Committed successfully!");

  if (withPush) {
    addLog("→ Pushing to remote...");
    const pushResult = await pushChanges(cwd);
    if (pushResult.success) {
      addLog(`✓ ${pushResult.message}`);
      addLog("🎉 All done!");
    } else {
      addLog(`✗ Push failed: ${pushResult.message}`);
      vscode.window.showWarningMessage(
        `Smart Commit: Committed but push failed — ${pushResult.message}`
      );
    }
  } else {
    addLog("🎉 Committed! (not pushed)");
  }

  // Reset state
  panelState.commitMessage = "";
  panelState.hasChanges = false;
  panelState.changedFiles = [];
  panelState.isLoading = false;
  panelState.repoInfo = await getRepoInfo(cwd);
  refreshWebview();

  vscode.window.showInformationMessage(
    withPush ? "Smart Commit: Committed & pushed! 🚀" : "Smart Commit: Committed! ✓"
  );
}

function addLog(message: string) {
  panelState.logs.push(message);
  // Keep last 30 lines
  if (panelState.logs.length > 30) {
    panelState.logs = panelState.logs.slice(-30);
  }
  refreshWebview();
}

function refreshWebview() {
  if (currentPanel) {
    currentPanel.webview.html = getWebviewContent(currentPanel.webview, panelState);
  }
}

export function deactivate() {}
