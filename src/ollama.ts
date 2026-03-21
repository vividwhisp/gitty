import * as http from "http";
import { GitDiff } from "./git";

export async function generateCommitMessage(
  diff: GitDiff,
  ollamaUrl: string,
  model: string
): Promise<string> {
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
        } catch {
          reject(new Error("Failed to parse Ollama response"));
        }
      });
    });

    req.on("error", (err) => {
      reject(
        new Error(
          `Cannot connect to Ollama at ${ollamaUrl}. Make sure Ollama is running.\n${err.message}`
        )
      );
    });

    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error("Ollama request timed out after 60 seconds"));
    });

    req.write(body);
    req.end();
  });
}

function buildPrompt(diff: GitDiff): string {
  const changedFiles = diff.allChangedFiles.join(", ");
  const diffContent = (diff.staged || diff.unstaged || "").substring(0, 4000);

  return `You are a professional software engineer writing a git commit message.

Analyze the following git changes and write a clear, concise, and descriptive commit message.

Changed files: ${changedFiles}

Git diff:
${diffContent}

Requirements:
- First line: conventional commit format - type(scope): short description (max 72 chars)
  Types: feat, fix, refactor, docs, style, test, chore, perf
- Leave a blank line after the first line
- Then write 2-4 bullet points explaining WHAT changed and WHY
- Be specific, not vague
- Do NOT include any explanation outside of the commit message itself
- Do NOT wrap in code blocks or quotes
- Do NOT say things like "Here is the commit message" or "Here is a complete commit message"
- Output only the final commit message text with no introduction and no closing note

Example format:
feat(auth): add JWT refresh token rotation

- Implement sliding window refresh token strategy to reduce re-auth friction
- Add token blacklist to prevent reuse after rotation
- Update middleware to handle new token pair response format
- Fixes session expiry bug reported in issue #42

Now write the commit message:`;
}

function cleanCommitMessage(raw: string): string {
  const normalized = raw
    .replace(/\r\n/g, "\n")
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n```$/i, "")
    .trim();

  const lines = normalized.split("\n").map((line) => line.trim());
  const commitHeaderIndex = lines.findIndex(isCommitHeader);

  if (commitHeaderIndex === -1) {
    return normalized;
  }

  const extracted: string[] = [lines[commitHeaderIndex]];
  let sawBullet = false;

  for (const line of lines.slice(commitHeaderIndex + 1)) {
    if (!line) {
      if (extracted[extracted.length - 1] !== "") {
        extracted.push("");
      }
      continue;
    }

    if (isBulletLine(line)) {
      sawBullet = true;
      extracted.push(normalizeBullet(line));
      continue;
    }

    if (!sawBullet && isIntroLabel(line)) {
      continue;
    }

    if (sawBullet) {
      break;
    }
  }

  while (extracted[extracted.length - 1] === "") {
    extracted.pop();
  }

  return extracted.join("\n").trim();
}

function isCommitHeader(line: string): boolean {
  return /^(feat|fix|refactor|docs|style|test|chore|perf)(\([^)]+\))?!?:\s+\S+/i.test(
    line
  );
}

function isBulletLine(line: string): boolean {
  return /^[-*•]\s+/.test(line);
}

function normalizeBullet(line: string): string {
  return line.replace(/^([*•])\s+/, "- ");
}

function isIntroLabel(line: string): boolean {
  return /^(commit message|message|here'?s|here is|below is|this is)\b/i.test(line);
}

export async function checkOllamaAvailable(ollamaUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL(`${ollamaUrl}/api/tags`);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 11434,
        path: url.pathname,
        method: "GET",
      },
      (res) => {
        resolve(res.statusCode === 200);
      }
    );
    req.on("error", () => resolve(false));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}
