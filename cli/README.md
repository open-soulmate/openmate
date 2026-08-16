# open-soulmate

CLI for the Open-Soulmate ecosystem — one command to start all services.

## Quick Start

```bash
# Start all services (OpenSoul + OpenMate)
npx open-soulmate start

# Start only the backend
npx open-soulmate start soul

# Start only the frontend
npx open-soulmate start mate

# Check status
npx open-soulmate status

# Stop all services
npx open-soulmate stop

# Check organ health
npx open-soulmate health
```

## Commands

| Command | Description |
|---------|-------------|
| `start [all\|soul\|mate\|soma]` | Start services (default: all) |
| `status` | Show service status |
| `stop` | Stop all services |
| `health` | Check organ health (JSON) |
| `help` | Show help |

## Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--soul-port PORT` | 8090 | OpenSoul backend port |
| `--mate-port PORT` | 3002 | OpenMate frontend port |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SOUL_DIR` | `~/opensoul` | OpenSoul project directory |
| `MATE_DIR` | `~/openmate` | OpenMate project directory |
| `SOMA_DIR` | `~/opensoma` | OpenSoma project directory |
| `SOUL_PORT` | 8090 | OpenSoul port |
| `MATE_PORT` | 3002 | OpenMate port |

## Requirements

- Node.js >= 18
- Python 3.11+ (for OpenSoul)
- npm (for OpenMate)

## Architecture

```
┌─────────────────────────────────────────┐
│  open-soulmate CLI                      │
├─────────────────────────────────────────┤
│  OpenSoul (FastAPI)     :8090           │
│  OpenMate (Next.js)     :3002           │
│  OpenSoma (Rust)        [optional]      │
└─────────────────────────────────────────┘
```

## License

MIT
