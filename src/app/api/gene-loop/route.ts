import { NextRequest, NextResponse } from "next/server";

/**
 * gene-loop API代理 — Next.js → acp-proxy(:8092) /api/gene-loop/*
 * 用法: GET/POST /api/gene-loop?path=<endpoint>[&status=...]
 *   path=status|proposals|queue|escalations|digest|propose|review/{id}|promote/{id}
 */

const ACP = process.env.ACP_PROXY_URL || "http://127.0.0.1:8092";

async function forward(req: NextRequest, path: string) {
  const { searchParams } = new URL(req.url);
  const qs = new URLSearchParams(searchParams);
  qs.delete("path");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const url = `${ACP}/api/gene-loop/${path}${suffix}`;
  const init: RequestInit = { method: req.method };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.headers = { "Content-Type": "application/json" };
    init.body = await req.text();
  }
  try {
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { ok: false, error: "acp_proxy_unreachable", hint: `:8092 ${path}` },
      { status: 502 },
    );
  }
}

export async function GET(req: NextRequest) {
  const path = new URL(req.url).searchParams.get("path") || "status";
  return forward(req, path);
}

export async function POST(req: NextRequest) {
  const path = new URL(req.url).searchParams.get("path") || "propose";
  return forward(req, path);
}
