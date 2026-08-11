# OpenMate

**Your Knowledge Companion.**

An open AI companion platform with pluggable skill extensions, built for knowledge workers who want their tools to think alongside them.

## Features

- **AI Chat** — Context-aware conversations powered by your personal knowledge base
- **Knowledge Base** — Organize, tag, and retrieve documents with semantic search
- **Knowledge Graph** — Visualize connections between concepts, entities, and documents
- **Skills Marketplace** — Install and manage plugin-style skills to extend capabilities
- **Unified Search** — Cross-module search across all your knowledge

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: shadcn/ui + Tailwind CSS v4
- **State**: Zustand
- **Icons**: Lucide React
- **Markdown**: react-markdown

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
npm start
```

## Project Structure

```
src/
├── app/
│   ├── (app)/              # Authenticated app shell
│   │   ├── layout.tsx      # Sidebar + topbar layout
│   │   ├── chat/           # AI conversation
│   │   ├── knowledge/      # Document management
│   │   ├── graph/          # Knowledge graph visualization
│   │   ├── search/         # Unified search
│   │   ├── skills/         # Skill marketplace
│   │   └── settings/       # User preferences
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Landing / dashboard
│   └── globals.css         # Theme & global styles
├── components/
│   ├── app-shell.tsx       # Sidebar navigation
│   └── topbar.tsx          # Top navigation bar
├── stores/
│   └── app-store.ts        # Zustand global state
└── lib/
    └── api.ts              # API client
```

## API Proxy

The dev server proxies `/api/soul/*` requests to the Soul backend service. Configure the target in `next.config.ts`.

## License

MIT
