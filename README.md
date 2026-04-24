# chimere-studio

**Local-first AI workspace.** One native binary, one local runtime, zero
cloud calls. Tauri 2 desktop shell (Linux / macOS / Windows) + Next.js 14
inside; Android Compose Multiplatform planned. Points at any
OpenAI-compatible endpoint; default target is
[chimere-odo](https://github.com/AIdevsmartdata/chimere-odo) on
`127.0.0.1:8084/v1`, which in turn routes to
[chimere-server](https://github.com/AIdevsmartdata/chimere-server) running
Qwen3.5-35B-A3B RAMP (~90 tok/s on a 16 GB consumer GPU).

```
 ┌────────────────────┐       ┌─────────────────────┐       ┌────────────────────┐
 │  chimere-studio    │       │  chimere-odo        │       │  chimere-server    │
 │  Tauri 2 + Next14  │ ────► │  :8084 routing +    │ ────► │  :8081 Rust/ik_llm │
 │  desktop binary    │       │  pipelines + gate   │       │  NativeScheduler   │
 │                    │       └─────────────────────┘       └────────────────────┘
 │  optional:         │
 │  ├─ STT :8087 ─────►  Parakeet (local)
 │  ├─ TTS :5005 ─────►  Piper / Orpheus (optional)
 │  └─ MCP :9095 ─────►  chimere-mcp (Graphiti + Engram bridge)
 └────────────────────┘
```

Part of the [Chimère](https://github.com/AIdevsmartdata) family:

- [chimere](https://github.com/AIdevsmartdata/chimere) — Rust inference engine (MTP / EAGLE / RAMP)
- [chimere-server](https://github.com/aidevsmartdata/chimere-server) — HTTP wrapper + multi-slot scheduler
- [chimere-odo](https://github.com/aidevsmartdata/chimere-odo) — routing, pipelines, quality gate (backend of choice)
- **chimere-studio** (this repo) — desktop + mobile UI
- [ramp-quant](https://github.com/AIdevsmartdata/ramp-quant) — mixed-precision quantization pipeline
- [ik_llama.cpp](https://github.com/AIdevsmartdata/ik_llama.cpp) — fork with sm_120 + Mamba-2/GDN backports
- Models on HF — <https://huggingface.co/Kevletesteur>

---

## Why chimere-studio exists

Most "AI client" apps in 2026 ship three things we do not want:

1. **A cloud dependency** — even the ones that *can* point at a local
   model open a subscription flow on first run.
2. **Electron** — 200 MB+ binaries that leak the Chromium attack surface
   into every machine they touch.
3. **A product philosophy built around acquisition** — tutorials,
   onboarding funnels, upsell dialogs, marketplaces.

chimere-studio is the opposite of all three. The binary is <10 MB
(Tauri 2, native WebView), the only network traffic on a fresh install
goes to the endpoint you configure in Settings, and the home screen is a
single textarea with the prompt "De quoi on parle ?" — no tutorial, no
onboarding, the app demonstrates itself by working.

The target user is a single developer or clinician on their own machine,
with their own GGUF model, using their own voice. The rest of the
Chimère stack — ODO routing, RAMP quantization, Mamba-2 inference —
exists to make that machine-plus-human pair competitive with cloud
assistants on real tasks (code, clinical reasoning, research). Studio is
the window.

---

## Features

### Desktop shell — Tauri 2

- **Tauri 2** Rust runtime, native WebView (WebKit on Linux/macOS,
  WebView2 on Windows). Binary size on Linux release: <10 MB, ~25× lighter
  than an Electron equivalent.
- **Two plugins loaded**: `tauri-plugin-shell` (used only for
  opening external URLs from assistant replies) and
  `tauri-plugin-fs` (reading user-selected files for doc-QA flows).
- **Single `main` window**, 1200×800 default, 900×600 minimum. Standard
  decorations, no custom chrome. Native menus where the platform
  expects them.
- **Security capabilities** scoped by
  `src-tauri/capabilities/default.json` — window control, shell open,
  filesystem read. No `http`, no `clipboard-all`, no `notification`.

### Frontend — Next.js 14 App Router

- **Static export** (`next build && out/`) served by Tauri as the
  frontend. No Node runtime at runtime.
- **Three pages**: `/` (home, single textarea), `/chat` (streaming chat +
  artefacts + voice), `/memory` (memory inspector),
  `/settings` (backend URL and MCP URL).
- **Tailwind CSS v3**, dark mode by default, shadcn-style primitives
  (`clsx` + `tailwind-merge` + `class-variance-authority`), lucide-react
  icons.
- **Zustand** for the artefacts store. No Redux, no React Query.

### OpenAI-compatible client with streaming

- Plain `fetch` + `ReadableStream` reader, no SDK dependency. The chat
  page consumes `POST /chat/completions` with `stream: true` and renders
  `choices[0].delta.content` and `choices[0].delta.reasoning_content`
  incrementally.
- **Reasoning UI** — Qwen3.5's `<think>` blocks surface as a collapsible
  "Raisonnement" section with a brain icon. Default collapsed; users can
  open it per-message. While thinking, the placeholder reads
  "Raisonne…" and flips to the final content once tokens switch.
- `max_tokens` defaults to 16 384 on the chat view (gives ODO's
  `FORCE_THINK=1` enough headroom) and 4 096 on the voice overlay
  (latency-sensitive).

### Voice overlay — Granola-style

`components/voice/VoiceOverlay.tsx` is a full-screen black canvas with a
live waveform driven by mic RMS and a single state pill
("écoute" / "transcrit" / "réfléchit" / "répond").

- **VAD** — RMS-based detector in `VADDetector.ts`, pure Web Audio
  `AnalyserNode`, no model inference. Tunables: 0.02 voice threshold,
  1.5 s silence hang, 400 ms minimum voiced duration before auto-stop.
- **STT** — uploads the recorded blob to an OpenAI
  `/v1/audio/transcriptions`-compatible server, default
  `127.0.0.1:8087/v1` (Parakeet TDT v3 multilingual on our station). MIME
  auto-picked from `MediaRecorder.isTypeSupported`; Parakeet ffmpeg-
  normalises so webm/opus/ogg/mp4 all work.
- **LLM turn** — streams `/chat/completions` with the full conversation
  history and renders the assistant reply live in the overlay.
- **TTS (optional)** — if `localStorage.chimere:tts` is set (e.g.
  `http://127.0.0.1:5005/v1` for `openai-edge-tts` or a `piper-server`),
  the overlay plays the reply back. Silently skipped when unset.
- **Full cleanup** on close — `MediaStream` tracks stopped,
  `MediaRecorder` stopped, AbortController aborts the fetch,
  AudioContext disposed.

### Memory inspector

`/memory` has three tabs that talk to the `chimere-mcp` REST bridge
(default `127.0.0.1:9095`):

- **Épisodes** — Graphiti (Neo4j) episodes, editable inline, with
  search, "pin as fact", and delete. PATCH/DELETE via `/api/memory/episodes/<id>`.
- **Faits** — relations extracted by Graphiti, pin/unpin, filterable.
  Pinned facts are persisted by the bridge for session-survival.
- **Engram** — read-only inspector of the n-gram Engram tables
  (`~/.openclaw/data/engram/*.engr`). Shows order, entries, load
  factor, total frequency, top-20 n-grams with share bars, and a
  decay badge (`fresh / warm / cold`) based on the last rebuild
  timestamp. Editing requires re-ingest via `engram_ingest.py` on the
  server side.

All three tabs are local-only — no data leaves the machine. If the MCP
bridge is not running, the page surfaces a per-tab error and the rest
of the app keeps working.

### Artefacts (MVP)

The chat renderer splits fenced code blocks into first-class artefacts
via `components/artifacts/MessageContent.tsx`:

- **Python** — executes in a shared Pyodide worker (single download
  cached across component instances). Stdout/stderr live, matplotlib
  figures inlined as base64 PNGs, `repr()` of the last expression, run /
  re-run / error panel. Autosaves result per artefact in the Zustand
  store.
- **Mermaid** — client-side render into SVG; zoom-friendly.
- **JavaScript** — rendered inline only (explicitly **not** executed, to
  avoid polluting `window`).

Artefacts are pushed to a right-hand split panel; when any artefact is
active, the chat column narrows to 50 %.

### Backend-agnostic

Chimère Studio does not care what answers at the other end of
`/chat/completions`. Default is the Chimère stack
(ODO → chimere-server → Qwen3.5-35B RAMP), but anything that speaks
OpenAI works:

| backend URL                          | comment                                  |
|--------------------------------------|------------------------------------------|
| `http://127.0.0.1:8084/v1` (default) | ODO — routing + pipelines + quality gate |
| `http://127.0.0.1:8081/v1`           | chimere-server direct (bypass ODO)       |
| `http://127.0.0.1:8080/v1`           | vLLM / any local OpenAI-compat server    |
| `https://api.openai.com/v1`          | works, but then it's not local-first     |

The backend URL lives in `localStorage.chimere:backend` and is the only
editable field in `/settings` (plus the MCP bridge URL).

### No telemetry, no marketplace

Explicit non-features:

- No analytics. No crash reporter. No "anonymous usage stats".
- No marketplace, no "install a skill", no plugin store.
- No teams, no sharing, no cloud sync.
- No image generation. No video generation.
- No onboarding tutorial.
- No forced account.

If you want any of these, the code is in `src/` — fork and add them.

---

## Quick start

### Linux (Ubuntu 24.04+)

```bash
# System dependencies (Tauri 2 + WebKit)
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
  libglib2.0-dev libgdk-pixbuf2.0-dev libpango1.0-dev libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev libayatana-appindicator3-dev build-essential

# Toolchains
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh    # Rust
curl -fsSL https://get.pnpm.io/install.sh | sh -                  # pnpm (or npm/yarn)

# Clone + install
git clone https://github.com/AIdevsmartdata/chimere-studio
cd chimere-studio
pnpm install
```

### Dev loop

```bash
pnpm tauri dev         # dev with hot reload (Next + Rust rebuild)
pnpm tauri build       # release binary
pnpm tauri build --debug
```

On a fresh Ubuntu 24.04 laptop: `pnpm install` ~40 s, `pnpm tauri build`
~5 min first run (Rust crate graph + Next static export), subsequent
builds <45 s.

### First-run config

1. Start your backend. The default assumes ODO on port 8084:
   ```bash
   systemctl --user start odo.service  # if you installed chimere-odo
   ```
2. Launch the app (`chimere-studio` binary or `pnpm tauri dev`).
3. If the backend URL differs, open `/settings` and edit it. The app
   persists it in `localStorage`.
4. Ask it anything on the home screen.

---

## Usage examples

### 1. Text chat, default stack

Type a question on the home screen → hit Enter → redirected to `/chat`
with the prompt as the first message. Streaming response. If Qwen3.5
decides to think (enabled by `FORCE_THINK=1` in ODO), a "Raisonne…"
pill appears until tokens flip to visible content. Click the pill to
expand the reasoning trace.

### 2. Voice turn

Click the microphone icon in the chat header → full-screen overlay
opens → speak → pause 1.5 s → Parakeet transcribes → ODO answers →
overlay shows the reply → (optional) Piper speaks it. Escape to close.
Spacebar-equivalent mic button at the bottom to force-stop or restart.

### 3. Running Python from assistant output

```
user> Compute the first 10 Fibonacci numbers and plot them.
assistant>
```python
import matplotlib.pyplot as plt
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        yield a
        a, b = b, a + b
seq = list(fib(10))
plt.plot(seq, marker='o')
plt.title("Fibonacci")
plt.show()
seq
```

The fenced block is rendered as a Python artefact. Clicks "Exécuter",
the Pyodide worker (shared, ~10 MB download, cached) runs the code,
the figure shows up in the right-hand panel, `repr(seq)` prints at
the bottom.

### 4. Inspect what the model remembers

Open the Memory tab from the chat header. Three sub-tabs:

- **Épisodes**: search "kiné" → see every conversation turn indexed
  under that keyword. Edit, delete, or pin as a fact.
- **Faits**: see extracted relations like
  `chimere-odo → backend → chimere-server`. Pin the ones you want the
  model to treat as ground truth.
- **Engram**: pick the `kine` table → see its n-gram count, load
  factor, top-20 entries. Decay badge tells you how stale the table
  is.

### 5. Point it at OpenAI or Claude

`/settings` → backend URL `https://api.openai.com/v1` → save. You now
have a local-binary OpenAI client with reasoning support, voice, and
Python artefacts. Add the auth via a proxy in front (Studio does not
handle API keys — keep them out of `localStorage`).

---

## Configuration reference

All settings are persisted in `localStorage` under the `chimere:*`
namespace. `/settings` exposes the first two; the rest are set by hand
via the browser DevTools console.

| key                | default                       | purpose                                    |
|--------------------|-------------------------------|--------------------------------------------|
| `chimere:backend`  | `http://127.0.0.1:8084/v1`    | OpenAI-compatible chat endpoint (ODO).     |
| `chimere:mcp`      | `http://127.0.0.1:9095`       | chimere-mcp REST bridge for Memory pages.  |
| `chimere:stt`      | `http://127.0.0.1:8087/v1`    | OpenAI-compatible STT (Parakeet default).  |
| `chimere:tts`      | *unset*                       | Optional TTS. Unset → overlay stays silent.|

No API key field. If your backend requires one, use a local reverse
proxy that injects the header (same trick that works for Claude Code
against ODO).

---

## Architecture highlights

### Why Tauri 2, not Electron

An Electron client for the same three pages comes out around 200 MB
installed, with a Chromium engine and a Node runtime sitting on the
user's machine (and showing up in every security scan). Tauri 2 ships
the platform's existing WebView and a ~10 MB Rust binary. The
frontend is vanilla Next 14 with a static export; the Rust side does
almost nothing — see `src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

That's the whole Rust app. Everything else is TypeScript.

### Why Next 14 / static export

We want the React ergonomics (App Router, server components where they
matter, Tailwind + shadcn style) but zero Node at runtime. `next build`
with `output: export` produces a static `out/` directory, which Tauri
serves. Client components mark themselves `"use client"`; no SSR, no
middleware, no API routes. All dynamic behaviour runs in the browser.

### Backend independence via `chimere:backend`

`lib/memory-api.ts`, `lib/stt_client.ts`, `lib/tts_client.ts` and the
chat + voice pages all pull their base URL from `localStorage`
lazily. Any call can be redirected without rebuilding the binary.
This keeps the app interoperable with the rest of the ecosystem — if
tomorrow `ramp-quant` emits a better model that a new `llama-server`
serves on a different port, editing one string is enough.

### Privacy model

There is no sync layer. There is no cloud anywhere in the paths the
app actually exercises. The only outbound traffic on a default
install:

- The backend URL you configured (default `127.0.0.1:8084`).
- STT upload to `127.0.0.1:8087` if you use the voice overlay.
- MCP calls to `127.0.0.1:9095` if you open `/memory`.
- The Pyodide download (`/pyodide-worker.js` served from the app
  itself — already bundled).

If a page starts calling a domain you did not configure, that's a
bug; open an issue.

---

## Limitations

- **Voice overlay is MVP.** The RMS-VAD works but can false-trigger on
  AC hum; if that becomes a problem, swap in Silero VAD (roadmap).
  The Pyodide artefact is explicit-run only — no "agentic" pipeline
  yet.
- **Memory inspector depends on `chimere-mcp`.** Without the bridge
  running on `:9095` the `/memory` page shows errors. The bridge is
  part of the wider Chimère stack (not open-sourced yet as of April
  2026).
- **No multi-conversation.** The chat page has no sidebar of past
  conversations. Refreshing the page drops history. This is by
  design right now — persistence lives in Graphiti episodes via the
  MCP bridge — but a richer UI is on the roadmap.
- **No streaming in the voice overlay for TTS.** We wait for the
  full LLM reply before kicking off the TTS call. A chunked variant
  (sentence-wise) is on the list.
- **Linux-first.** macOS and Windows builds are expected to work out
  of the Tauri build but are not CI-tested yet. WebKit2GTK 4.1 is the
  Linux baseline (Ubuntu 24.04+).
- **Android port not started.** The `chimere-core` FFI (see
  `chimere-mobile` in the stack) targets ARM64 local inference; the
  Compose Multiplatform UI port is roadmap.

---

## Roadmap

Near-term (Q2 2026):

- [ ] Silero VAD + neural speech-end detection in `VoiceOverlay`.
- [ ] Sentence-chunked TTS streaming for <300 ms time-to-first-audio.
- [ ] Conversation list in the chat sidebar, backed by Graphiti
  episodes.
- [ ] React live-preview artefact (React / JSX in a sandboxed iframe).
- [ ] Packaged macOS + Windows CI builds via
  `tauri-action` on the CI runner.

Medium-term (Q3 2026):

- [ ] Android port via Compose Multiplatform + `chimere-core` FFI
  (ARM64 local inference, same mental model as the desktop app).
- [ ] Full memory-inspector editing (unpin, reparent episodes,
  bulk-delete) now that the MCP bridge APIs settled.
- [ ] Drag-and-drop file ingest → `doc_qa` route on ODO (already
  supported backend-side — UI missing).

---

## Development setup

```bash
git clone https://github.com/AIdevsmartdata/chimere-studio
cd chimere-studio
pnpm install
pnpm tauri dev
```

Project layout:

```
app/                   # Next.js 14 App Router
  layout.tsx           # root layout
  page.tsx             # home — single textarea
  chat/page.tsx        # streaming chat + reasoning toggle + voice trigger
  memory/page.tsx      # three-tab memory inspector
  settings/page.tsx    # backend + MCP URL
  globals.css

components/
  artifacts/           # MessageContent, CodeBlock, PythonArtifact (Pyodide),
                       # MermaidArtifact, ArtifactsPanel
  memory/              # EpisodesTab, FactsTab, EngramTab
  voice/               # VoiceOverlay, VADDetector

lib/
  artifacts-store.ts   # Zustand store for live artefacts
  memory-api.ts        # chimere-mcp REST client (episodes/facts/engram)
  stt_client.ts        # mic + MediaRecorder + OpenAI-compat STT upload
  tts_client.ts        # OpenAI-compat TTS (optional, silent if unset)

src-tauri/
  src/main.rs          # 9 lines: shell + fs plugins, generate_context
  tauri.conf.json      # single 1200×800 window, no custom chrome
  capabilities/
    default.json       # window + shell + fs permissions (no http, no clipboard)
  Cargo.toml
  build.rs
  icons/               # PNG icons bundled into the release

public/                # static assets served by Next (Pyodide worker, fonts)
docs/screenshots/      # README screenshots
```

### Adding a new page

1. Create `app/my-page/page.tsx` with `"use client"` at the top.
2. Link to it from the `/chat` header (that's the main navigation
   spine).
3. Ship — no route config, no build step, App Router picks it up.

### Adding a new artefact kind

1. Extend `ArtifactKind` in `lib/artifacts-store.ts`.
2. Add a detector branch in `components/artifacts/MessageContent.tsx`
   to wrap the right fenced language into your new kind.
3. Add a renderer under `components/artifacts/` and wire it into
   `ArtifactsPanel.tsx`.

### Swapping the STT / TTS backend

Both clients read their base URL from `localStorage` at call time.
Set `chimere:stt` (or `chimere:tts`) from DevTools or extend
`/settings` to expose them. Any OpenAI `/v1/audio/transcriptions`
(resp. `/v1/audio/speech`) compatible server works.

---

## License

MIT. See `LICENSE`.

Copyright (c) 2026 Kevin Remondière and the Chimère contributors.

---

**Part of the Chimère local-first stack.** Built on the belief that
your AI assistant should run on *your* hardware, with *your* data, in
*your* vocabulary. No teams, no cloud, no telemetry.
