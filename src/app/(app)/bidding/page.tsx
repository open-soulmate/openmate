"use client";
/**
 * 招标页面入口 — 重定向到插件页面
 * 插件实际位于 plugins/bidding/frontend/page.tsx
 * 此页面仅作为兼容旧路由的重定向
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BiddingPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/plugins/bidding");
  }, [router]);
  return null;
}
