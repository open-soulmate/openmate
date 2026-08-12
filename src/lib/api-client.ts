const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8090';

async function request(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> || {}) };
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  // Auth
  login: (username: string, password: string) => {
    const body = new URLSearchParams({ username, password });
    return request('/api/user/login', { method: 'POST', body: body.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } as Record<string, string> });
  },
  register: (username: string, password: string, email: string) =>
    request('/api/user/register', { method: 'POST', body: JSON.stringify({ username, password, email }) }),

  // Chat
  chat: (message: string, userId: string) =>
    request('/api/chat/', { method: 'POST', body: JSON.stringify({ message, user_id: userId }) }),

  // Knowledge
  getKnowledge: (userId: string) => request(`/api/knowledge/?user_id=${userId}`),
  createKnowledge: (userId: string, data: { title: string; content: string; tags?: string[] }) =>
    request(`/api/knowledge/?user_id=${userId}`, { method: 'POST', body: JSON.stringify(data) }),
  deleteKnowledge: (id: string) => request(`/api/knowledge/${id}`, { method: 'DELETE' }),

  // Knowledge Requests (申请创建知识库)
  createKbRequest: (data: { kb_name: string; kb_description: string }) =>
    request('/api/knowledge-requests/', { method: 'POST', body: JSON.stringify(data) }),
  getMyKbRequests: () => request('/api/knowledge-requests/my'),
  listKbRequests: (status?: string) => request(`/api/knowledge-requests/${status ? `?status=${status}` : ''}`),
  reviewKbRequest: (id: string, data: { status: string; review_note: string }) =>
    request(`/api/knowledge-requests/${id}/review`, { method: 'POST', body: JSON.stringify(data) }),

  // KB Sharing (申请共享到企业知识库)
  createSharingRequest: (data: { kb_id: string; kb_name: string }) =>
    request('/api/kb-sharing/', { method: 'POST', body: JSON.stringify(data) }),
  getMySharingRequests: () => request('/api/kb-sharing/my'),
  listSharingRequests: (status?: string) => request(`/api/kb-sharing/${status ? `?status=${status}` : ''}`),
  reviewSharingRequest: (id: string, data: { status: string; review_note: string }) =>
    request(`/api/kb-sharing/${id}/review`, { method: 'POST', body: JSON.stringify(data) }),

  // Search
  search: (query: string, userId: string) => request(`/api/search/?q=${encodeURIComponent(query)}&user_id=${userId}`),

  // Graph
  getGraph: (userId: string) => request(`/api/graph/full?user_id=${userId}`),
  getEntities: (userId: string) => request(`/api/graph/entities?user_id=${userId}`),
  getRelations: () => request('/api/graph/relations'),

  // Health
  health: () => request('/api/health'),
};

// User session management
export function getUserId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('openmate-user-id');
}

export function setUserId(id: string) {
  localStorage.setItem('openmate-user-id', id);
}

export function clearUser() {
  localStorage.removeItem('openmate-user-id');
  localStorage.removeItem('openmate-token');
}

export function setToken(token: string) {
  localStorage.setItem('openmate-token', token);
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('openmate-token');
}

export function isLoggedIn(): boolean {
  return !!getUserId();
}
