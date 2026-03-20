# ⚡ Smart Commit — VS Code Extension

AI-powered git commit messages using **Ollama + llama3.2**, right in your VS Code Activity Bar.

---

## Features

- 🧠 **AI-generated commit messages** using llama3.2 via Ollama
- ⚡ **One-click workflow** — stages, commits, and pushes
- 📋 **Activity Bar panel** with live file change view
- 📝 **Conventional commit format** with detailed bullet points
- 🚀 **Commit-only or Commit & Push** options
- 🔄 **Auto-stages** all workspace changes

---

## Requirements

### Ollama (local AI)
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull the model
ollama pull llama3.2

# Start Ollama server
ollama serve
```

### Git
Your workspace must be a git repository with a remote configured.

---

## Setup & Development

```bash
# Clone / open the extension folder
cd smart-commit-extension

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Open in VS Code
code .

# Press F5 to launch Extension Development Host
```

---

## Usage

1. Open a git repository in VS Code
2. Click the **⚡ Smart Commit** icon in the Activity Bar (left sidebar)
3. Click **⚡ Generate Message** — waits for Ollama to analyze your diff
4. Review the AI-generated commit message
5. Click **🔒 Commit Only** or **🚀 Commit & Push**

---

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `smartCommit.ollamaUrl` | `http://localhost:11434` | Ollama server URL |
| `smartCommit.model` | `llama3.2` | Model to use |
| `smartCommit.autoPush` | `true` | Auto push after commit |

---

## Switching to Anthropic API (Future)

When ready to switch from Ollama to Claude, update `src/ollama.ts`:

```typescript
// Replace the generateCommitMessage function body with:
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": process.env.ANTHROPIC_API_KEY!,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: "claude-opus-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  }),
});
```

---

## File Structure

```
smart-commit-extension/
├── src/
│   ├── extension.ts   # Main entry point, state management
│   ├── git.ts         # Git operations (diff, stage, commit, push)
│   ├── ollama.ts      # Ollama AI integration
│   └── webview.ts     # Activity bar panel HTML/CSS/JS
├── media/
│   └── icon.svg       # Activity bar icon
├── package.json       # Extension manifest
├── tsconfig.json      # TypeScript config
└── README.md
```
