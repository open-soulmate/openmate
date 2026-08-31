# OpenFace MCP UI Extension Spec v1.0

## Overview

Extends standard MCP tool definitions with UI hints. OpenFace reads these hints to auto-generate interfaces, bind events, and configure interaction rules — no manual UI coding needed.

**Principle:** Standard MCP fields (`name`, `description`, `parameters`) remain untouched. UI hints live in an optional `ui` extension field. Tools without `ui` still work — OpenFace falls back to semantic inference.

## Extension Schema

```typescript
interface MCPToolUI {
  // ── Classification ──────────────────────
  category?: ToolCategory;       // Tool category for UI grouping
  risk?: RiskLevel;              // Risk level → auto-confirm behavior
  tags?: string[];               // Search/filter tags

  // ── Input Mapping ───────────────────────
  inputs?: InputHint[];          // How to render each input parameter
  
  // ── Output Mapping ──────────────────────
  outputs?: OutputHint[];        // How to render tool outputs
  
  // ── Interaction Rules ───────────────────
  confirmBeforeExecute?: boolean; // Force confirmation dialog (auto-set for high risk)
  showProgress?: boolean;         // Show progress bar for long tasks
  allowCancel?: boolean;          // Show cancel button during execution
  autoExecute?: boolean;          // Execute immediately on trigger (low-risk only)
  
  // ── Keyboard Shortcut ───────────────────
  suggestedShortcut?: string;    // e.g. "Ctrl+Shift+C"
  
  // ── Layout Hints ────────────────────────
  layout?: 'form' | 'single-action' | 'dashboard' | 'wizard';
  size?: 'compact' | 'normal' | 'fullscreen';  // Suggested panel size
  
  // ── Streaming ───────────────────────────
  streaming?: boolean;           // Tool supports streaming output
  streamTarget?: string;         // Which output to stream (key from outputs)
}
```

## Enums

```typescript
type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

type ToolCategory = 
  | 'document'      // Document processing (clean, convert, merge)
  | 'code'          // Code compilation, analysis
  | 'search'        // Search, retrieval
  | 'file'          // File operations (copy, move, compress)
  | 'network'       // Network requests, API calls
  | 'system'        // System operations (process, service)
  | 'data'          // Data transformation, analysis
  | 'media'         // Image/video/audio processing
  | 'communication' // Email, messaging
  | 'security'      // Auth, encryption, audit
  | 'custom';       // Uncategorized
```

## Input Hints

Maps MCP `parameters` properties to UI components.

```typescript
interface InputHint {
  key: string;                   // Matches parameter name from MCP schema
  type?: InputType;              // UI component type (overrides auto-detect)
  label?: string;                // Display label (default: auto from key)
  placeholder?: string;          // Placeholder text
  description?: string;          // Help text (default: from parameter description)
  
  // Type-specific
  accept?: string[];             // For file: accepted extensions [".pdf", ".docx"]
  multiple?: boolean;            // For file: allow multiple files
  options?: OptionHint[];        // For select: predefined options
  min?: number;                  // For number/slider: minimum value
  max?: number;                  // For number/slider: maximum value
  step?: number;                 // For slider: step size
  rows?: number;                 // For textarea: visible rows
  
  // Validation
  required?: boolean;            // Default: from MCP required array
  validation?: string;           // Regex pattern or validation rule name
  
  // Grouping
  group?: string;                // Group inputs into sections
  order?: number;                // Display order (lower = first)
}

type InputType =
  | 'text'          // Single-line text
  | 'number'        // Numeric input
  | 'textarea'      // Multi-line text
  | 'select'        // Dropdown
  | 'multi-select'  // Multi-value dropdown
  | 'toggle'        // Boolean switch
  | 'checkbox'      // Checkbox
  | 'slider'        // Range slider
  | 'file'          // File picker
  | 'folder'        // Directory picker
  | 'date'          // Date picker
  | 'color'         // Color picker
  | 'json'          // JSON editor
  | 'code'          // Code editor
  | 'password'      // Masked text
  | 'url'           // URL input with validation
  | 'email';        // Email input

interface OptionHint {
  value: string;
  label: string;
  icon?: string;                 // Lucide icon name
  description?: string;
  disabled?: boolean;
  deprecated?: boolean;
}
```

### Type Auto-Detection Rules

When `type` is not specified, OpenFace infers from MCP parameter schema:

| MCP Schema | Inferred UI |
|-----------|-------------|
| `type: "string"` + `enum` | `select` |
| `type: "string"` + `format: "uri"` | `url` |
| `type: "string"` + `format: "email"` | `email` |
| `type: "string"` + `maxLength > 200` | `textarea` |
| `type: "string"` (default) | `text` |
| `type: "number"` / `"integer"` | `number` |
| `type: "boolean"` | `toggle` |
| `type: "array"` + items string | `multi-select` |
| `type: "object"` | `json` |
| `type: "string"` + `format: "binary"` | `file` |
| key contains "path" + "file" | `file` |
| key contains "path" + "dir" / "folder" | `folder` |
| key contains "password" / "secret" / "token" | `password` |

## Output Hints

Defines how tool outputs are rendered.

```typescript
interface OutputHint {
  key: string;                   // Output key from tool result
  type?: OutputType;             // How to render (overrides auto-detect)
  label?: string;                // Display label
  
  // Type-specific
  language?: string;             // For code: syntax language
  downloadable?: boolean;        // Show download button (default: true for files)
  previewable?: boolean;         // Show inline preview (default: true for images)
  copyable?: boolean;            // Show copy button (default: true for text/code)
  
  // Streaming
  stream?: boolean;              // This output supports streaming updates
  
  // Actions
  actions?: OutputAction[];      // Additional actions on this output
}

type OutputType =
  | 'text'          // Plain text
  | 'markdown'      // Markdown rendered
  | 'code'          // Code block with syntax highlighting
  | 'json'          // JSON tree view
  | 'html'          // HTML preview (sandboxed iframe)
  | 'image'         // Image preview
  | 'video'         // Video player
  | 'audio'         // Audio player
  | 'file'          // File download
  | 'table'         // Data table
  | 'chart'         // Chart/visualization
  | 'diff'          // Diff view (before/after)
  | 'log'           // Log viewer (streaming)
  | 'progress'      // Progress indicator
  | 'pdf'           // PDF preview
  | 'terminal';     // Terminal output

interface OutputAction {
  label: string;                 // Button label
  icon?: string;                 // Lucide icon name
  action: 'copy' | 'download' | 'open-external' | 'send-to' | 'custom';
  target?: string;               // For 'send-to': target tool name
  customEndpoint?: string;       // For 'custom': API endpoint
}
```

### Output Type Auto-Detection

| Tool Result | Inferred Output |
|------------|-----------------|
| `type: "image"` + base64/URL | `image` |
| `type: "file"` + path/URL | `file` |
| `type: "text"` + language field | `code` |
| `type: "text"` + starts with `{`/`[` | `json` |
| `type: "text"` + contains `#`/`*`/`[` | `markdown` |
| `type: "text"` (default) | `text` |
| `type: "table"` / rows array | `table` |
| `type: "stream"` | `log` with stream=true |

## Interaction Rules

Auto-generated based on risk level and tool category:

| Risk Level | Confirm | Progress | Cancel | Auto-Execute |
|-----------|---------|----------|--------|-------------|
| `low` | ❌ | ❌ | ❌ | ✅ |
| `medium` | ❌ | ✅ | ✅ | ❌ |
| `high` | ✅ (required) | ✅ | ✅ | ❌ |
| `critical` | ✅ (required + reason) | ✅ | ✅ | ❌ |

| Category | Extra Rules |
|----------|------------|
| `file` | Always show file preview before execute |
| `code` | Show code diff if modifying files |
| `network` | Show target URL in confirmation |
| `system` | Show affected services in confirmation |
| `security` | Log all executions to audit trail |
| `data` | Show data preview (first N rows) before transform |

## Complete Example

```json
{
  "name": "artifact_clean",
  "description": "取证级文档元数据清理 — 移除文件隐藏元数据、修订记录、个人信息",
  "parameters": {
    "type": "object",
    "required": ["file_path"],
    "properties": {
      "file_path": {
        "type": "string",
        "description": "要清理的文件路径"
      },
      "output_format": {
        "type": "string",
        "enum": ["original", "pdf"],
        "description": "输出格式"
      },
      "remove_hidden": {
        "type": "boolean",
        "description": "移除隐藏内容"
      }
    }
  },
  "ui": {
    "category": "document",
    "risk": "high",
    "tags": ["取证", "元数据", "清理", "forensic"],
    
    "inputs": [
      {
        "key": "file_path",
        "type": "file",
        "label": "选择文件",
        "accept": [".pdf", ".docx", ".odt", ".xlsx"],
        "description": "支持PDF、Word、ODT、Excel格式",
        "order": 1
      },
      {
        "key": "output_format",
        "type": "select",
        "label": "输出格式",
        "options": [
          { "value": "original", "label": "保持原格式" },
          { "value": "pdf", "label": "转换为PDF" }
        ],
        "order": 2,
        "group": "选项"
      },
      {
        "key": "remove_hidden",
        "type": "toggle",
        "label": "移除隐藏内容",
        "description": "包括修订记录、批注、隐藏文字",
        "defaultValue": true,
        "order": 3,
        "group": "选项"
      }
    ],
    
    "outputs": [
      {
        "key": "report",
        "type": "markdown",
        "label": "清理报告",
        "stream": true,
        "actions": [
          { "label": "复制", "action": "copy" },
          { "label": "下载PDF", "action": "download", "icon": "Download" }
        ]
      },
      {
        "key": "cleaned_file",
        "type": "file",
        "label": "清理后文件",
        "downloadable": true,
        "previewable": true
      }
    ],
    
    "confirmBeforeExecute": true,
    "showProgress": true,
    "allowCancel": true,
    "suggestedShortcut": "Ctrl+Shift+C",
    "layout": "form",
    "size": "normal",
    
    "streaming": true,
    "streamTarget": "report"
  }
}
```

## Auto-Generated UI Flow

When OpenFace encounters this tool definition:

```
1. Read inputs[] → Generate form with:
   - File picker (accept pdf/docx/odt/xlsx)
   - Select dropdown (original/pdf)
   - Toggle switch (remove hidden, default ON)

2. Read risk: "high" → Auto-add:
   - Confirmation dialog before execution
   - Cancel button during execution

3. Read outputs[] → Prepare result panels:
   - Markdown viewer for "report" (streaming)
   - File download + preview for "cleaned_file"

4. Read showProgress: true → Add progress bar

5. Read layout: "form" → Use form layout (inputs left, preview right)

6. Read suggestedShortcut → Register Ctrl+Shift+C

7. Bind: Execute button click → POST /mcp/artifact_clean with form data
8. Bind: Progress events → Update progress bar
9. Bind: Stream events → Append to markdown viewer
10. Bind: Completion → Show cleaned_file download panel
```

## MCP Response Integration

MCP tools can return results with UI hints:

```json
{
  "content": [
    {
      "type": "text",
      "text": "清理完成，移除了23个元数据项"
    },
    {
      "type": "file",
      "data": "base64...",
      "mimeType": "application/pdf",
      "name": "cleaned_report.pdf"
    }
  ],
  "_ui": {
    "toast": { "type": "success", "message": "文档清理完成" },
    "refresh": ["file-list"],
    "openPreview": "cleaned_report.pdf"
  }
}
```

The `_ui` field is optional — OpenFace uses it for post-execution UI actions (toast, refresh, open preview).
