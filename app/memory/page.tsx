"use client";

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BookMarked, Brain, Network } from 'lucide-react';
import EpisodesTab from '@/components/memory/EpisodesTab';
import FactsTab from '@/components/memory/FactsTab';
import EngramTab from '@/components/memory/EngramTab';

type TabId = 'episodes' | 'facts' | 'engram';

const TABS: { id: TabId; label: string; icon: React.ReactNode; hint: string }[] = [
  {
    id: 'episodes',
    label: 'Épisodes',
    icon: <BookMarked className="h-4 w-4" />,
    hint: 'Graphiti (Neo4j) — éditable',
  },
  {
    id: 'facts',
    label: 'Faits',
    icon: <Network className="h-4 w-4" />,
    hint: 'Relations extraites — pin/unpin',
  },
  {
    id: 'engram',
    label: 'Engram',
    icon: <Brain className="h-4 w-4" />,
    hint: 'n-grammes — lecture seule',
  },
];

export default function MemoryPage() {
  const [tab, setTab] = useState<TabId>('episodes');
  const router = useRouter();

  const body = useMemo(() => {
    if (tab === 'episodes') return <EpisodesTab />;
    if (tab === 'facts') return <FactsTab />;
    return <EngramTab />;
  }, [tab]);

  return (
    <main className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <div className="text-sm font-medium">Mémoire</div>
        <div className="w-16" />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto w-full px-6 py-6 space-y-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-light">Inspecteur de mémoire</h1>
            <p className="text-sm text-muted-foreground">
              Ce qu&apos;on retient de vous. Modifiez, épinglez, supprimez — tout est local
              (Graphiti/Neo4j + fichiers JSON).
            </p>
          </div>

          <nav className="flex gap-1 rounded-md border border-border bg-secondary/20 p-1 w-fit">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title={t.hint}
                >
                  {t.icon}
                  {t.label}
                </button>
              );
            })}
          </nav>

          <section>{body}</section>
        </div>
      </div>
    </main>
  );
}
