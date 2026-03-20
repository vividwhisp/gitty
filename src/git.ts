import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface GitDiff {
  staged: string;
  unstaged: string;
  untrackedFiles: string[];
  stagedFiles: string[];
  allChangedFiles: string[];
}

export interface CommitResult {
  success: boolean;
  message: string;
  pushed?: boolean;
}

export async function getGitDiff(cwd: string): Promise<GitDiff> {
  try {
    const [stagedResult, unstagedResult, statusResult] = await Promise.all([
      execAsync("git diff --cached", { cwd }).catch(() => ({ stdout: "" })),
      execAsync("git diff", { cwd }).catch(() => ({ stdout: "" })),
      execAsync("git status --porcelain", { cwd }).catch(() => ({ stdout: "" })),
    ]);

    const statusLines = statusResult.stdout.trim().split("\n").filter(Boolean);
    const stagedFiles: string[] = [];
    const untrackedFiles: string[] = [];
    const allChangedFiles: string[] = [];

    for (const line of statusLines) {
      const status = line.substring(0, 2);
      const file = line.substring(3).trim();
      allChangedFiles.push(file);
      if (status[0] !== " " && status[0] !== "?") {
        stagedFiles.push(file);
      }
      if (status === "??") {
        untrackedFiles.push(file);
      }
    }

    return {
      staged: stagedResult.stdout,
      unstaged: unstagedResult.stdout,
      untrackedFiles,
      stagedFiles,
      allChangedFiles,
    };
  } catch {
    throw new Error("Failed to get git diff. Is this a git repository?");
  }
}

export async function stageAllChanges(cwd: string): Promise<void> {
  await execAsync("git add -A", { cwd });
}

export async function commitChanges(
  cwd: string,
  message: string
): Promise<CommitResult> {
  try {
    await execAsync(`git commit -m ${JSON.stringify(message)}`, { cwd });
    return { success: true, message: "Committed successfully" };
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string };
    return {
      success: false,
      message: error.stderr || error.message || "Commit failed",
    };
  }
}

export async function pushChanges(cwd: string): Promise<CommitResult> {
  try {
    // Get current branch
    const { stdout: branch } = await execAsync(
      "git rev-parse --abbrev-ref HEAD",
      { cwd }
    );
    const branchName = branch.trim();

    // Try push, if upstream not set then set it
    try {
      await execAsync(`git push origin ${branchName}`, { cwd });
    } catch {
      await execAsync(
        `git push --set-upstream origin ${branchName}`,
        { cwd }
      );
    }

    return { success: true, message: `Pushed to origin/${branchName}`, pushed: true };
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string };
    return {
      success: false,
      message: error.stderr || error.message || "Push failed",
      pushed: false,
    };
  }
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await execAsync("git rev-parse --is-inside-work-tree", { cwd });
    return true;
  } catch {
    return false;
  }
}

export async function getRepoInfo(
  cwd: string
): Promise<{ branch: string; remote: string }> {
  try {
    const [branchResult, remoteResult] = await Promise.all([
      execAsync("git rev-parse --abbrev-ref HEAD", { cwd }).catch(() => ({
        stdout: "unknown",
      })),
      execAsync("git remote get-url origin", { cwd }).catch(() => ({
        stdout: "No remote",
      })),
    ]);
    return {
      branch: branchResult.stdout.trim(),
      remote: remoteResult.stdout.trim(),
    };
  } catch {
    return { branch: "unknown", remote: "unknown" };
  }
}
