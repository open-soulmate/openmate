import { NextRequest, NextResponse } from "next/server"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

// Allowed commands (whitelist for security)
const ALLOWED_PREFIXES = [
  "ls ", "ls", "cat ", "head ", "tail ", "wc ", "file ",
  "git status", "git log", "git diff", "git branch",
  "du ", "df ", "free ", "uptime", "uname",
  "node --version", "npm --version", "python3 --version",
  "which ", "type ", "echo ",
]

function isCommandAllowed(cmd: string): boolean {
  const trimmed = cmd.trim()
  // Block dangerous patterns
  if (/[;&|`$(){}]/.test(trimmed)) return false
  if (trimmed.startsWith("rm ")) return false
  if (trimmed.startsWith("sudo ")) return false
  if (trimmed.startsWith("chmod ")) return false
  if (trimmed.startsWith("curl ") || trimmed.startsWith("wget ")) return false

  return ALLOWED_PREFIXES.some(prefix => trimmed === prefix.trim() || trimmed.startsWith(prefix))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { cmd } = body
    if (!cmd) {
      return NextResponse.json({ error: "cmd required" }, { status: 400 })
    }

    if (!isCommandAllowed(cmd)) {
      return NextResponse.json({ error: "Command not allowed for security reasons" }, { status: 403 })
    }

    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 10000,
      maxBuffer: 512 * 1024,
      env: { ...process.env, TERM: "dumb" },
    })

    return NextResponse.json({ output: stdout || stderr || "" })
  } catch (err: any) {
    return NextResponse.json({ output: err.stderr || err.message || "Command failed" }, { status: 200 })
  }
}
