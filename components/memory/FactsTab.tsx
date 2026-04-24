"use client";

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pin, PinOff, Search } from 'lucide-react';
import { Fact, listFacts, listPins, pinFact, unpinFact, PinnedFact } from '@/lib/memory-api';

export default function FactsTab() {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [pinned, setPinned] = useState<PinnedFact[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (q = '') => {
    setLoading(true);
    setError(null);
    try {
      const [factsRes, pinsRes] = await Promise.all([
        listFacts(q, 200, 0),
        listPins(),
      ]);
      setFacts(factsRes.facts || []);
      setPinned(pinsRes.pinned || []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(''); }, [refresh]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    refresh(search.trim());
  };

  const togglePin = async (f: Fact) => {
    try {
      if (f.pinned) {
        await unpinFact(f.id);
      } else {
        await pinFact(f.fact, 'Pin manuel depuis Memory Inspector', f.id);
      }
      await refresh(search.trim());
    } catch (err) {
      alert(`Erreur: ${String(err)}`);
    }
  };

  const removePin = async (p: PinnedFact) => {
    try {
      if (p.fact_id) {
        await unpinFact(p.fact_id);
      } else {
        await unpinFact('', p.fact);
      }
      await refresh(search.trim());
    } catch (err) {
      alert(`Erreur: ${String(err)}`);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={onSearch} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un fait (sujet, verbe, objet)"
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

      <div className="text-xs text-muted-foreground">
        {loading ? 'Chargement…' : `${facts.length} fait(s) dans le graphe · ${pinned.length} épinglé(s)`}
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {pinned.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Faits épinglés ({pinned.length})
          </h2>
          <ul className="space-y-2">
            {pinned.map((p, i) => (
              <li
                key={(p.fact_id || p.fact) + i}
                className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2"
              >
                <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-foreground/95">{p.fact}</div>
                  {p.reason && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Raison: {p.reason}
                    </div>
                  )}
                  <div className="mt-0.5 text-[10px] text-muted-foreground/80 font-mono">
                    {p.pinned_at}
                  </div>
                </div>
                <button
                  onClick={() => removePin(p)}
                  title="Désépingler"
                  className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <PinOff className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Tous les faits
        </h2>
        {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {!loading && facts.length === 0 && (
          <div className="rounded-md border border-dashed border-border/60 bg-secondary/10 px-4 py-6 text-sm text-muted-foreground">
            Aucun fait extrait pour l&apos;instant. Les relations seront ajoutées
            automatiquement dès que Graphiti sera peuplé (Neo4j actif + épisodes ingérés).
          </div>
        )}
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Sujet</th>
                <th className="px-3 py-2 font-medium">Relation</th>
                <th className="px-3 py-2 font-medium">Objet</th>
                <th className="px-3 py-2 font-medium">Depuis</th>
                <th className="px-3 py-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {facts.map((f) => (
                <tr key={f.id} className="hover:bg-secondary/20">
                  <td className="px-3 py-2 font-medium">{f.subject}</td>
                  <td className="px-3 py-2 text-muted-foreground">{f.predicate}</td>
                  <td className="px-3 py-2">{f.object}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {f.valid_at ? f.valid_at.slice(0, 10) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => togglePin(f)}
                      title={f.pinned ? 'Désépingler' : 'Épingler'}
                      className={`rounded p-1 ${
                        f.pinned
                          ? 'text-amber-300 hover:bg-amber-500/20'
                          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                      }`}
                    >
                      {f.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
