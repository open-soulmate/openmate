import { NextRequest, NextResponse } from "next/server"
import { readFile as fsReadFile, writeFile as fsWriteFile, stat } from "fs/promises"
import { resolve } from "path"

/** 二进制文件扩展名集合 */
const BINARY_EXTS = new Set([
  'dwg', 'dxf', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff',
  'mp3', 'mp4', 'wav', 'ogg', 'flac', 'avi', 'mkv', 'mov', 'webm',
  'zip', 'tar', 'gz', 'bz2', '7z', 'rar',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'wasm', 'bin', 'exe', 'dll', 'so', 'dylib',
  'sqlite', 'db', 'parquet', 'psd', 'sketch',
])

function isBinaryFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return BINARY_EXTS.has(ext)
}

function isAllowedPath(p: string): boolean {
  const resolved = resolve(p)
  const home = process.env.HOME || "/home"
  return resolved.startsWith(home) || resolved.startsWith("/tmp") || resolved.startsWith("/var")
}

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path")
  const mode = req.nextUrl.searchParams.get("mode") // "text" | "binary" | auto
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

    const useBinary = mode === 'binary' || (mode !== 'text' && isBinaryFile(resolved))

    if (useBinary) {
      // 二进制模式：返回 base64，上限 50MB
      if (s.size > 50 * 1024 * 1024) {
        return NextResponse.json({ error: "Binary file too large (>50MB)" }, { status: 400 })
      }
      const buf = await fsReadFile(resolved)
      const base64 = buf.toString('base64')
      return NextResponse.json({
        content: base64,
        encoding: 'base64',
        path: resolved,
        size: s.size,
      })
    } else {
      // 文本模式：UTF-8，上限 1MB
      if (s.size > 1024 * 1024) {
        return NextResponse.json({ error: "File too large (>1MB)" }, { status: 400 })
      }
      const content = await fsReadFile(resolved, "utf-8")
      return NextResponse.json({ content, encoding: 'utf-8', path: resolved, size: s.size })
    }
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
