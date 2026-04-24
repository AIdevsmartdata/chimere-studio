# Chimère Studio

Top-tier local-first AI workspace. Desktop (Linux/macOS/Windows) via Tauri 2, mobile Android via Compose Multiplatform (à venir).

Connects to any OpenAI-compatible backend. Default: local ODO (`http://127.0.0.1:8084/v1`) routing to chimere-server.

## Stack

- **Tauri 2** — Rust runtime, native webview (25× plus léger qu'Electron)
- **Next.js 14** — app router, static export
- **Tailwind v3** — styling, dark mode par défaut
- **React 18** — UI
- **lucide-react** — icons

## Quick start

Linux — system deps (Ubuntu 24.04+) :

```bash
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
  libglib2.0-dev libgdk-pixbuf2.0-dev libpango1.0-dev libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev libayatana-appindicator3-dev build-essential
```

Puis :

```bash
pnpm install
pnpm tauri dev       # dev with hot reload
pnpm tauri build     # release binary
```

Debug build : `pnpm tauri build --debug`.

## Backend config

URL backend stockée dans `localStorage` côté WebView. Modifiable via `/settings`.

Par défaut : `http://127.0.0.1:8084/v1` (ODO local).

Pointe vers `http://127.0.0.1:8081/v1` pour aller direct sur chimere-server (skip ODO routing).

## Structure

- `app/` — Next.js 14 app router pages (`/`, `/chat`, `/settings`)
- `src-tauri/` — Rust binary + Tauri config + icons
- `components/ui/` — shadcn-style components (à ajouter via `pnpm dlx shadcn@latest add ...`)

## Design principles

- Pas de marketplace, pas de tiers, pas de teams, pas d'image gen, pas de telemetry
- Pas d'onboarding tutorial — l'app se démontre en faisant
- Voice overlay 3s (à venir, design Granola no-bot)
- Memory inspector éditable (à venir)

## License

MIT
