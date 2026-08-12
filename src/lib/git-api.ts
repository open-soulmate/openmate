import { executeCommand } from "@/lib/tauri-bridge";

// ─── Types ──────────────────────────────────────────────────────────────────

export type FileStatus = "M" | "A" | "D" | "R" | "C" | "U" | "?";

export interface GitFile {
  path: string;
  status: FileStatus;
  staged: boolean;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  files: GitFile[];
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function git(cwd: string, args: string): Promise<string> {
  return executeCommand(`cd "${cwd}" && git ${args} 2>&1`);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function getStatus(cwd: string): Promise<GitStatus> {
  const raw = await git(cwd, "status --porcelain=v2 --branch");
  const lines = raw.split("\n").filter(Boolean);
  let branch = "";
  let ahead = 0;
  let behind = 0;
  const files: GitFile[] = [];

  for (const line of lines) {
    if (line.startsWith("# branch.head ")) {
      branch = line.slice("# branch.head ".length);
    } else if (line.startsWith("# branch.ab ")) {
      const parts = line.slice("# branch.ab ".length).split(" ");
      ahead = parseInt(parts[0] ?? "0", 10) || 0;
      behind = Math.abs(parseInt(parts[1] ?? "0", 10) || 0);
    } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      // ordinary or rename/copy change
      const parts = line.split(" ");
      const xy = parts.length > 1 ? parts[1] : "";
      const x = xy.charAt(0); // index status
      const y = xy.charAt(1); // worktree status
      const filePath = parts.slice(2).join(" ");

      if (x !== "." && x !== "?") {
        files.push({ path: filePath, status: x as FileStatus, staged: true });
      }
      if (y !== "." && y !== "?") {
        files.push({ path: filePath, status: y as FileStatus, staged: false });
      }
    } else if (line.startsWith("? ")) {
      files.push({ path: line.slice(2), status: "?", staged: false });
    }
  }

  return { branch, ahead, behind, files };
}

export async function getBranches(cwd: string): Promise<GitBranch[]> {
  const raw = await git(cwd, "branch -a");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const current = line.startsWith("* ");
      const name = line.replace(/^\*?\s+/, "").trim();
      const isRemote = name.startsWith("remotes/");
      return {
        name: isRemote ? name : name,
        current,
        remote: isRemote ? name.split("/").slice(0, 2).join("/") : undefined,
      };
    })
    .filter((b) => !b.name.includes("HEAD"));
}

export async function getCurrentBranch(cwd: string): Promise<string> {
  const raw = await git(cwd, "rev-parse --abbrev-ref HEAD");
  return raw.trim();
}

export async function checkoutBranch(
  cwd: string,
  branch: string,
): Promise<void> {
  await git(cwd, `checkout "${branch}"`);
}

export async function getLog(
  cwd: string,
  limit = 10,
): Promise<GitCommit[]> {
  const sep = "---COMMIT_SEP---";
  const raw = await git(
    cwd,
    `log -${limit} --pretty=format:"%H${sep}%h${sep}%an${sep}%ae${sep}%ai${sep}%s"`,
  );
  if (!raw.trim()) return [];
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(sep);
      return {
        hash: parts[0] ?? "",
        shortHash: parts[1] ?? "",
        author: parts[2] ?? "",
        email: parts[3] ?? "",
        date: parts[4] ?? "",
        message: parts[5] ?? "",
      };
    });
}

export async function stage(cwd: string, file: string): Promise<void> {
  await git(cwd, `add "${file}"`);
}

export async function unstage(cwd: string, file: string): Promise<void> {
  await git(cwd, `reset HEAD "${file}"`);
}

export async function stageAll(cwd: string): Promise<void> {
  await git(cwd, "add -A");
}

export async function unstageAll(cwd: string): Promise<void> {
  await git(cwd, "reset HEAD");
}

export async function commit(cwd: string, message: string): Promise<string> {
  const escaped = message.replace(/"/g, '\\"');
  const raw = await git(cwd, `commit -m "${escaped}"`);
  return raw.trim();
}

export async function diff(cwd: string, file: string): Promise<string> {
  return git(cwd, `diff "${file}"`);
}

export async function diffStaged(cwd: string, file: string): Promise<string> {
  return git(cwd, `diff --cached "${file}"`);
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const raw = await git(cwd, "rev-parse --is-inside-work-tree");
    return raw.trim() === "true";
  } catch {
    return false;
  }
}
