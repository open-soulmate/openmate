import { NextRequest, NextResponse } from "next/server"
import { readdir, stat } from "fs/promises"
import { join, resolve } from "path"

// Security: only allow access under home directory or /tmp
function isAllowedPath(p: string): boolean {
  const resolved = resolve(p)
  const home = process.env.HOME || "/home"
  return resolved.startsWith(home) || resolved.startsWith("/tmp") || resolved.startsWith("/var")
}

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path")
  if (!path) {
    return NextResponse.json({ error: "path parameter required" }, { status: 400 })
  }

  const resolved = resolve(path)
  if (!isAllowedPath(resolved)) {
    return NextResponse.json({ error: "Path not allowed" }, { status: 403 })
  }

  try {
    const entries = await readdir(resolved)
    // Sort: directories first, then files
    const detailed = await Promise.all(
      entries.map(async (name) => {
        try {
          const s = await stat(join(resolved, name))
          return { name, isDir: s.isDirectory() }
        } catch {
          return { name, isDir: false }
        }
      })
    )
    detailed.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return NextResponse.json({ entries: detailed.map(e => e.name), path: resolved })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 404 })
  }
}
