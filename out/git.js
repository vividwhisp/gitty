"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGitDiff = getGitDiff;
exports.stageAllChanges = stageAllChanges;
exports.commitChanges = commitChanges;
exports.pushChanges = pushChanges;
exports.isGitRepo = isGitRepo;
exports.getRepoInfo = getRepoInfo;
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
async function getGitDiff(cwd) {
    try {
        const [stagedResult, unstagedResult, statusResult] = await Promise.all([
            execAsync("git diff --cached", { cwd }).catch(() => ({ stdout: "" })),
            execAsync("git diff", { cwd }).catch(() => ({ stdout: "" })),
            execAsync("git status --porcelain", { cwd }).catch(() => ({ stdout: "" })),
        ]);
        const statusLines = statusResult.stdout.trim().split("\n").filter(Boolean);
        const stagedFiles = [];
        const untrackedFiles = [];
        const allChangedFiles = [];
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
    }
    catch {
        throw new Error("Failed to get git diff. Is this a git repository?");
    }
}
async function stageAllChanges(cwd) {
    await execAsync("git add -A", { cwd });
}
async function commitChanges(cwd, message) {
    try {
        await execAsync(`git commit -m ${JSON.stringify(message)}`, { cwd });
        return { success: true, message: "Committed successfully" };
    }
    catch (err) {
        const error = err;
        return {
            success: false,
            message: error.stderr || error.message || "Commit failed",
        };
    }
}
async function pushChanges(cwd) {
    try {
        // Get current branch
        const { stdout: branch } = await execAsync("git rev-parse --abbrev-ref HEAD", { cwd });
        const branchName = branch.trim();
        // Try push, if upstream not set then set it
        try {
            await execAsync(`git push origin ${branchName}`, { cwd });
        }
        catch {
            await execAsync(`git push --set-upstream origin ${branchName}`, { cwd });
        }
        return { success: true, message: `Pushed to origin/${branchName}`, pushed: true };
    }
    catch (err) {
        const error = err;
        return {
            success: false,
            message: error.stderr || error.message || "Push failed",
            pushed: false,
        };
    }
}
async function isGitRepo(cwd) {
    try {
        await execAsync("git rev-parse --is-inside-work-tree", { cwd });
        return true;
    }
    catch {
        return false;
    }
}
async function getRepoInfo(cwd) {
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
    }
    catch {
        return { branch: "unknown", remote: "unknown" };
    }
}
//# sourceMappingURL=git.js.map