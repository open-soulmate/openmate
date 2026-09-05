import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join, normalize, extname } from "path";

/**
 * GET /api/docs/content?path=ADR/001-选择ACP协议.md
 * 读取 docs/{path} 下的 markdown 文件内容
 * 
 * 安全约束：
 * - 禁止路径穿越（..）
 * - 只允许 .md 文件
 * - 路径标准化后必须在 docs/ 目录内
 */
export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get("path");
  
  /* 参数校验 */
  if (!filePath) {
    return NextResponse.json({ error: "缺少 path 参数" }, { status: 400 });
  }

  /* 安全：只允许 .md 文件 */
  if (extname(filePath) !== ".md") {
    return NextResponse.json({ error: "仅支持 .md 文件" }, { status: 400 });
  }

  /* 安全：禁止路径穿越 */
  if (filePath.includes("..")) {
    return NextResponse.json({ error: "路径不允许包含 .." }, { status: 400 });
  }

  /* 构建完整路径并标准化（防止 %2e%2e 等编码绕过） */
  const docsDir = join(process.cwd(), "docs");
  const fullPath = normalize(join(docsDir, filePath));

  /* 安全：确保解析后的路径仍在 docs/ 目录内 */
  if (!fullPath.startsWith(docsDir)) {
    return NextResponse.json({ error: "路径越界" }, { status: 403 });
  }

  try {
    const content = await readFile(fullPath, "utf-8");
    return NextResponse.json({ content, path: filePath });
  } catch {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
}
