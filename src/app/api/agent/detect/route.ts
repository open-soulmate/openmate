import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

export async function POST(req: NextRequest) {
  const { binary } = await req.json();
  if (!binary) return NextResponse.json({ exists: false });

  try {
    const whichCmd = process.platform === 'win32' ? `where ${binary}` : `which ${binary}`;
    const path = execSync(whichCmd, { encoding: 'utf-8', timeout: 3000 }).trim();
    
    let version: string | undefined;
    try {
      const versionCmd = `${binary} --version 2>/dev/null || ${binary} -v 2>/dev/null || ${binary} version 2>/dev/null`;
      version = execSync(versionCmd, { encoding: 'utf-8', timeout: 3000 }).trim().split('\n')[0];
    } catch {}

    return NextResponse.json({ exists: true, path, version });
  } catch {
    return NextResponse.json({ exists: false });
  }
}
