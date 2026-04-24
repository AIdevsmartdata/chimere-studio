"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export default function Settings() {
  const [backend, setBackend] = useState('');
  const router = useRouter();

  useEffect(() => {
    setBackend(localStorage.getItem('chimere:backend') || 'http://127.0.0.1:8084/v1');
  }, []);

  const save = () => {
    localStorage.setItem('chimere:backend', backend);
    router.back();
  };

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-4 py-3 border-b border-border">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
      </header>
      <div className="flex-1 px-6 py-8">
        <div className="max-w-xl mx-auto space-y-6">
          <h1 className="text-2xl font-light">Settings</h1>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Backend URL (OpenAI-compat)</label>
            <input
              value={backend}
              onChange={(e) => setBackend(e.target.value)}
              className="w-full rounded-md bg-secondary/50 border border-border px-3 py-2"
            />
            <p className="text-xs text-muted-foreground">Défaut : http://127.0.0.1:8084/v1 (ODO local)</p>
          </div>
          <button onClick={save} className="rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm">Sauvegarder</button>
        </div>
      </div>
    </main>
  );
}
