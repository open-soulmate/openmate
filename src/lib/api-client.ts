const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8090';

async function request(path: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  chat: (message: string, knowledgeId?: string) =>
    request('/api/chat/', { method: 'POST', body: JSON.stringify({ message, knowledge_id: knowledgeId }) }),
  getKnowledge: () => request('/api/knowledge/'),
  createKnowledge: (data: { title: string; description?: string }) =>
    request('/api/knowledge/', { method: 'POST', body: JSON.stringify(data) }),
  deleteKnowledge: (id: string) => request(`/api/knowledge/${id}`, { method: 'DELETE' }),
  search: (query: string) => request(`/api/search/?q=${encodeURIComponent(query)}`),
  getGraph: () => request('/api/graph/full'),
  getEntities: () => request('/api/graph/entities'),
  getRelations: () => request('/api/graph/relations'),
  login: (username: string, password: string) =>
    request('/api/user/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  register: (username: string, password: string) =>
    request('/api/user/register', { method: 'POST', body: JSON.stringify({ username, password }) }),
  health: () => request('/api/health'),
};
