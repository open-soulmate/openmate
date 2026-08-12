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
  chat: (message: string, userId: string, knowledgeId?: string) =>
    request('/api/chat/', { method: 'POST', body: JSON.stringify({ message, user_id: userId, knowledge_id: knowledgeId }) }),

  // Knowledge - all require user_id
  getKnowledge: (userId: string) => request(`/api/knowledge/?user_id=${userId}`),
  createKnowledge: (userId: string, data: { title: string; content: string; tags?: string[] }) =>
    request(`/api/knowledge/?user_id=${userId}`, { method: 'POST', body: JSON.stringify(data) }),
  deleteKnowledge: (id: string) => request(`/api/knowledge/${id}`, { method: 'DELETE' }),

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

export function isLoggedIn(): boolean {
  return !!getUserId();
}
