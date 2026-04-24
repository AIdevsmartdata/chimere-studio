"use client";

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Snowflake, Flame, CircleAlert } from 'lucide-react';
import {
  EngramStats,
  EngramTableMeta,
  getEngramStats,
  listEngramTables,
} from '@/lib/memory-api';

function DecayBadge({ hint, ageDays }: { hint?: string; ageDays: number | null }) {
  const map: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    fresh: {
      icon: <Flame className="h-3.5 w-3.5" />,
      label: 'Frais',
      cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    },
    warm: {
      icon: <CircleAlert className="h-3.5 w-3.5" />,
      label: 'Tiède',
      cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    },
    cold: {
      icon: <Snowflake className="h-3.5 w-3.5" />,
      label: 'Froid',
      cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    },
    unknown: {
      icon: <CircleAlert className="h-3.5 w-3.5" />,
      label: 'Inconnu',
      cls: 'bg-secondary/40 text-muted-foreground border-border',
    },
  };
  const key = hint && map[hint] ? hint : 'unknown';
  const def = map[key];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${def.cls}`}
      title={ageDays !== null ? `${ageDays.toFixed(1)} j depuis dernier rebuild` : undefined}
    >
      {def.icon}
      {def.label}
      {ageDays !== null && <span className="text-[10px] opacity-80">· {ageDays.toFixed(1)} j</span>}
    </span>
  );
}

export default function EngramTab() {
  const [tables, setTables] = useState<EngramTableMeta[]>([]);
  const [active, setActive] = useState<string>('kine');
  const [stats, setStats] = useState<EngramStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await listEngramTables();
        setTables(res.tables || []);
        const firstExisting = res.tables?.find((t) => t.exists)?.name;
        if (firstExisting) setActive(firstExisting);
      } catch (err) {
        setError(String(err));
      }
    })();
  }, []);

  const loadStats = useCallback(async (t: string) => {
    setLoading(true);
    setError(null);
    setStats(null);
    try {
      const res = await getEngramStats(t, 20);
      setStats(res);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(active); }, [active, loadStats]);

  const maxShare = stats?.top_ngrams?.reduce((m, x) => Math.max(m, x.share), 0) || 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tables.map((t) => (
          <button
            key={t.name}
            onClick={() => setActive(t.name)}
            disabled={!t.exists}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              active === t.name
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-secondary/40 text-foreground hover:bg-secondary'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {t.name}
            <span className="ml-2 text-xs opacity-70">{t.size_mb.toFixed(1)} MB</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}

      {stats && stats.ok && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-border bg-secondary/20 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Ordre</div>
              <div className="mt-1 text-lg font-medium">{stats.order}</div>
            </div>
            <div className="rounded-md border border-border bg-secondary/20 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Entrées</div>
              <div className="mt-1 text-lg font-medium">{stats.entries.toLocaleString('fr-FR')}</div>
            </div>
            <div className="rounded-md border border-border bg-secondary/20 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Charge</div>
              <div className="mt-1 text-lg font-medium">
                {(stats.load_factor * 100).toFixed(1)}%
              </div>
            </div>
            <div className="rounded-md border border-border bg-secondary/20 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Décroissance</div>
              <div className="mt-1">
                <DecayBadge hint={stats.decay_hint} ageDays={stats.age_days} />
              </div>
            </div>
          </div>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Top n-grammes ({stats.top_ngrams.length}) — lecture seule
              </h2>
              <div className="text-xs text-muted-foreground">
                fréquence totale : {stats.total_frequency.toLocaleString('fr-FR')}
              </div>
            </div>
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium w-12">#</th>
                    <th className="px-3 py-2 font-medium">Part du contexte</th>
                    <th className="px-3 py-2 font-medium w-20 text-right">Fréq.</th>
                    <th className="px-3 py-2 font-medium w-24 text-right">Part</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.top_ngrams.map((ng) => (
                    <tr key={ng.rank} className="hover:bg-secondary/20">
                      <td className="px-3 py-2 font-mono text-muted-foreground">{ng.rank}</td>
                      <td className="px-3 py-2">
                        <div className="h-2 w-full overflow-hidden rounded-sm bg-secondary/40">
                          <div
                            className="h-full bg-primary/70"
                            style={{ width: `${(ng.share / maxShare) * 100}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {ng.count.toLocaleString('fr-FR')}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                        {(ng.share * 100).toFixed(3)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Les n-grammes Engram sont statiques (binaires .engr). L&apos;indicateur de décroissance se
              base sur la date de dernière reconstruction de la table. Pour éditer, reconstruire
              via <code className="font-mono">engram_ingest.py</code>.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
