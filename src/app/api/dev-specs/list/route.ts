import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import { join } from "path";

/* GET /api/dev-specs/list
   动态读取 docs/specs/ 目录下的所有 .md 文件，返回文件列表+元信息 */
export async function GET() {
  const specsDir = join(process.cwd(), "docs", "specs");
  try {
    const files = await readdir(specsDir);
    /* 只保留 .md 文件，排除 INDEX */
    const mdFiles = files.filter(f => f.endsWith(".md") && f !== "00-INDEX.md").sort();

    /* 读取每个文件的修改时间 */
    const specs = await Promise.all(
      mdFiles.map(async (fileName) => {
        const filePath = join(specsDir, fileName);
        const fileStat = await stat(filePath);
        /* 从文件名解析编号和名称，如 28-UI-v2.0-前端UI设计规范.md */
        const match = fileName.match(/^(\d+)-(.+?)-v([\d.]+)-(.+)\.md$/);
        const id = match?.[1] || fileName.split("-")[0];
        const name = match?.[2] || fileName;
        const version = match?.[3] || "1.0";
        const desc = match?.[4] || fileName.replace(".md", "");
        return {
          id,
          name,
          desc,
          version,
          fileName,
          date: fileStat.mtime.toISOString().split("T")[0],
        };
      })
    );

    return NextResponse.json({ specs });
  } catch (err) {
    return NextResponse.json({ error: "failed to read specs directory", specs: [] }, { status: 500 });
  }
}
