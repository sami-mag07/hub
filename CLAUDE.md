# The Hub

Hackathon-Portal für Sami und Malek. Login mit gemeinsamem Passwort, dann
schwebende Glas-Blasen (ein Logo je Hackathon oder Projekt), Klick öffnet das
Board mit Overview, Kanban, Outreach, Comments, News. Hackathons kommen aus dem
Programm-Tracker in Emil und werden dort zurückgeschrieben. Oberfläche Englisch.

## Befehle

- `npm run dev` Vite auf 5180, reicht `/api` an 8340 durch
- `npm run server` Node-Server auf 127.0.0.1:8340, liest `.env`
- `node scripts/seed-dev.mjs` Beispiel-Einträge für lokal (nie auf dem Server)
- `npm run typecheck`, `npm run build`, `npm test` (node --test, echte HTTP-Server auf Temp-Ordnern)
- `./deploy.sh` baut auf dem Mac, rsynct dist/ und server/, baut das Image auf dem VPS

## Aufbau

- `src/` React 19 + Vite 8 + Tailwind v4, Tokens in `src/index.css`, kein Router-Paket (`src/lib/router.ts`)
- `src/bubbles/` Layout (Hex-Raster mit Hash-Jitter), Drift (ein rAF-Loop, transform, hält bei Hover), Glas-CSS
- `src/views/` Login, Home (Pille: Sign up / Signed up / Reach out), Board, ReachOut
- `src/board/` Overview, Kanban (dnd-kit), Contacts, Comments, News, EditEntry
- `server/` nur node:http: `http.mjs` (Fehlerformat, Origin-Check, Limits), `auth.mjs`, `store.mjs`, `ops.mjs`, `tracker.mjs`, `news.mjs`, `logos.mjs` (Upload + Logo-Suche), `fetch.mjs` (SSRF-sicherer Fetch, HTML zu Text), `enrich.mjs` (Webseite lesen, Claude zieht Felder), `background.mjs` (Warteschlange: neue und sichtbare Einträge lesen), `routes.mjs` (auch Agent-API)
- `shared/near.mjs` eine Quelle für Client und Server: welche Orte als erreichbar gelten (Deutschland plus Remote)
- `docs/agent-api.md` Vertrag für Terminals und Agenten (Bearer `HUB_AGENT_TOKENS`, `/api/agent/status`); Skill dazu in `~/.claude/skills/hub`
- `data/` (gitignored) JSON je Eintrag, `sessions.json`, `partners.json`, `tracker-cache.json`, `logos/`

## Regeln, die hier gelten

- Vertrag zwischen Client und Server steht in `src/lib/types.ts`; Änderungen nur additiv.
- Jede Änderung an einem Eintrag ist eine Operation `POST /api/entries/:id/<op>` mit `version`; alte Version gibt 409 samt frischem Eintrag. Listen-Ops wiederholt der Client einmal, Textfelder nur, wenn der alte Wert noch stimmt.
- Tracker-eigene Felder (name, link, dates.text, location, deadline, deadlineNote) sind gesperrt, solange die Zeile in Emil existiert. Verschwindet sie, bleibt der Eintrag mit `tracker.missingSince`.
- Fremde URLs holt nur `fetch.mjs`: kein privates Netz (auch nicht per DNS oder Redirect), Limits, nur erwartete Typen. Webseite lesen geht über die claude-code-api auf dem VPS (`CLAUDE_API_URL`, Host-Netz), füllt nur leere Felder.
- Logos: Upload von Hand gewinnt immer, sonst `auto` von der Webseite (apple-touch-icon), sonst Favicon-Kette im Browser.
- Secrets nur in `.env` (lokal) bzw. `/opt/hub/.env` (VPS). Variablen siehe `.env.example`.
- Design: weiß, schwarz, ein Akzent (`--primary`), Rot nur unter 3 Tagen Frist. Keine Emojis, keine Gedankenstriche in sichtbarem Text. Stift-Icon plus Modal statt Inline-Dropdowns. Modal: Schließen links, Primär rechts.

## Emil-Seite

`telegram-agent/web/programme_api.py`: `GET /api/programme/export`, `POST /api/programme/export/status`, `POST /api/programme/export/neu`, alle mit `Authorization: Bearer <HUB_TOKEN>`. Derselbe Token steht in beiden `.env`.

## Entscheidungen

- Vite + Node statt Next.js: der VPS ist knapp an RAM (Emil wurde schon OOM-gekillt), dieser Server läuft unter 100 MB und nutzt das Docker- und Deploy-Muster aus lrs.
- JSON je Eintrag statt SQLite: kleine Diffs, kein Paket, ein kaputter Schreibzugriff kostet einen Eintrag statt alles.
- Polling (5 s Board, 30 s Home) statt SSE: für zwei bis drei Nutzer kein sichtbarer Unterschied, keine langen Verbindungen durch Caddy.
- Blasen als DOM-Buttons mit rAF statt Canvas: echte Buttons, Fokus, Glas per backdrop-filter; bei 25 Blasen und blur 14px läuft es auf dem iPad.

## Gotchas

- Google-s2-Favicons leiten auf `*.gstatic.com` um, deshalb steht der Host in der CSP.
- Automatisierte Klicks (Astro, Playwright) scheitern an driftenden Blasen; per Skript klicken oder `prefers-reduced-motion` setzen.
- Emils `deploy.sh` verlangt einen sauberen Arbeitsbaum.
- Der Container läuft im Host-Netz (Emil und claude-code-api lauschen nur auf 127.0.0.1), deshalb `HOST=127.0.0.1` im Container.
- Neue Ordner müssen in Dockerfile UND deploy.sh (rsync) stehen, sonst startet der Container nicht.
