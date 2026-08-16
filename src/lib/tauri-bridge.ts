import { invoke } from "@tauri-apps/api/core";
import { getApiBaseUrl } from "@/lib/api-client";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function executeCommand(cmd: string): Promise<string> {
  if (isTauri()) {
    return invoke<string>("execute_command", { cmd });
  }
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmd }),
  });
  if (!res.ok) throw new Error(`Execute failed: ${res.statusText}`);
  const data = await res.json();
  return data.output;
}

export async function readFile(path: string): Promise<string> {
  if (isTauri()) {
    return invoke<string>("read_local_file", { path });
  }
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/file?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`Read failed: ${res.statusText}`);
  const data = await res.json();
  return data.content;
}

export async function writeFile(path: string, content: string): Promise<void> {
  if (isTauri()) {
    await invoke("write_local_file", { path, content });
    return;
  }
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) throw new Error(`Write failed: ${res.statusText}`);
}

export async function listDir(path: string): Promise<string[]> {
  if (isTauri()) {
    return invoke<string[]>("list_directory", { path });
  }
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/dir?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`List failed: ${res.statusText}`);
  const data = await res.json();
  // Backend returns { path, entries: [{name, path, type, ...}] }
  // Extract just the names for backward compatibility
  if (Array.isArray(data.entries)) {
    return data.entries.map((e: { name: string } | string) =>
      typeof e === "string" ? e : e.name
    );
  }
  return data.entries || [];
}

export async function getSystemInfo(): Promise<{
  os: string;
  arch: string;
  home_dir: string;
}> {
  if (isTauri()) {
    return invoke("get_system_info");
  }
  return { os: "web", arch: "unknown", home_dir: "~" };
}
