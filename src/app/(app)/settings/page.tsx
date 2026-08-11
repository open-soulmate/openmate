"use client";

import { useState } from "react";
import { User, Globe, Key, Bell, Monitor, Save } from "lucide-react";

const sections = [
  { id: "profile", label: "Profile", icon: User },
  { id: "api", label: "API Keys", icon: Key },
  { id: "appearance", label: "Appearance", icon: Monitor },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "language", label: "Language", icon: Globe },
];

export default function SettingsPage() {
  const [active, setActive] = useState("profile");

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-56 shrink-0 border-r border-border p-4">
        <nav className="space-y-1">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                active === s.id
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <s.icon size={16} />
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {active === "profile" && (
          <div className="max-w-lg space-y-6">
            <h2 className="text-lg font-semibold">Profile</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">
                  Display Name
                </label>
                <input
                  defaultValue="User"
                  className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">
                  Email
                </label>
                <input
                  defaultValue="user@example.com"
                  className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <button className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <Save size={14} />
                Save Changes
              </button>
            </div>
          </div>
        )}

        {active === "api" && (
          <div className="max-w-lg space-y-6">
            <h2 className="text-lg font-semibold">API Keys</h2>
            <p className="text-sm text-muted-foreground">
              Manage API keys for connecting to the Soul backend and third-party
              services.
            </p>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">
                  Soul API URL
                </label>
                <input
                  defaultValue="http://localhost:8000"
                  className="w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">
                  API Key
                </label>
                <input
                  type="password"
                  defaultValue="sk-••••••••"
                  className="w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <button className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <Save size={14} />
                Save
              </button>
            </div>
          </div>
        )}

        {active === "appearance" && (
          <div className="max-w-lg space-y-6">
            <h2 className="text-lg font-semibold">Appearance</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">
                  Theme
                </label>
                <div className="flex gap-3">
                  {["Dark", "Light", "System"].map((t) => (
                    <button
                      key={t}
                      className={`rounded-md border px-4 py-2 text-sm ${
                        t === "Dark"
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-muted text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-muted-foreground">
                  Font Size
                </label>
                <select className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary">
                  <option>Small</option>
                  <option>Medium</option>
                  <option>Large</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {active === "notifications" && (
          <div className="max-w-lg space-y-6">
            <h2 className="text-lg font-semibold">Notifications</h2>
            <div className="space-y-3">
              {[
                "Skill updates",
                "Knowledge base changes",
                "AI responses",
                "System alerts",
              ].map((item) => (
                <label
                  key={item}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3"
                >
                  <span className="text-sm">{item}</span>
                  <input
                    type="checkbox"
                    defaultChecked
                    className="h-4 w-4 rounded accent-primary"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {active === "language" && (
          <div className="max-w-lg space-y-6">
            <h2 className="text-lg font-semibold">Language</h2>
            <select className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary">
              <option>English</option>
              <option>简体中文</option>
              <option>日本語</option>
              <option>Español</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
