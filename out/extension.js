"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const git_1 = require("./git");
const ollama_1 = require("./ollama");
const webview_1 = require("./webview");
let currentPanel;
let panelState = {
    isLoading: false,
    status: "idle",
    commitMessage: "",
    logs: [],
    repoInfo: { branch: "unknown", remote: "No remote" },
    hasChanges: false,
    changedFiles: [],
    error: "",
};
let currentDiff;
function activate(context) {
    // Register webview view provider for activity bar
    const provider = new SmartCommitViewProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("smartCommit.panel", provider));
    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand("smartCommit.run", () => {
        vscode.commands.executeCommand("workbench.view.extension.smartCommitContainer");
    }));
}
class SmartCommitViewProvider {
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
    }
    resolveWebviewView(webviewView) {
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
function getWorkspacePath() {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
function getConfig() {
    const config = vscode.workspace.getConfiguration("smartCommit");
    return {
        ollamaUrl: config.get("ollamaUrl") || "http://localhost:11434",
        model: config.get("model") || "llama3.2",
        autoPush: config.get("autoPush") ?? true,
    };
}
async function loadInitialState() {
    const cwd = getWorkspacePath();
    if (!cwd) {
        panelState.error = "No workspace folder open";
        panelState.hasChanges = false;
        return;
    }
    const isRepo = await (0, git_1.isGitRepo)(cwd);
    if (!isRepo) {
        panelState.error = "Not a git repository";
        panelState.hasChanges = false;
        return;
    }
    panelState.error = "";
    panelState.repoInfo = await (0, git_1.getRepoInfo)(cwd);
    try {
        currentDiff = await (0, git_1.getGitDiff)(cwd);
        panelState.hasChanges = currentDiff.allChangedFiles.length > 0;
        panelState.changedFiles = currentDiff.allChangedFiles;
    }
    catch (e) {
        const error = e;
        panelState.error = error.message;
        panelState.hasChanges = false;
        panelState.changedFiles = [];
    }
}
async function handleGenerate() {
    const cwd = getWorkspacePath();
    if (!cwd)
        return;
    const cfg = getConfig();
    panelState.isLoading = true;
    panelState.logs = [];
    panelState.commitMessage = "";
    refreshWebview();
    addLog("→ Checking Ollama connection...");
    const available = await (0, ollama_1.checkOllamaAvailable)(cfg.ollamaUrl);
    if (!available) {
        addLog(`✗ Cannot reach Ollama at ${cfg.ollamaUrl}`);
        addLog("✗ Make sure Ollama is running: ollama serve");
        panelState.isLoading = false;
        refreshWebview();
        vscode.window.showErrorMessage(`Smart Commit: Cannot connect to Ollama at ${cfg.ollamaUrl}. Run 'ollama serve' first.`);
        return;
    }
    addLog(`✓ Ollama connected (${cfg.model})`);
    addLog("→ Staging all changes...");
    try {
        await (0, git_1.stageAllChanges)(cwd);
        currentDiff = await (0, git_1.getGitDiff)(cwd);
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
        const message = await (0, ollama_1.generateCommitMessage)(currentDiff, cfg.ollamaUrl, cfg.model);
        panelState.commitMessage = message;
        addLog("✓ Commit message generated!");
        panelState.hasChanges = true;
        panelState.isLoading = false;
        refreshWebview();
    }
    catch (e) {
        const error = e;
        addLog(`✗ Error: ${error.message}`);
        panelState.isLoading = false;
        refreshWebview();
        vscode.window.showErrorMessage(`Smart Commit: ${error.message}`);
    }
}
async function handleCommit(withPush) {
    const cwd = getWorkspacePath();
    if (!cwd || !panelState.commitMessage)
        return;
    panelState.isLoading = true;
    refreshWebview();
    addLog("→ Committing changes...");
    const commitResult = await (0, git_1.commitChanges)(cwd, panelState.commitMessage);
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
        const pushResult = await (0, git_1.pushChanges)(cwd);
        if (pushResult.success) {
            addLog(`✓ ${pushResult.message}`);
            addLog("🎉 All done!");
        }
        else {
            addLog(`✗ Push failed: ${pushResult.message}`);
            vscode.window.showWarningMessage(`Smart Commit: Committed but push failed — ${pushResult.message}`);
        }
    }
    else {
        addLog("🎉 Committed! (not pushed)");
    }
    // Reset state
    panelState.commitMessage = "";
    panelState.hasChanges = false;
    panelState.changedFiles = [];
    panelState.isLoading = false;
    panelState.repoInfo = await (0, git_1.getRepoInfo)(cwd);
    refreshWebview();
    vscode.window.showInformationMessage(withPush ? "Smart Commit: Committed & pushed! 🚀" : "Smart Commit: Committed! ✓");
}
function addLog(message) {
    panelState.logs.push(message);
    // Keep last 30 lines
    if (panelState.logs.length > 30) {
        panelState.logs = panelState.logs.slice(-30);
    }
    refreshWebview();
}
function refreshWebview() {
    if (currentPanel) {
        currentPanel.webview.html = (0, webview_1.getWebviewContent)(currentPanel.webview, panelState);
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map