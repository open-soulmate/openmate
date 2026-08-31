# OpenFace UI Schema Specification v1.0

## Overview

OpenFace UI Schema is a JSON-based declarative format for describing user interfaces. Backend services (OpenMate/MCP) send UI Schema to OpenFace, which renders it dynamically using openface components.

**Design Goals:**
- Simple enough for LLMs to generate
- Maps 1:1 to openface React components
- Supports data binding, events, validation
- Extensible via custom component types

## Component Types

### Layout Components

| Type | Description | Children |
|------|-------------|----------|
| `page` | Full page with title and actions | Yes |
| `panel` | Section container with header | Yes |
| `card` | Bordered card with title/description | Yes |
| `tabs` | Tabbed container | Yes (tab children) |
| `grid` | Responsive grid layout | Yes |
| `flex` | Flexbox container | Yes |
| `divider` | Horizontal separator | No |
| `spacer` | Vertical spacing | No |

### Input Components

| Type | Description | Value Type |
|------|-------------|-----------|
| `text-input` | Text field | `string` |
| `number-input` | Number field | `number` |
| `textarea` | Multi-line text | `string` |
| `select` | Dropdown select | `string` |
| `multi-select` | Multi-value select | `string[]` |
| `toggle` | Boolean switch | `boolean` |
| `checkbox` | Checkbox | `boolean` |
| `radio-group` | Radio buttons | `string` |
| `slider` | Range slider | `number` |
| `button-group` | Group of toggle buttons | `string` |
| `color-picker` | Color selection | `string` |
| `file-upload` | File selector | `File[]` |
| `date-picker` | Date selector | `string` (ISO) |

### Display Components

| Type | Description |
|------|-------------|
| `text` | Static text/label |
| `heading` | Section heading |
| `badge` | Status badge |
| `progress` | Progress bar |
| `code` | Code block |
| `image` | Image display |
| `markdown` | Markdown content |
| `json-view` | JSON tree view |
| `table` | Data table |
| `stat` | Metric display (value + label) |

### Action Components

| Type | Description |
|------|-------------|
| `button` | Click action |
| `icon-button` | Icon-only button |
| `link` | Navigation link |
| `dropdown-menu` | Action menu |

## Schema Structure

```typescript
interface UISchema {
  version: "1.0";
  id: string;                    // Unique schema ID
  title?: string;                // Page/panel title
  description?: string;
  
  // Data binding context
  data?: Record<string, any>;    // Initial state values
  
  // Component tree
  children: Component[];
  
  // Global event handlers
  events?: Record<string, EventAction>;
}
```

## Component Definition

```typescript
interface Component {
  type: string;                  // Component type (see tables above)
  id?: string;                   // Unique identifier for data binding
  
  // Layout
  width?: string;                // CSS width (e.g., "full", "1/2", "auto")
  className?: string;            // Additional CSS classes
  
  // Content (type-specific)
  label?: string;                // Display label
  placeholder?: string;          // Placeholder text
  description?: string;          // Help text
  value?: any;                   // Current value or data binding reference
  defaultValue?: any;            // Default value
  
  // Options (for select, radio, button-group)
  options?: Option[];
  
  // Validation
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;              // Regex pattern
  validation?: ValidationRule[];
  
  // Events
  onChange?: EventAction;
  onClick?: EventAction;
  onSubmit?: EventAction;
  
  // Children (for layout components)
  children?: Component[];
  
  // Conditional rendering
  visibleWhen?: Condition;
  disabledWhen?: Condition;
  
  // Custom props (passed through)
  props?: Record<string, any>;
}

interface Option {
  value: string;
  label: string;
  icon?: string;                 // Lucide icon name
  disabled?: boolean;
  description?: string;
}

interface ValidationRule {
  type: "required" | "min" | "max" | "pattern" | "custom";
  value?: any;
  message: string;
}
```

## Data Binding

Values can reference state using `$ref` syntax:

```json
{
  "type": "text-input",
  "id": "apiKey",
  "value": { "$ref": "data.apiKey" },
  "onChange": {
    "action": "update",
    "target": "data.apiKey"
  }
}
```

### Reference Types

| Syntax | Description | Example |
|--------|-------------|---------|
| `$ref: data.key` | State value | `{ "$ref": "data.theme" }` |
| `$ref: env.key` | Environment variable | `{ "$ref": "env.apiBase" }` |
| `$ref: response.key` | API response field | `{ "$ref": "response.user.name" }` |

## Event Actions

```typescript
interface EventAction {
  action: "update" | "submit" | "navigate" | "fetch" | "emit" | "validate" | "custom";
  
  // For "update"
  target?: string;               // State key to update
  
  // For "submit" / "fetch"
  endpoint?: string;             // API endpoint
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: Record<string, any>;    // Request body (supports $ref)
  headers?: Record<string, string>;
  
  // For "navigate"
  url?: string;
  
  // For "emit"
  event?: string;                // Custom event name
  payload?: any;
  
  // For "validate"
  fields?: string[];             // Field IDs to validate
  
  // Success/error handlers
  onSuccess?: EventAction;
  onError?: EventAction;
  
  // Loading state
  loadingRef?: string;           // State key for loading indicator
}
```

## Conditional Rendering

```typescript
interface Condition {
  field: string;                 // State key
  operator: "eq" | "neq" | "gt" | "lt" | "contains" | "empty" | "notEmpty";
  value: any;
}
```

Example:
```json
{
  "type": "card",
  "visibleWhen": {
    "field": "data.llmProvider",
    "operator": "eq",
    "value": "openai"
  },
  "children": [
    { "type": "text-input", "id": "openaiKey", "label": "OpenAI API Key" }
  ]
}
```

## Complete Example

```json
{
  "version": "1.0",
  "id": "settings-appearance",
  "title": "外观设置",
  "data": {
    "theme": "dark",
    "language": "zh",
    "fontSize": "medium",
    "animationEnabled": true
  },
  "children": [
    {
      "type": "card",
      "label": "主题",
      "description": "选择界面主题风格",
      "children": [
        {
          "type": "button-group",
          "id": "theme",
          "value": { "$ref": "data.theme" },
          "options": [
            { "value": "dark", "label": "暗黑", "icon": "Moon" },
            { "value": "light", "label": "亮色", "icon": "Sun" },
            { "value": "purple", "label": "紫色", "icon": "Palette" },
            { "value": "system", "label": "跟随系统", "icon": "Monitor" }
          ],
          "onChange": { "action": "update", "target": "data.theme" }
        }
      ]
    },
    {
      "type": "card",
      "label": "语言",
      "description": "界面显示语言",
      "children": [
        {
          "type": "select",
          "id": "language",
          "value": { "$ref": "data.language" },
          "options": [
            { "value": "zh", "label": "中文" },
            { "value": "en", "label": "English" },
            { "value": "system", "label": "跟随系统" }
          ],
          "onChange": { "action": "update", "target": "data.language" }
        }
      ]
    },
    {
      "type": "button",
      "label": "保存设置",
      "variant": "primary",
      "onClick": {
        "action": "submit",
        "endpoint": "/api/settings",
        "method": "POST",
        "body": {
          "theme": { "$ref": "data.theme" },
          "language": { "$ref": "data.language" }
        },
        "onSuccess": { "action": "emit", "event": "toast", "payload": { "type": "success", "message": "保存成功" } }
      }
    }
  ]
}
```

## MCP Integration

MCP tools can return UI Schema as a response type:

```json
{
  "tool": "document_cleaner",
  "result": {
    "type": "ui_schema",
    "schema": {
      "version": "1.0",
      "id": "doc-cleaner-form",
      "title": "文档净化",
      "children": [...]
    }
  }
}
```

OpenFace detects `type: "ui_schema"` in MCP responses and renders the schema automatically.
