"use client";
import dynamic from "next/dynamic";

const Onboarding = dynamic(() => import("@/components/onboarding").then((m) => m.Onboarding), { ssr: false });

export default function OnboardingPage() {
  return <Onboarding />;
}
