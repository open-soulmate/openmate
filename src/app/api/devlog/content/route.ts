import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

/* GET /api/devlog/content?file=2026-09-05-ai-groups-feature.md
   读取 docs/devlog/ 下的开发记录markdown内容 */
export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("file");
  if (!file) return NextResponse.json({ error: "missing file param" }, { status: 400 });

  /* 安全：只允许读 .md 文件，禁止路径穿越 */
  if (!file.endsWith(".md") || file.includes("..") || file.includes("/")) {
    return NextResponse.json({ error: "invalid file name" }, { status: 400 });
  }

  const filePath = join(process.cwd(), "docs", "devlog", file);
  try {
    const content = await readFile(filePath, "utf-8");
    return NextResponse.json({ content, file });
  } catch {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }
}
