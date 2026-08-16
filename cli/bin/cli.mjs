#!/usr/bin/env node
/**
 * open-soulmate CLI
 *
 * Usage:
 *   npx open-soulmate start [all|soul|mate|soma] [--soul-port PORT] [--mate-port PORT]
 *   npx open-soulmate status
 *   npx open-soulmate stop
 *   npx open-soulmate health
 */

import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

// ── Colors ──────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

const log = (msg) => console.log(`${C.cyan}[OpenSoul]${C.reset} ${msg}`);
const logm = (msg) => console.log(`${C.green}[OpenMate]${C.reset} ${msg}`);
const logs = (msg) => console.log(`${C.yellow}[OpenSoma]${C.reset} ${msg}`);
const err = (msg) => console.error(`${C.red}[ERROR]${C.reset} ${msg}`);

// ── Config ──────────────────────────────────────────────────
const HOME = homedir();
const SOUL_DIR = process.env.SOUL_DIR || join(HOME, "opensoul");
const MATE_DIR = process.env.MATE_DIR || join(HOME, "openmate");
const SOMA_DIR = process.env.SOMA_DIR || join(HOME, "opensoma");
const SOUL_PORT = parseInt(process.env.SOUL_PORT || "8090", 10);
const MATE_PORT = parseInt(process.env.MATE_PORT || "3002", 10);

// ── Helpers ─────────────────────────────────────────────────

function killPort(port) {
  try {
    const pids = execSync(`lsof -ti :${port} 2>/dev/null || true`, {
      encoding: "utf8",
    }).trim();
    if (pids) {
      log(`Killing processes on port ${port}: ${pids}`);
      for (const pid of pids.split("\n")) {
        try {
          process.kill(parseInt(pid, 10), "SIGKILL");
        } catch {}
      }
    }
  } catch {}
}

async function waitForPort(port, name, maxWaitSec = 30) {
  const start = Date.now();
  while (Date.now() - start < maxWaitSec * 1000) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) {
        console.log(`${C.green}✓${C.reset} ${name} is ready on port ${port}`);
        return true;
      }
    } catch {}
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) {
        console.log(`${C.green}✓${C.reset} ${name} is ready on port ${port}`);
        return true;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  err(`${name} failed to start on port ${port} after ${maxWaitSec}s`);
  return false;
}

function spawnBg(cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    ...opts,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });
  child.stdout.on("data", (d) => process.stdout.write(d));
  child.stderr.on("data", (d) => process.stderr.write(d));
  return child;
}

// ── Commands ────────────────────────────────────────────────

async function startSoul() {
  log(`Starting OpenSoul on port ${SOUL_PORT}...`);
  killPort(SOUL_PORT);

  if (!existsSync(SOUL_DIR)) {
    err(`OpenSoul not found at ${SOUL_DIR}`);
    return null;
  }

  const venvPython = join(SOUL_DIR, ".venv", "bin", "python");
  if (!existsSync(venvPython)) {
    log("Creating virtual environment...");
    execSync("python3 -m venv .venv", { cwd: SOUL_DIR, stdio: "inherit" });
    execSync(".venv/bin/pip install -q -e '.[dev]'", {
      cwd: SOUL_DIR,
      stdio: "inherit",
    });
  }

  const child = spawnBg(
    venvPython,
    ["-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", String(SOUL_PORT)],
    { cwd: SOUL_DIR }
  );

  await waitForPort(SOUL_PORT, "OpenSoul");
  return child;
}

async function startMate(soulPort) {
  logm(`Starting OpenMate on port ${MATE_PORT}...`);
  killPort(MATE_PORT);

  if (!existsSync(MATE_DIR)) {
    err(`OpenMate not found at ${MATE_DIR}`);
    return null;
  }

  if (!existsSync(join(MATE_DIR, "node_modules"))) {
    logm("Installing dependencies...");
    execSync("npm install --silent", { cwd: MATE_DIR, stdio: "inherit" });
  }

  const child = spawnBg("npx", ["next", "dev", "--port", String(MATE_PORT), "--hostname", "0.0.0.0"], {
    cwd: MATE_DIR,
    env: { ...process.env, NEXT_PUBLIC_API_URL: `http://127.0.0.1:${soulPort || SOUL_PORT}` },
  });

  await waitForPort(MATE_PORT, "OpenMate");
  return child;
}

async function startSoma() {
  logs("Starting OpenSoma...");
  if (!existsSync(join(SOMA_DIR, "Cargo.toml"))) {
    err(`OpenSoma not found at ${SOMA_DIR}`);
    return null;
  }

  const child = spawnBg("cargo", ["run", "--release"], { cwd: SOMA_DIR });
  return child;
}

async function cmdStart(component = "all") {
  const children = [];

  if (component === "all" || component === "soul") {
    const soul = await startSoul();
    if (soul) children.push(soul);
  }

  if (component === "all" || component === "mate") {
    const mate = await startMate(SOUL_PORT);
    if (mate) children.push(mate);
  }

  if (component === "all" || component === "soma") {
    const soma = await startSoma();
    if (soma) children.push(soma);
  }

  if (children.length > 0) {
    console.log("");
    console.log(`${C.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
    console.log(`${C.blue}  Open-Soulmate Ecosystem — Running${C.reset}`);
    console.log(`${C.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
    console.log(`  ${C.green}●${C.reset} OpenSoul   http://0.0.0.0:${SOUL_PORT}`);
    if (component === "all" || component === "mate") {
      console.log(`  ${C.green}●${C.reset} OpenMate   http://0.0.0.0:${MATE_PORT}`);
    }
    console.log(`${C.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
    console.log("");
    console.log(`${C.dim}Press Ctrl+C to stop all services${C.reset}`);

    // Handle graceful shutdown
    const shutdown = () => {
      console.log("\nStopping services...");
      for (const child of children) {
        child.kill("SIGTERM");
      }
      setTimeout(() => process.exit(0), 2000);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Keep alive
    await new Promise(() => {});
  }
}

async function cmdStatus() {
  console.log("");
  console.log(`${C.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  console.log(`${C.blue}  Open-Soulmate Ecosystem Status${C.reset}`);
  console.log(`${C.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);

  // Check OpenSoul
  try {
    const res = await fetch(`http://127.0.0.1:${SOUL_PORT}/api/health/all`);
    if (res.ok) {
      const data = await res.json();
      console.log(
        `  ${C.green}●${C.reset} OpenSoul   http://0.0.0.0:${SOUL_PORT}  (${data.healthy}/${data.total} organs)`
      );
    } else {
      console.log(`  ${C.red}●${C.reset} OpenSoul   port ${SOUL_PORT}  (error: ${res.status})`);
    }
  } catch {
    console.log(`  ${C.red}●${C.reset} OpenSoul   port ${SOUL_PORT}  (not running)`);
  }

  // Check OpenMate
  try {
    const res = await fetch(`http://127.0.0.1:${MATE_PORT}/`);
    if (res.ok) {
      console.log(`  ${C.green}●${C.reset} OpenMate   http://0.0.0.0:${MATE_PORT}`);
    } else {
      console.log(`  ${C.red}●${C.reset} OpenMate   port ${MATE_PORT}  (error: ${res.status})`);
    }
  } catch {
    console.log(`  ${C.red}●${C.reset} OpenMate   port ${MATE_PORT}  (not running)`);
  }

  console.log(`${C.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  console.log("");
}

async function cmdStop() {
  log("Stopping all services...");
  killPort(SOUL_PORT);
  killPort(MATE_PORT);
  log("All services stopped.");
}

async function cmdHealth() {
  try {
    const res = await fetch(`http://127.0.0.1:${SOUL_PORT}/api/health/all`);
    if (!res.ok) {
      err(`OpenSoul returned ${res.status}`);
      process.exit(1);
    }
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch {
    err("OpenSoul is not running");
    process.exit(1);
  }
}

// ── Main ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0] || "start";
const component = args[1] || "all";

// Parse flags
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--soul-port" && args[i + 1]) process.env.SOUL_PORT = args[++i];
  if (args[i] === "--mate-port" && args[i + 1]) process.env.MATE_PORT = args[++i];
}

switch (command) {
  case "start":
    await cmdStart(component);
    break;
  case "status":
    await cmdStatus();
    break;
  case "stop":
    await cmdStop();
    break;
  case "health":
    await cmdHealth();
    break;
  case "help":
  case "--help":
  case "-h":
    console.log(`
${C.bold}open-soulmate${C.reset} — One Soul, Infinite Soma.

${C.cyan}Usage:${C.reset}
  open-soulmate start [all|soul|mate|soma]  Start services (default: all)
  open-soulmate status                      Show service status
  open-soulmate stop                        Stop all services
  open-soulmate health                      Check organ health

${C.cyan}Flags:${C.reset}
  --soul-port PORT   OpenSoul port (default: 8090)
  --mate-port PORT   OpenMate port (default: 3002)

${C.cyan}Examples:${C.reset}
  npx open-soulmate start                    # Start all services
  npx open-soulmate start soul               # Start only OpenSoul
  npx open-soulmate start --soul-port 9000   # Custom port
  npx open-soulmate status                   # Check status
`);
    break;
  default:
    err(`Unknown command: ${command}`);
    console.log("Run 'open-soulmate help' for usage");
    process.exit(1);
}
