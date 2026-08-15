import { NextRequest, NextResponse } from "next/server"
import { readFile as fsReadFile, writeFile as fsWriteFile, stat } from "fs/promises"
import { resolve } from "path"

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
    const s = await stat(resolved)
    if (!s.isFile()) {
      return NextResponse.json({ error: "Not a file" }, { status: 400 })
    }
    // Limit to 1MB for safety
    if (s.size > 1024 * 1024) {
      return NextResponse.json({ error: "File too large (>1MB)" }, { status: 400 })
    }
    const content = await fsReadFile(resolved, "utf-8")
    return NextResponse.json({ content, path: resolved, size: s.size })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 404 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { path, content } = body
    if (!path || content === undefined) {
      return NextResponse.json({ error: "path and content required" }, { status: 400 })
    }

    const resolved = resolve(path)
    if (!isAllowedPath(resolved)) {
      return NextResponse.json({ error: "Path not allowed" }, { status: 403 })
    }

    await fsWriteFile(resolved, content, "utf-8")
    return NextResponse.json({ ok: true, path: resolved })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
