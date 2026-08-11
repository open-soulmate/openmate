"use client";

import { useState } from "react";
import {
  Plug,
  PlugZap,
  Search,
  Wrench,
  Check,
  X,
  RefreshCw,
} from "lucide-react";

interface McpTool {
  name: string;
  description: string;
}

interface McpServer {
  id: string;
  name: string;
  description: string;
  url: string;
  connected: boolean;
  tools: McpTool[];
}

const mockServers: McpServer[] = [
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Read, write, and manage files on the local filesystem.",
    url: "stdio://mcp-filesystem",
    connected: true,
    tools: [
      { name: "read_file", description: "Read contents of a file" },
      { name: "write_file", description: "Write contents to a file" },
      { name: "list_directory", description: "List files in a directory" },
      { name: "search_files", description: "Search for files by pattern" },
    ],
  },
  {
    id: "github",
    name: "GitHub",
    description: "Interact with GitHub repositories, issues, and pull requests.",
    url: "stdio://mcp-github",
    connected: false,
    tools: [
      { name: "search_repos", description: "Search GitHub repositories" },
      { name: "list_issues", description: "List issues in a repository" },
      { name: "create_pr", description: "Create a pull request" },
    ],
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Web and local search using the Brave Search API.",
    url: "stdio://mcp-brave-search",
    connected: true,
    tools: [
      { name: "web_search", description: "Search the web" },
      { name: "local_search", description: "Search for local businesses" },
    ],
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Query and manage PostgreSQL databases.",
    url: "stdio://mcp-postgres",
    connected: false,
    tools: [
      { name: "query", description: "Execute a SQL query" },
      { name: "list_tables", description: "List all tables in the database" },
      { name: "describe_table", description: "Show table schema" },
    ],
  },
];

export function McpClient() {
  const [query, setQuery] = useState("");
  const [servers, setServers] = useState(mockServers);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = servers.filter(
    (s) =>
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.description.toLowerCase().includes(query.toLowerCase()),
  );

  function toggleConnection(id: string) {
    setServers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, connected: !s.connected } : s)),
    );
  }

  const connectedCount = servers.filter((s) => s.connected).length;
  const totalTools = servers
    .filter((s) => s.connected)
    .reduce((sum, s) => sum + s.tools.length, 0);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-1.5 text-sm">
          <Search size={14} className="text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search MCP servers..."
            className="w-48 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            {connectedCount} / {servers.length} connected
          </span>
          <span className="text-border">|</span>
          <span>{totalTools} tools available</span>
        </div>
      </div>

      {/* Server list */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-3">
          {filtered.map((server) => (
            <div
              key={server.id}
              className="rounded-lg border border-border bg-card transition-colors hover:border-primary/40"
            >
              {/* Server row */}
              <div className="flex items-center gap-4 p-4">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    server.connected
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {server.connected ? <PlugZap size={20} /> : <Plug size={20} />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <h3 className="text-sm font-medium">{server.name}</h3>
                    {server.connected && (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                        Connected
                      </span>
                    )}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {server.tools.length} tools
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {server.description}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground/60">
                    {server.url}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setExpandedId(expandedId === server.id ? null : server.id)
                    }
                    className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Wrench size={12} />
                    Tools
                  </button>
                  <button
                    onClick={() => toggleConnection(server.id)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
                      server.connected
                        ? "border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    }`}
                  >
                    {server.connected ? (
                      <>
                        <X size={12} /> Disconnect
                      </>
                    ) : (
                      <>
                        <PlugZap size={12} /> Connect
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded tools list */}
              {expandedId === server.id && (
                <div className="border-t border-border px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Available Tools
                    </span>
                    <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                      <RefreshCw size={10} />
                      Refresh
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {server.tools.map((tool) => (
                      <div
                        key={tool.name}
                        className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/50 px-3 py-2"
                      >
                        <Check
                          size={12}
                          className={`mt-0.5 shrink-0 ${
                            server.connected
                              ? "text-emerald-400"
                              : "text-muted-foreground/40"
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-medium">
                            {tool.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {tool.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Plug size={32} className="mb-3 opacity-40" />
              <p className="text-sm">No MCP servers found</p>
              <p className="text-xs">Try a different search term</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
