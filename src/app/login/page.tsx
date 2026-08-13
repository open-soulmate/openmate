"use client";

import { useRouter } from "next/navigation";
import { LoginPage } from "@/components/login-page";

export default function Login() {
  const router = useRouter();
  return <LoginPage onLogin={() => router.push("/chat")} />;
}
