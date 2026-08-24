"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { getApiBaseUrl, getToken } from "@/lib/api-client"
import {
  Shield, Users, FileText, Loader2, Plus, Search, RefreshCw,
  CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, UserPlus,
  Key, Eye, AlertTriangle,
} from "lucide-react"

interface User {
  id: string
  username: string
  email?: string
  roles: string[]
  created_at?: string
}

interface Role {
  role: string
  permissions: string[]
}

interface AuditEntry {
  id: string
  timestamp: string
  user_id: string
  username?: string
  action: string
  resource: string
  details?: string
  ip?: string
  status?: string
}

type ActiveTab = "users" | "roles" | "audit"

export function EnterpriseClient() {
  const { t } = useTranslation()
  const apiBase = getApiBaseUrl()
  const [activeTab, setActiveTab] = useState<ActiveTab>("users")
  const [loading, setLoading] = useState(true)
  const [health, setHealth] = useState<string>("unknown")

  // Users state
  const [users, setUsers] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(false)

  // Roles state
  const [roles, setRoles] = useState<Role[]>([])
  const [rolesLoading, setRolesLoading] = useState(false)
  const [newRoleName, setNewRoleName] = useState("")
  const [newRolePerms, setNewRolePerms] = useState("")
  const [createRoleLoading, setCreateRoleLoading] = useState(false)

  // Assign role state
  const [assignUserId, setAssignUserId] = useState("")
  const [assignRole, setAssignRole] = useState("")
  const [assignLoading, setAssignLoading] = useState(false)

  // Permissions state
  const [permUserId, setPermUserId] = useState("")
  const [permResource, setPermResource] = useState("")
  const [permAction, setPermAction] = useState("read")
  const [permLoading, setPermLoading] = useState(false)

  // Audit state
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditLimit, setAuditLimit] = useState(50)
  const [auditActionFilter, setAuditActionFilter] = useState("")

  // Enterprise auth token (separate from main app token)
  const [entToken, setEntToken] = useState<string>(() => {
    if (typeof window !== "undefined") return localStorage.getItem("enterprise-token") || ""
    return ""
  })

  // Error state
  const [error, setError] = useState("")

  // Helper: authenticated fetch with enterprise token
  const entFetch = useCallback(async (path: string, opts: RequestInit = {}) => {
    const headers: Record<string, string> = { ...(opts.headers as Record<string, string> || {}) }
    const tk = entToken || localStorage.getItem("enterprise-token") || ""
    if (tk) headers["Authorization"] = `Bearer ${tk}`
    return fetch(`${apiBase}${path}`, { ...opts, headers })
  }, [apiBase, entToken])

  // Auto-authenticate with enterprise system on mount
  const ensureEntAuth = useCallback(async (): Promise<string | null> => {
    const existing = localStorage.getItem("enterprise-token")
    if (existing) { setEntToken(existing); return existing }
    try {
      // Enterprise has its own user DB; try common usernames
      const candidates = ["admin"]
      const mainToken = getToken()
      if (mainToken) {
        try {
          const payload = JSON.parse(atob(mainToken.split(".")[1]))
          if (payload.username && !candidates.includes(payload.username)) candidates.unshift(payload.username)
        } catch { /* ignore */ }
      }
      for (const username of candidates) {
        const res = await fetch(`${apiBase}/api/enterprise/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password: username }),
          signal: AbortSignal.timeout(5000),
        })
        if (res.ok) {
          const data = await res.json()
          localStorage.setItem("enterprise-token", data.access_token)
          setEntToken(data.access_token)
          return data.access_token
        }
      }
      // If all logins fail, register admin and login
      await fetch(`${apiBase}/api/enterprise/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "admin" }),
        signal: AbortSignal.timeout(5000),
      })
      const loginRes = await fetch(`${apiBase}/api/enterprise/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "admin" }),
        signal: AbortSignal.timeout(5000),
      })
      if (loginRes.ok) {
        const data = await loginRes.json()
        localStorage.setItem("enterprise-token", data.access_token)
        setEntToken(data.access_token)
        return data.access_token
      }
    } catch { /* ignore */ }
    return null
  }, [apiBase])

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/enterprise/health`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const data = await res.json()
        setHealth(data.status || "ok")
      } else {
        setHealth("error")
      }
    } catch {
      setHealth("unreachable")
    }
  }, [apiBase])

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true)
    setError("")
    try {
      await ensureEntAuth()
      const res = await entFetch(`/api/enterprise/users/list`, { signal: AbortSignal.timeout(10000) })
      if (res.ok) {
        const data = await res.json()
        setUsers(Array.isArray(data) ? data : data.users || [])
      } else {
        setError(`Failed to load users: ${res.status}`)
      }
    } catch (e: unknown) {
      setError(`Users error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setUsersLoading(false)
    }
  }, [apiBase, ensureEntAuth, entFetch])

  const fetchAudit = useCallback(async () => {
    setAuditLoading(true)
    try {
      await ensureEntAuth()
      let url = `/api/enterprise/audit?limit=${auditLimit}`
      if (auditActionFilter) url += `&action=${encodeURIComponent(auditActionFilter)}`
      const res = await entFetch(url, { signal: AbortSignal.timeout(10000) })
      if (res.ok) {
        const data = await res.json()
        setAuditEntries(Array.isArray(data) ? data : data.entries || data.audit || [])
      }
    } catch (e: unknown) {
      console.error("Audit fetch error:", e)
    } finally {
      setAuditLoading(false)
    }
  }, [apiBase, auditLimit, auditActionFilter, ensureEntAuth, entFetch])

  const createRole = async () => {
    if (!newRoleName.trim()) return
    setCreateRoleLoading(true)
    setError("")
    try {
      await ensureEntAuth()
      const perms = newRolePerms.split(",").map(p => p.trim()).filter(Boolean)
      const res = await entFetch(`/api/enterprise/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRoleName.trim(), permissions: perms }),
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        setNewRoleName("")
        setNewRolePerms("")
        // Refresh roles list
        setRoles(prev => [...prev, { role: newRoleName.trim(), permissions: perms }])
      } else {
        const err = await res.text()
        setError(`Create role failed: ${err}`)
      }
    } catch (e: unknown) {
      setError(`Create role error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setCreateRoleLoading(false)
    }
  }

  const assignRoleToUser = async () => {
    if (!assignUserId.trim() || !assignRole.trim()) return
    setAssignLoading(true)
    setError("")
    try {
      await ensureEntAuth()
      const res = await entFetch(`/api/enterprise/users/${assignUserId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: assignRole.trim() }),
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        setAssignUserId("")
        setAssignRole("")
        fetchUsers()
      } else {
        const err = await res.text()
        setError(`Assign role failed: ${err}`)
      }
    } catch (e: unknown) {
      setError(`Assign role error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setAssignLoading(false)
    }
  }

  const assignPermission = async () => {
    if (!permUserId.trim() || !permResource.trim()) return
    setPermLoading(true)
    setError("")
    try {
      await ensureEntAuth()
      const res = await entFetch(`/api/enterprise/permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: permUserId.trim(),
          resource: permResource.trim(),
          action: permAction,
        }),
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        setPermUserId("")
        setPermResource("")
        setPermAction("read")
      } else {
        const err = await res.text()
        setError(`Assign permission failed: ${err}`)
      }
    } catch (e: unknown) {
      setError(`Permission error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setPermLoading(false)
    }
  }

  useEffect(() => {
    ensureEntAuth().then(() => {
      fetchHealth()
      setLoading(false)
    })
  }, [ensureEntAuth, fetchHealth])

  useEffect(() => {
    if (activeTab === "users") fetchUsers()
    if (activeTab === "audit") fetchAudit()
  }, [activeTab, fetchUsers, fetchAudit])

  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: "users", label: t("enterprise.users", "Users & Roles"), icon: <Users className="w-4 h-4" /> },
    { id: "roles", label: t("enterprise.roles", "Role Management"), icon: <Key className="w-4 h-4" /> },
    { id: "audit", label: t("enterprise.audit", "Audit Log"), icon: <FileText className="w-4 h-4" /> },
  ]

  const statusColor = health === "ok" || health === "healthy" ? "text-green-400" : health === "unknown" ? "text-yellow-400" : "text-red-400"
  const StatusIcon = health === "ok" || health === "healthy" ? CheckCircle : XCircle

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-blue-400" />
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">{t("enterprise.title", "Enterprise Management")}</h1>
            <p className="text-sm text-zinc-500">{t("enterprise.subtitle", "Users, roles, permissions & audit trail")}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-sm ${statusColor}`}>
            <StatusIcon className="w-4 h-4" />
            <span className="capitalize">{health}</span>
          </div>
          <button onClick={() => { fetchHealth(); if (activeTab === "users") fetchUsers(); if (activeTab === "audit") fetchAudit() }}
            className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-3 border-b border-zinc-800">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.id
                ? "bg-zinc-800/50 text-zinc-100 border-b-2 border-blue-500"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30"
            }`}>
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-3 px-4 py-2.5 bg-red-950/30 border border-red-900/50 rounded-lg flex items-center gap-2 text-sm text-red-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-200"><XCircle className="w-4 h-4" /></button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>
        ) : (
          <>
            {/* Users Tab */}
            {activeTab === "users" && (
              <div className="space-y-6">
                {/* Assign Role */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                    <UserPlus className="w-4 h-4" /> {t("enterprise.assignRole", "Assign Role to User")}
                  </h3>
                  <div className="flex gap-3">
                    <input value={assignUserId} onChange={e => setAssignUserId(e.target.value)}
                      placeholder={t("enterprise.userIdPlaceholder", "User ID")}
                      className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500" />
                    <input value={assignRole} onChange={e => setAssignRole(e.target.value)}
                      placeholder={t("enterprise.rolePlaceholder", "Role name")}
                      className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500" />
                    <button onClick={assignRoleToUser} disabled={assignLoading || !assignUserId || !assignRole}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2">
                      {assignLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                      {t("enterprise.assign", "Assign")}
                    </button>
                  </div>
                </div>

                {/* Assign Permission */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                    <Key className="w-4 h-4" /> {t("enterprise.assignPermission", "Assign Permission")}
                  </h3>
                  <div className="flex gap-3">
                    <input value={permUserId} onChange={e => setPermUserId(e.target.value)}
                      placeholder={t("enterprise.userIdPlaceholder", "User ID")}
                      className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500" />
                    <input value={permResource} onChange={e => setPermResource(e.target.value)}
                      placeholder={t("enterprise.resourcePlaceholder", "Resource (e.g. knowledge, workflow)")}
                      className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500" />
                    <select value={permAction} onChange={e => setPermAction(e.target.value)}
                      className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-blue-500">
                      <option value="read">{t("enterprise.permRead", "Read")}</option>
                      <option value="write">{t("enterprise.permWrite", "Write")}</option>
                      <option value="delete">{t("enterprise.permDelete", "Delete")}</option>
                      <option value="admin">{t("enterprise.permAdmin", "Admin")}</option>
                    </select>
                    <button onClick={assignPermission} disabled={permLoading || !permUserId || !permResource}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2">
                      {permLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                      {t("enterprise.grant", "Grant")}
                    </button>
                  </div>
                </div>

                {/* Users List */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                    <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                      <Users className="w-4 h-4" /> {t("enterprise.userList", "Users")} ({users.length})
                    </h3>
                    <button onClick={fetchUsers} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {usersLoading ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
                  ) : users.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500 text-sm">{t("enterprise.noUsers", "No users found")}</div>
                  ) : (
                    <div className="divide-y divide-zinc-800/50">
                      {users.map((user, i) => (
                        <div key={user.id || i} className="flex items-center justify-between px-4 py-3 hover:bg-zinc-800/30 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 text-sm font-medium">
                              {(user.username || "?")[0].toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-zinc-200">{user.username || user.id}</div>
                              {user.email && <div className="text-xs text-zinc-500">{user.email}</div>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {user.roles?.map((role, j) => (
                              <span key={j} className="px-2 py-0.5 bg-blue-900/30 text-blue-300 text-xs rounded-full border border-blue-800/50">
                                {role}
                              </span>
                            ))}
                            {(!user.roles || user.roles.length === 0) && (
                              <span className="text-xs text-zinc-600">{t("enterprise.noRoles", "No roles")}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Roles Tab */}
            {activeTab === "roles" && (
              <div className="space-y-6">
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                    <Plus className="w-4 h-4" /> {t("enterprise.createRole", "Create Role")}
                  </h3>
                  <div className="flex gap-3">
                    <input value={newRoleName} onChange={e => setNewRoleName(e.target.value)}
                      placeholder={t("enterprise.roleNamePlaceholder", "Role name (e.g. editor, viewer)")}
                      className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500" />
                    <input value={newRolePerms} onChange={e => setNewRolePerms(e.target.value)}
                      placeholder={t("enterprise.permsPlaceholder", "Permissions (comma-separated)")}
                      className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500" />
                    <button onClick={createRole} disabled={createRoleLoading || !newRoleName.trim()}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2">
                      {createRoleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      {t("enterprise.create", "Create")}
                    </button>
                  </div>
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl">
                  <div className="px-4 py-3 border-b border-zinc-800">
                    <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                      <Key className="w-4 h-4" /> {t("enterprise.roleList", "Roles")}
                    </h3>
                  </div>
                  {roles.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500 text-sm">{t("enterprise.noRolesDefined", "No roles defined yet. Create one above.")}</div>
                  ) : (
                    <div className="divide-y divide-zinc-800/50">
                      {roles.map((role, i) => (
                        <div key={i} className="px-4 py-3">
                          <div className="text-sm font-medium text-zinc-200">{role.role}</div>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {role.permissions.map((perm, j) => (
                              <span key={j} className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-xs rounded-full">{perm}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Audit Tab */}
            {activeTab === "audit" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input value={auditActionFilter} onChange={e => setAuditActionFilter(e.target.value)}
                      placeholder={t("enterprise.filterByAction", "Filter by action...")}
                      className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500" />
                  </div>
                  <select value={auditLimit} onChange={e => setAuditLimit(Number(e.target.value))}
                    className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-blue-500">
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                  <button onClick={fetchAudit} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm text-zinc-300 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" /> {t("enterprise.refresh", "Refresh")}
                  </button>
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl">
                  {auditLoading ? (
                    <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
                  ) : auditEntries.length === 0 ? (
                    <div className="text-center py-12 text-zinc-500 text-sm">{t("enterprise.noAudit", "No audit records found")}</div>
                  ) : (
                    <div className="divide-y divide-zinc-800/50">
                      {auditEntries.map((entry, i) => (
                        <div key={entry.id || i} className="px-4 py-3 hover:bg-zinc-800/20 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 text-xs rounded-full ${
                                entry.status === "success" ? "bg-green-900/30 text-green-300 border border-green-800/50" :
                                entry.status === "failure" ? "bg-red-900/30 text-red-300 border border-red-800/50" :
                                "bg-zinc-800 text-zinc-400"
                              }`}>
                                {entry.action}
                              </span>
                              <span className="text-sm text-zinc-300">{entry.resource}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-zinc-500">
                              {entry.username && <span>{entry.username}</span>}
                              {entry.ip && <span>{entry.ip}</span>}
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "—"}
                              </span>
                            </div>
                          </div>
                          {entry.details && (
                            <div className="mt-1 text-xs text-zinc-500 pl-[calc(2rem+0.5rem)]">{entry.details}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
