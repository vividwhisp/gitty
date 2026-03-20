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
exports.generateCommitMessage = generateCommitMessage;
exports.checkOllamaAvailable = checkOllamaAvailable;
const http = __importStar(require("http"));
async function generateCommitMessage(diff, ollamaUrl, model) {
    const prompt = buildPrompt(diff);
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model,
            prompt,
            stream: false,
            options: {
                temperature: 0.3,
                top_p: 0.9,
            },
        });
        const url = new URL(`${ollamaUrl}/api/generate`);
        const options = {
            hostname: url.hostname,
            port: url.port || 11434,
            path: url.pathname,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
            },
        };
        const req = http.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                try {
                    const parsed = JSON.parse(data);
                    const rawMessage = parsed.response?.trim() || "";
                    const cleaned = cleanCommitMessage(rawMessage);
                    resolve(cleaned);
                }
                catch {
                    reject(new Error("Failed to parse Ollama response"));
                }
            });
        });
        req.on("error", (err) => {
            reject(new Error(`Cannot connect to Ollama at ${ollamaUrl}. Make sure Ollama is running.\n${err.message}`));
        });
        req.setTimeout(60000, () => {
            req.destroy();
            reject(new Error("Ollama request timed out after 60 seconds"));
        });
        req.write(body);
        req.end();
    });
}
function buildPrompt(diff) {
    const changedFiles = diff.allChangedFiles.join(", ");
    const diffContent = (diff.staged || diff.unstaged || "").substring(0, 4000);
    return `You are a professional software engineer writing a git commit message.

Analyze the following git changes and write a clear, concise, and descriptive commit message.

Changed files: ${changedFiles}

Git diff:
${diffContent}

Requirements:
- First line: conventional commit format — type(scope): short description (max 72 chars)
  Types: feat, fix, refactor, docs, style, test, chore, perf
- Leave a blank line after the first line
- Then write 2-4 bullet points explaining WHAT changed and WHY
- Be specific, not vague
- Do NOT include any explanation outside of the commit message itself
- Do NOT wrap in code blocks or quotes

Example format:
feat(auth): add JWT refresh token rotation

- Implement sliding window refresh token strategy to reduce re-auth friction
- Add token blacklist to prevent reuse after rotation
- Update middleware to handle new token pair response format
- Fixes session expiry bug reported in issue #42

Now write the commit message:`;
}
function cleanCommitMessage(raw) {
    // Strip markdown code fences if model wraps in them
    let msg = raw.replace(/^```[a-z]*\n?/i, "").replace(/```$/i, "").trim();
    // Remove any leading "Commit message:" or similar labels
    msg = msg.replace(/^(commit message:|here'?s? (the|a|your) commit message:?)\s*/i, "").trim();
    return msg;
}
async function checkOllamaAvailable(ollamaUrl) {
    return new Promise((resolve) => {
        const url = new URL(`${ollamaUrl}/api/tags`);
        const req = http.request({
            hostname: url.hostname,
            port: url.port || 11434,
            path: url.pathname,
            method: "GET",
        }, (res) => {
            resolve(res.statusCode === 200);
        });
        req.on("error", () => resolve(false));
        req.setTimeout(5000, () => {
            req.destroy();
            resolve(false);
        });
        req.end();
    });
}
//# sourceMappingURL=ollama.js.map