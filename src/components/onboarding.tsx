"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Rocket,
  Globe,
  Palette,
  Bot,
  Database,
  CheckCircle2,
  Sparkles,
  MessageSquare,
  BookOpen,
  Network,
  Puzzle,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Check,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type ThemeId, applyTheme } from "@/lib/theme";
import { useAppStore } from "@/stores/app-store";

// ─── Step Indicator ──────────────────────────────────────────────────────────

function StepIndicator({
  current,
  total,
  t,
}: {
  current: number;
  total: number;
  t: (key: string) => string;
}) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={cn(
              "h-2 rounded-full transition-all duration-300",
              i === current
                ? "w-8 bg-primary"
                : i < current
                  ? "w-2 bg-primary/60"
                  : "w-2 bg-muted-foreground/30",
            )}
          />
        </div>
      ))}
      <span className="ml-3 text-xs text-muted-foreground">
        {t("onboarding.step")} {current + 1} {t("onboarding.of")} {total}
      </span>
    </div>
  );
}

// ─── Step 1: Welcome ─────────────────────────────────────────────────────────

function WelcomeStep({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center text-center max-w-lg mx-auto">
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
          <Zap className="w-12 h-12 text-primary" />
        </div>
        <div className="absolute -top-2 -right-2">
          <Sparkles className="w-6 h-6 text-primary animate-pulse" />
        </div>
      </div>
      <h1 className="text-3xl font-bold mb-3">{t("onboarding.welcome")}</h1>
      <p className="text-muted-foreground text-base mb-10 leading-relaxed">
        {t("onboarding.welcomeDesc")}
      </p>
      <button
        onClick={onNext}
        className="flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
      >
        {t("onboarding.getStarted")}
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Step 2: Language Selection ───────────────────────────────────────────────

const languages = [
  { code: "zh", label: "中文", flag: "🇨🇳" },
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "ja", label: "日本語", flag: "🇯🇵" },
] as const;

function LanguageStep({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (lang: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center text-center max-w-lg mx-auto">
      <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
        <Globe className="w-8 h-8 text-primary" />
      </div>
      <h2 className="text-2xl font-bold mb-2">{t("onboarding.selectLanguage")}</h2>
      <p className="text-muted-foreground mb-8">{t("onboarding.selectLanguageDesc")}</p>
      <div className="w-full grid gap-3">
        {languages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => onSelect(lang.code)}
            className={cn(
              "flex items-center gap-4 px-5 py-4 rounded-xl border transition-all text-left",
              selected === lang.code
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-card hover:border-primary/40 text-foreground",
            )}
          >
            <span className="text-2xl">{lang.flag}</span>
            <span className="flex-1 font-medium">{lang.label}</span>
            {selected === lang.code && (
              <Check className="w-5 h-5 text-primary" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Step 3: Theme Selection ─────────────────────────────────────────────────

const themeOptions: { id: ThemeId; labelKey: string; preview: string; ring: string }[] = [
  {
    id: "dark",
    labelKey: "onboarding.dark",
    preview: "bg-[#0a0a0f]",
    ring: "ring-[#6366f1]",
  },
  {
    id: "light",
    labelKey: "onboarding.light",
    preview: "bg-[#ffffff]",
    ring: "ring-[#6366f1]",
  },
  {
    id: "purple",
    labelKey: "onboarding.purple",
    preview: "bg-[#0c0514]",
    ring: "ring-[#a855f7]",
  },
];

function ThemeStep({
  selected,
  onSelect,
}: {
  selected: ThemeId;
  onSelect: (theme: ThemeId) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center text-center max-w-lg mx-auto">
      <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
        <Palette className="w-8 h-8 text-primary" />
      </div>
      <h2 className="text-2xl font-bold mb-2">{t("onboarding.selectTheme")}</h2>
      <p className="text-muted-foreground mb-8">{t("onboarding.selectThemeDesc")}</p>
      <div className="w-full grid grid-cols-3 gap-4">
        {themeOptions.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            className={cn(
              "flex flex-col items-center gap-3 p-4 rounded-xl border transition-all",
              selected === opt.id
                ? "border-primary bg-primary/5 ring-2 ring-primary/40"
                : "border-border bg-card hover:border-primary/40",
            )}
          >
            <div
              className={cn(
                "w-full h-20 rounded-lg border border-border/50 relative overflow-hidden",
                opt.preview,
              )}
            >
              <div className="absolute top-2 left-2 w-3 h-3 rounded-full bg-primary/60" />
              <div className="absolute top-2 left-7 w-8 h-1.5 rounded bg-foreground/10" />
              <div className="absolute bottom-2 left-2 right-2 h-1 rounded bg-foreground/10" />
              <div className="absolute bottom-4 left-2 right-6 h-1 rounded bg-foreground/10" />
              {selected === opt.id && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Check className="w-5 h-5 text-primary" />
                </div>
              )}
            </div>
            <span className="text-sm font-medium">
              {t(`settings.${opt.id}`)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Step 4: Agent Config ────────────────────────────────────────────────────

const agentOptions = [
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", icon: "🤖" },
  { id: "claude-sonnet", name: "Claude Sonnet", provider: "Anthropic", icon: "🧠" },
  { id: "local", name: "Local Model", provider: "Ollama", icon: "💻" },
];

function AgentConfigStep({
  selectedAgent,
  apiKey,
  onSelectAgent,
  onApiKeyChange,
  onSkip,
}: {
  selectedAgent: string;
  apiKey: string;
  onSelectAgent: (id: string) => void;
  onApiKeyChange: (key: string) => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center text-center max-w-lg mx-auto">
      <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
        <Bot className="w-8 h-8 text-primary" />
      </div>
      <h2 className="text-2xl font-bold mb-2">{t("onboarding.agentConfig")}</h2>
      <p className="text-muted-foreground mb-8">{t("onboarding.agentConfigDesc")}</p>

      <div className="w-full space-y-6">
        <div>
          <label className="block text-sm font-medium text-left mb-3">
            {t("onboarding.selectDefaultAgent")}
          </label>
          <div className="grid gap-2">
            {agentOptions.map((agent) => (
              <button
                key={agent.id}
                onClick={() => onSelectAgent(agent.id)}
                className={cn(
                  "flex items-center gap-4 px-4 py-3 rounded-xl border transition-all text-left",
                  selectedAgent === agent.id
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <span className="text-xl">{agent.icon}</span>
                <div className="flex-1">
                  <div className="font-medium text-sm">{agent.name}</div>
                  <div className="text-xs text-muted-foreground">{agent.provider}</div>
                </div>
                {selectedAgent === agent.id && (
                  <Check className="w-4 h-4 text-primary" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-left mb-2">
            {t("onboarding.apiKeyOptional")}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={t("onboarding.apiKeyPlaceholder")}
            className="w-full px-4 py-3 rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
          />
        </div>

        <button
          onClick={onSkip}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("onboarding.skipForNow")}
        </button>
      </div>
    </div>
  );
}

// ─── Step 5: Knowledge Config ────────────────────────────────────────────────

function KnowledgeConfigStep({
  apiUrl,
  onApiUrlChange,
  connectionStatus,
  onTestConnection,
}: {
  apiUrl: string;
  onApiUrlChange: (url: string) => void;
  connectionStatus: "idle" | "testing" | "success" | "error";
  onTestConnection: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center text-center max-w-lg mx-auto">
      <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
        <Database className="w-8 h-8 text-primary" />
      </div>
      <h2 className="text-2xl font-bold mb-2">{t("onboarding.knowledgeConfig")}</h2>
      <p className="text-muted-foreground mb-8">{t("onboarding.knowledgeConfigDesc")}</p>

      <div className="w-full space-y-6">
        <div>
          <label className="block text-sm font-medium text-left mb-2">
            {t("onboarding.soulApiUrl")}
          </label>
          <input
            type="text"
            value={apiUrl}
            onChange={(e) => onApiUrlChange(e.target.value)}
            placeholder={t("onboarding.soulApiUrlPlaceholder")}
            className="w-full px-4 py-3 rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
          />
        </div>

        <button
          onClick={onTestConnection}
          disabled={connectionStatus === "testing" || !apiUrl.trim()}
          className={cn(
            "flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg font-medium transition-all",
            connectionStatus === "testing"
              ? "bg-muted text-muted-foreground cursor-wait"
              : "bg-secondary text-foreground hover:bg-secondary/80",
          )}
        >
          {connectionStatus === "testing" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("onboarding.testing")}
            </>
          ) : connectionStatus === "success" ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {t("onboarding.connectionSuccess")}
            </>
          ) : connectionStatus === "error" ? (
            <>
              <span className="w-4 h-4 text-destructive">✕</span>
              {t("onboarding.connectionFailed")}
            </>
          ) : (
            t("onboarding.testConnection")
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Step 6: Complete ────────────────────────────────────────────────────────

function CompleteStep({ onEnter }: { onEnter: () => void }) {
  const { t } = useTranslation();

  const features = [
    {
      icon: MessageSquare,
      title: t("onboarding.featureChat"),
      desc: t("onboarding.featureChatDesc"),
    },
    {
      icon: BookOpen,
      title: t("onboarding.featureKnowledge"),
      desc: t("onboarding.featureKnowledgeDesc"),
    },
    {
      icon: Network,
      title: t("onboarding.featureGraph"),
      desc: t("onboarding.featureGraphDesc"),
    },
    {
      icon: Puzzle,
      title: t("onboarding.featureSkills"),
      desc: t("onboarding.featureSkillsDesc"),
    },
  ];

  return (
    <div className="flex flex-col items-center text-center max-w-lg mx-auto">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        </div>
        <div className="absolute -top-1 -right-1">
          <Sparkles className="w-5 h-5 text-primary animate-pulse" />
        </div>
      </div>
      <h2 className="text-2xl font-bold mb-2">{t("onboarding.allDone")}</h2>
      <p className="text-muted-foreground mb-8">{t("onboarding.allDoneDesc")}</p>

      <div className="w-full grid grid-cols-2 gap-3 mb-8">
        {features.map((feat) => (
          <div
            key={feat.title}
            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card border border-border"
          >
            <feat.icon className="w-6 h-6 text-primary" />
            <span className="text-sm font-medium">{feat.title}</span>
            <span className="text-xs text-muted-foreground text-center leading-relaxed">
              {feat.desc}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={onEnter}
        className="flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
      >
        {t("onboarding.enterOpenMate")}
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Main Onboarding Component ───────────────────────────────────────────────

export function Onboarding() {
  const { t, i18n } = useTranslation();
  const { completeOnboarding, setTheme, llmConfig, setLLMConfig } = useAppStore();

  const [step, setStep] = useState(0);
  const [language, setLanguage] = useState(i18n.language || "zh");
  const [themeId, setThemeId] = useState<ThemeId>("dark");
  const [selectedAgent, setSelectedAgent] = useState("gpt-4o");
  const [apiKey, setApiKey] = useState("");
  const [soulApiUrl, setSoulApiUrl] = useState("http://localhost:8090");
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle");

  const TOTAL_STEPS = 6;

  const handleLanguageSelect = (lang: string) => {
    setLanguage(lang);
    i18n.changeLanguage(lang);
    localStorage.setItem("openmate-language", lang);
  };

  const handleThemeSelect = (theme: ThemeId) => {
    setThemeId(theme);
    setTheme(theme);
    applyTheme(theme);
  };

  const handleTestConnection = async () => {
    setConnectionStatus("testing");
    try {
      const url = soulApiUrl.replace(/\/+$/, "");
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        setConnectionStatus("success");
      } else {
        setConnectionStatus("error");
      }
    } catch {
      setConnectionStatus("error");
    }
  };

  const handleEnter = () => {
    if (apiKey) {
      setLLMConfig({ apiKey });
    }
    // Save the API URL so the rest of the app uses it
    if (soulApiUrl) {
      localStorage.setItem("openmate-api-url", soulApiUrl.replace(/\/+$/, ""));
    }
    completeOnboarding();
  };

  const canGoNext = () => {
    return true;
  };

  const goNext = () => {
    if (step < TOTAL_STEPS - 1 && canGoNext()) {
      setStep(step + 1);
    }
  };

  const goBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return <WelcomeStep onNext={goNext} />;
      case 1:
        return <LanguageStep selected={language} onSelect={handleLanguageSelect} />;
      case 2:
        return <ThemeStep selected={themeId} onSelect={handleThemeSelect} />;
      case 3:
        return (
          <AgentConfigStep
            selectedAgent={selectedAgent}
            apiKey={apiKey}
            onSelectAgent={setSelectedAgent}
            onApiKeyChange={setApiKey}
            onSkip={goNext}
          />
        );
      case 4:
        return (
          <KnowledgeConfigStep
            apiUrl={soulApiUrl}
            onApiUrlChange={setSoulApiUrl}
            connectionStatus={connectionStatus}
            onTestConnection={handleTestConnection}
          />
        );
      case 5:
        return <CompleteStep onEnter={handleEnter} />;
      default:
        return null;
    }
  };

  const showNav = step > 0 && step < TOTAL_STEPS - 1;
  const showNext = step > 0 && step < TOTAL_STEPS - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="w-full max-w-xl px-6 py-12">
        {step > 0 && (
          <StepIndicator current={step} total={TOTAL_STEPS} t={t} />
        )}
        {renderStep()}
        {showNav && (
          <div className="flex items-center justify-between mt-10 max-w-lg mx-auto">
            <button
              onClick={goBack}
              className="flex items-center gap-1 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              {t("onboarding.back")}
            </button>
            {showNext && (
              <button
                onClick={goNext}
                className="flex items-center gap-1 px-6 py-2 text-sm bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                {t("onboarding.next")}
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
