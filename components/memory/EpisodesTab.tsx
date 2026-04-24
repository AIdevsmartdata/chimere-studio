"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Pencil, Pin, Search, Trash2, X } from 'lucide-react';
import {
  deleteEpisode,
  editEpisode,
  Episode,
  listEpisodes,
  pinFact,
} from '@/lib/memory-api';

type RowState = {
  editing: boolean;
  draft: string;
  saving: boolean;
  error?: string;
};

export default function EpisodesTab() {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [source, setSource] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const refresh = useCallback(async (q = '') => {
    setLoading(true);
    setError(null);
    try {
      const data = await listEpisodes(q, 100, 0);
      setEpisodes(data.episodes || []);
      setSource(data.source || '');
    } catch (err) {
      setError(String(err));
      setEpisodes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(''); }, [refresh]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    refresh(search.trim());
  };

  const startEdit = (ep: Episode) => {
    setRows((prev) => ({
      ...prev,
      [ep.id]: { editing: true, draft: ep.content, saving: false },
    }));
  };

  const cancelEdit = (id: string) => {
    setRows((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const saveEdit = async (ep: Episode) => {
    const state = rows[ep.id];
    if (!state) return;
    setRows((prev) => ({ ...prev, [ep.id]: { ...state, saving: true } }));
    try {
      const res = await editEpisode(ep.id, state.draft);
      if (!res.ok) {
        setRows((prev) => ({
          ...prev,
          [ep.id]: { ...state, saving: false, error: res.error || 'edit failed' },
        }));
        return;
      }
      setEpisodes((prev) =>
        prev.map((e) => (e.id === ep.id ? { ...e, content: state.draft } : e)),
      );
      cancelEdit(ep.id);
    } catch (err) {
      setRows((prev) => ({
        ...prev,
        [ep.id]: { ...state, saving: false, error: String(err) },
      }));
    }
  };

  const onDelete = async (ep: Episode) => {
    if (!confirm(`Supprimer l'épisode « ${ep.name} » ? Action irréversible.`)) return;
    try {
      const res = await deleteEpisode(ep.id);
      if (!res.ok) {
        alert(`Erreur: ${res.error || 'delete failed'}`);
        return;
      }
      setEpisodes((prev) => prev.filter((e) => e.id !== ep.id));
    } catch (err) {
      alert(`Erreur: ${String(err)}`);
    }
  };

  const onPin = async (ep: Episode) => {
    try {
      const res = await pinFact(ep.name + ': ' + ep.content.slice(0, 240), 'épisode épinglé', ep.id);
      if (res.ok) {
        alert('Épinglé — l\'épisode sera protégé des passes de decay.');
      } else {
        alert(`Erreur: ${res.error || 'pin failed'}`);
      }
    } catch (err) {
      alert(`Erreur: ${String(err)}`);
    }
  };

  const header = useMemo(() => (
    <form onSubmit={onSearch} className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher dans les épisodes"
          className="w-full rounded-md bg-secondary/50 border border-border pl-8 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <button
        type="submit"
        className="rounded-md bg-primary px-3 py-2 text-primary-foreground text-sm"
      >
        Filtrer
      </button>
    </form>
  ), [search]);

  return (
    <div className="space-y-4">
      {header}
      <div className="text-xs text-muted-foreground">
        Source: <span className="font-mono">{source || '—'}</span>
        {' · '}
        {loading ? 'Chargement…' : `${episodes.length} épisode(s)`}
      </div>
      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}
      {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      <ul className="space-y-3">
        {episodes.map((ep) => {
          const row = rows[ep.id];
          const editing = row?.editing;
          return (
            <li
              key={ep.id}
              className="rounded-lg border border-border bg-secondary/20 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{ep.name || '(sans titre)'}</span>
                    {ep.source && (
                      <span className="rounded-sm bg-secondary/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {ep.source}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {ep.created_at || '—'}
                    {' · '}
                    <span className="font-mono">{ep.id.slice(0, 10)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!editing && (
                    <>
                      <button
                        onClick={() => onPin(ep)}
                        title="Épingler (protège du decay)"
                        className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <Pin className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => startEdit(ep)}
                        title="Éditer"
                        className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDelete(ep)}
                        title="Supprimer"
                        className="rounded p-1 text-muted-foreground hover:bg-red-500/20 hover:text-red-200"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  {editing && (
                    <>
                      <button
                        onClick={() => saveEdit(ep)}
                        disabled={row?.saving}
                        title="Sauvegarder"
                        className="rounded p-1 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"
                      >
                        {row?.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => cancelEdit(ep.id)}
                        title="Annuler"
                        className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="mt-2">
                {editing ? (
                  <textarea
                    value={row.draft}
                    onChange={(e) =>
                      setRows((prev) => ({
                        ...prev,
                        [ep.id]: { ...row, draft: e.target.value },
                      }))
                    }
                    className="w-full min-h-24 resize-y rounded-md bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                ) : (
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                    {ep.content || '(vide)'}
                  </p>
                )}
                {row?.error && (
                  <div className="mt-1 text-xs text-red-300">{row.error}</div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!loading && episodes.length === 0 && (
        <div className="rounded-md border border-dashed border-border/60 bg-secondary/10 px-4 py-6 text-sm text-muted-foreground">
          Aucun épisode. Les dialogues seront ingérés automatiquement dès que Graphiti (Neo4j) sera actif.
        </div>
      )}
    </div>
  );
}
