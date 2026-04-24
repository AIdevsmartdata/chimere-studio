// lib/memory-api.ts — Memory Inspector REST client (talks to chimere-mcp
// REST bridge on 127.0.0.1:9095; configurable via localStorage `chimere:mcp`).

export type Episode = {
  id: string;
  name: string;
  content: string;
  created_at: string;
  source?: string;
};

export type Fact = {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  fact: string;
  valid_at: string;
  invalid_at: string;
  pinned?: boolean;
};

export type EngramTableMeta = {
  name: string;
  exists: boolean;
  size_mb: number;
};

export type EngramStats = {
  ok: boolean;
  table: string;
  order: number;
  entries: number;
  load_factor: number;
  file_size_mb: number;
  total_frequency: number;
  age_days: number | null;
  decay_hint: 'fresh' | 'warm' | 'cold' | 'unknown';
  top_ngrams: { rank: number; count: number; share: number }[];
};

export type PinnedFact = {
  fact_id: string | null;
  fact: string;
  reason: string;
  pinned_at: string;
};

const DEFAULT_MCP = 'http://127.0.0.1:9095';

export function getMcpBase(): string {
  if (typeof window === 'undefined') return DEFAULT_MCP;
  return localStorage.getItem('chimere:mcp') || DEFAULT_MCP;
}

export function setMcpBase(url: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('chimere:mcp', url);
  }
}

async function jfetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getMcpBase()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${path}`);
  }
  return res.json() as Promise<T>;
}

// ── Episodes ───────────────────────────────────────────────────────────────

export async function listEpisodes(
  search = '',
  limit = 50,
  offset = 0,
): Promise<{ ok: boolean; source: string; count: number; total: number; episodes: Episode[] }> {
  const q = new URLSearchParams({ limit: String(limit), offset: String(offset), search });
  return jfetch(`/api/memory/episodes?${q.toString()}`);
}

export async function editEpisode(
  episodeId: string,
  content: string,
): Promise<{ ok: boolean; episode_id?: string; error?: string }> {
  return jfetch(`/api/memory/episodes/${encodeURIComponent(episodeId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
}

export async function deleteEpisode(
  episodeId: string,
): Promise<{ ok: boolean; episode_id?: string; error?: string }> {
  return jfetch(`/api/memory/episodes/${encodeURIComponent(episodeId)}`, {
    method: 'DELETE',
  });
}

// ── Facts ──────────────────────────────────────────────────────────────────

export async function listFacts(
  search = '',
  limit = 50,
  offset = 0,
): Promise<{ ok: boolean; count: number; total: number; facts: Fact[] }> {
  const q = new URLSearchParams({ limit: String(limit), offset: String(offset), search });
  return jfetch(`/api/memory/facts?${q.toString()}`);
}

export async function pinFact(
  fact: string,
  reason = '',
  factId = '',
): Promise<{ ok: boolean; status?: string; error?: string; total_pinned?: number }> {
  return jfetch('/api/memory/pin', {
    method: 'POST',
    body: JSON.stringify({ fact, reason, fact_id: factId }),
  });
}

export async function unpinFact(
  factId = '',
  fact = '',
): Promise<{ ok: boolean; removed?: number; total_pinned?: number; error?: string }> {
  return jfetch('/api/memory/pin', {
    method: 'DELETE',
    body: JSON.stringify({ fact_id: factId, fact }),
  });
}

export async function listPins(): Promise<{ ok: boolean; count: number; pinned: PinnedFact[] }> {
  return jfetch('/api/memory/pins');
}

// ── Engram ─────────────────────────────────────────────────────────────────

export async function listEngramTables(): Promise<{ ok: boolean; tables: EngramTableMeta[] }> {
  return jfetch('/api/engram/list');
}

export async function getEngramStats(table: string, topK = 20): Promise<EngramStats> {
  const q = new URLSearchParams({ table, top_k: String(topK) });
  return jfetch(`/api/engram/stats?${q.toString()}`);
}
