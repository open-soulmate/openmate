# 4-Page Merge Analysis (v9)

> Generated: 2026-08-30 | Files unchanged since v8

## File Sizes

| Page | File | Lines |
|------|------|-------|
| admin | admin-client.tsx | 775 |
| permission | permission-client.tsx | 331 |
| enterprise | enterprise-client.tsx | 568 |
| soma-admin | soma-admin-client.tsx | 613 |
| **Total** | | **2,287** |

---

## 1. admin-client.tsx (775 lines)

**Core Function**: System-wide monitoring dashboard for OpenSoul (25+ organs/components).

**Data Source**: `GET /api/admin/overview` → returns `SystemOverview` with health + stats for all organs. Auto-refreshes every 30s.

**Unique Features**:
- **Health overview**: 4-card summary (System Health, File Store, LLM Usage, Trajectories)
- **Quick Actions** (7 cards): Clear Caches, Cleanup Expired, Run Backup, Export Config, Download System Report, Full Health Check, Refresh Overview
- **Organ Grid**: Shows all organs as colored badges (green=ok, red=error)
- **Component Statistics**: 25+ StatsCards for each organ (Vein, Gland, Immune, Gene, Hippo, Vital, Mind, Vision, Pipeline, Trajectory, Reflex, Mirror, Echo, Link, Marrow, Sense, Nerve, Will, Limb, Pulse, Heredity, Cortex, Voice, Nest, Knowledge, Agent, Graph, Entity, Search, Capture, Workflow)
- **Helper components**: `ActionCard` (run+result), `StatsCard` (emoji+items grid)
- **i18n**: Uses `useTranslation()` with `admin.*` keys
- **No auth token**: Uses `getApiBaseUrl()` only, no `getToken()`

**API Endpoints**:
- `GET /api/admin/overview` (main data)
- `POST /api/admin/caches/clear`
- `POST /api/admin/cleanup`
- `POST /api/admin/backup`
- `GET /api/admin/export/config`
- `GET /api/admin/report`
- `GET /api/diagnostics/check-all`

---

## 2. permission-client.tsx (331 lines)

**Core Function**: RBAC (Role-Based Access Control) policy and role management.

**Data Source**: `GET /api/permission/policies` → returns array of `Policy` objects. Uses auth token.

**Unique Features**:
- **2 tabs**: Policies, Roles
- **Policies tab**: Table view with search, create form (role/resource/action/effect), inline delete confirmation
- **Roles tab**: Lookup user roles by username, assign role to user, delete role from user
- **Uses `getToken()`** for Authorization header
- **Table-based list** (not cards) for policies
- **Effect badge**: green=allow, red=deny
- **i18n**: Uses `permission.*` keys

**API Endpoints**:
- `GET /api/permission/policies`
- `POST /api/permission/policy`
- `DELETE /api/permission/policy`
- `GET /api/permission/roles/{username}`
- `POST /api/permission/role`
- `DELETE /api/permission/role`

---

## 3. enterprise-client.tsx (568 lines)

**Core Function**: Enterprise-grade user/role/permission/audit management with separate auth system.

**Data Source**: Enterprise-specific API (`/api/enterprise/*`) with its own JWT token stored in `localStorage["enterprise-token"]`.

**Unique Features**:
- **3 tabs**: Users & Roles, Role Management, Audit Log
- **Separate auth system**: Has its own login/register flow, auto-authenticates on mount
- **Users tab**: List users with avatar initials, roles as badges; assign role form; assign permission form
- **Roles tab**: Create role with comma-separated permissions
- **Audit tab**: Filterable audit log with action/status badges, IP, timestamp, details
- **Health check**: `GET /api/enterprise/health`
- **Uses `entFetch()`** helper (wraps enterprise token)
- **i18n**: Uses `enterprise.*` keys

**API Endpoints**:
- `POST /api/enterprise/auth/login`
- `POST /api/enterprise/auth/register`
- `GET /api/enterprise/health`
- `GET /api/enterprise/users/list`
- `POST /api/enterprise/users/{id}/roles`
- `POST /api/enterprise/roles`
- `POST /api/enterprise/permissions`
- `GET /api/enterprise/audit?limit=N&action=X`

---

## 4. soma-admin-client.tsx (613 lines)

**Core Function**: Soma (OpenSoma, port 8091) connector/collector management dashboard.

**Data Source**: Direct to `http://localhost:8091` (somaBase), NOT through apiBase.

**Unique Features**:
- **4 tabs**: Dashboard, Connectors, Collectors, Config
- **Dashboard**: 4 status cards (status/version/connectors/collectors) + system detail grid + uptime
- **Connectors**: List-detail layout with mobile overlay; toggle connector on/off; show config JSON and errors
- **Collectors**: Stats cards (total/running/stopped/error); list with status badges and error display
- **Config**: Raw JSON display of system status + connection info
- **`useIsMobile()`** for responsive connector detail (mobile=overlay, desktop=inline)
- **`formatTime()`** helper for relative timestamps
- **`STATUS_COLORS`** map for consistent status coloring
- **i18n**: Uses `somaAdmin.*` keys
- **Hardcoded port 8091** (not from config)

**API Endpoints** (all on somaBase:8091):
- `GET /api/status`
- `GET /api/connectors`
- `GET /api/collectors`
- `POST /api/connectors/{name}/toggle`

---

## Overlap Matrix

| Feature | admin | permission | enterprise | soma-admin |
|---------|-------|------------|------------|------------|
| PageLayout wrapper | ✅ | ✅ | ✅ | ✅ |
| Tab navigation | ❌ | ✅ (2) | ✅ (3) | ✅ (4) |
| Health monitoring | ✅ (organs) | ❌ | ✅ (enterprise) | ✅ (soma) |
| User management | ❌ | ❌ | ✅ | ❌ |
| Role management | ❌ | ✅ | ✅ | ❌ |
| Permission/Policy CRUD | ❌ | ✅ | ✅ | ❌ |
| Audit log | ❌ | ❌ | ✅ | ❌ |
| Connector management | ❌ | ❌ | ❌ | ✅ |
| Collector management | ❌ | ❌ | ❌ | ✅ |
| System stats cards | ✅ (25+) | ❌ | ❌ | ✅ (4) |
| Quick actions | ✅ (7) | ❌ | ❌ | ❌ |
| Table/list view | ❌ (grid) | ✅ (table) | ✅ (list) | ✅ (list) |
| Auth token usage | ❌ | ✅ (main) | ✅ (enterprise) | ❌ |
| i18n | ✅ | ✅ | ✅ | ✅ |
| Mobile responsive | ✅ | ✅ | ✅ | ✅ |

## Merge Suggestions

### High Overlap: permission + enterprise
- Both manage roles and permissions
- **enterprise** is superset: adds users, audit, separate auth
- **Option A**: Merge into enterprise, deprecate permission page
- **Option B**: Keep permission as "quick/simple" view, enterprise as "full" view

### No Overlap: admin, soma-admin
- admin = OpenSoul system monitoring (25+ organs)
- soma-admin = OpenSoma connector/collector management
- These are fundamentally different systems, should stay separate

### Shared Patterns (potential extraction)
1. **Tab component**: permission, enterprise, soma-admin all have custom tab implementations
2. **Status badge pattern**: admin, enterprise, soma-admin all color-code statuses
3. **Refresh button pattern**: All 4 pages have refresh functionality
4. **Loading spinner**: All use `<Loader2 className="animate-spin" />`
5. **Empty state pattern**: permission, enterprise, soma-admin all show empty states with icons
