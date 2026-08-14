"use client";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Dna, RefreshCw, Play, Plus, Trash2, Copy,
  FileText, Bot, Workflow, Puzzle, Search,
} from "lucide-react";

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  builtin: boolean;
  config: any;
  created_at: number;
}

export function GeneClient() {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<Template | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCat, setNewCat] = useState("agent");
  const [newConfig, setNewConfig] = useState("{}");
  const apiBase = getApiBaseUrl();

  const fetchTemplates = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      const res = await fetch(`${apiBase}/api/gene/templates?${params}`);
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch {}
  }, [apiBase, category]);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/gene/health`);
      setHealth(await res.json());
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    fetchTemplates();
    fetchHealth();
  }, [fetchTemplates, fetchHealth]);

  const handleCreate = async () => {
    try {
      const res = await fetch(`${apiBase}/api/gene/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          description: newDesc,
          category: newCat,
          config: JSON.parse(newConfig),
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        setNewName(""); setNewDesc(""); setNewConfig("{}");
        fetchTemplates();
        fetchHealth();
      }
    } catch {}
  };

  const handleInstantiate = async (templateId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/gene/templates/${templateId}/instantiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selected?.name + " 实例" }),
      });
      if (res.ok) alert("实例化成功");
    } catch {}
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm("确定删除此模板？")) return;
    try {
      await fetch(`${apiBase}/api/gene/templates/${templateId}`, { method: "DELETE" });
      fetchTemplates();
      fetchHealth();
    } catch {}
  };

  const catIcons: Record<string, React.ElementType> = {
    agent: Bot,
    knowledge_base: FileText,
    workflow: Workflow,
    skill: Puzzle,
  };

  const catColors: Record<string, string> = {
    agent: "text-blue-500 bg-blue-500/10",
    knowledge_base: "text-emerald-500 bg-emerald-500/10",
    workflow: "text-violet-500 bg-violet-500/10",
    skill: "text-amber-500 bg-amber-500/10",
  };

  const filtered = templates.filter((t) =>
    !filter || t.name.toLowerCase().includes(filter.toLowerCase()) || t.description.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Dna size={20} className="text-emerald-500" />
          <h1 className="text-lg font-semibold">{t("gene.title") || "基因 · 模板库"}</h1>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
            模板库
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm text-white hover:bg-emerald-600">
            <Plus size={14} /> 新建模板
          </button>
          <button onClick={() => { fetchTemplates(); fetchHealth(); }}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats */}
        {health && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">总模板</span>
              <p className="text-2xl font-bold">{health.total_templates || 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">内置</span>
              <p className="text-2xl font-bold">{health.builtin_count || 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">用户自定义</span>
              <p className="text-2xl font-bold">{health.user_count || 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">分类</span>
              <p className="text-sm font-mono mt-1">{Object.entries(health.by_category || {}).map(([k, v]) => `${k}:${v}`).join(" · ")}</p>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="搜索模板..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none">
            <option value="">全部分类</option>
            <option value="agent">Agent</option>
            <option value="knowledge_base">知识库</option>
            <option value="workflow">工作流</option>
            <option value="skill">Skill</option>
          </select>
        </div>

        {/* Template Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => {
            const Icon = catIcons[t.category] || FileText;
            const colorCls = catColors[t.category] || "text-gray-500 bg-gray-500/10";
            return (
              <div key={t.id}
                onClick={() => setSelected(t)}
                className={cn(
                  "rounded-xl border border-border bg-card p-4 cursor-pointer transition-all hover:shadow-md",
                  selected?.id === t.id && "ring-2 ring-emerald-500"
                )}>
                <div className="flex items-start justify-between mb-2">
                  <div className={cn("rounded-lg p-2", colorCls)}>
                    <Icon size={16} />
                  </div>
                  {t.builtin && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">内置</span>
                  )}
                </div>
                <h3 className="font-medium text-sm mb-1">{t.name}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                <div className="mt-3 flex items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px]", colorCls)}>{t.category}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail Panel */}
        {selected && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{selected.name}</h3>
              <div className="flex gap-2">
                <button onClick={() => handleInstantiate(selected.id)}
                  className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs text-white hover:bg-emerald-600">
                  <Play size={12} /> 实例化
                </button>
                {!selected.builtin && (
                  <button onClick={() => handleDelete(selected.id)}
                    className="flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10">
                    <Trash2 size={12} /> 删除
                  </button>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{selected.description}</p>
            <pre className="rounded-lg bg-muted p-4 text-xs overflow-x-auto max-h-60">
              {JSON.stringify(selected.config, null, 2)}
            </pre>
          </div>
        )}

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 space-y-4">
              <h3 className="font-semibold">新建模板</h3>
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="模板名称" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                placeholder="描述" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <select value={newCat} onChange={(e) => setNewCat(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="agent">Agent</option>
                <option value="knowledge_base">知识库</option>
                <option value="workflow">工作流</option>
                <option value="skill">Skill</option>
              </select>
              <textarea value={newConfig} onChange={(e) => setNewConfig(e.target.value)}
                placeholder="配置 JSON" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono min-h-[120px]" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">取消</button>
                <button onClick={handleCreate}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm text-white hover:bg-emerald-600">创建</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
