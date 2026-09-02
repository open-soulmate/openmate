import { NextRequest, NextResponse } from "next/server";

/**
 * Bidding API proxy — forwards requests to ACP Proxy bidding backend (port 8092).
 * Routes: /api/bidding/projects, /api/bidding/parse, /api/bidding/outline,
 *         /api/bidding/generate, /api/bidding/check, /api/bidding/export
 */

const ACP_BASE = process.env.ACP_PROXY_URL || "http://127.0.0.1:8092";

async function proxy(req: NextRequest, path: string) {
  const url = `${ACP_BASE}/api/bidding/${path}`;
  const headers = new Headers();
  const auth = req.headers.get("authorization");
  if (auth) headers.set("authorization", auth);

  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const init: RequestInit = { method: req.method, headers };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  try {
    const res = await fetch(url, init);
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "无法连接到投标服务，请确认服务是否启动" },
      { status: 502 },
    );
  }
}

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.toString();
  const path = search ? `projects?${search}` : "projects";
  return proxy(req, path);
}

export async function POST(req: NextRequest) {
  // Forward POST to the appropriate endpoint based on body action field
  // We peek at URL params or body to determine the sub-endpoint
  const action = req.nextUrl.searchParams.get("action");
  if (action) {
    return proxy(req, action);
  }
  // Default: try to parse JSON body for action
  try {
    const body = await req.text();
    const parsed = JSON.parse(body);
    const endpoint = parsed.action || "projects";
    const newReq = new NextRequest(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(parsed),
    });
    return proxy(newReq, endpoint);
  } catch {
    return proxy(req, "projects");
  }
}
