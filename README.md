# The Hub

Hackathon portal for Sami and Malek. Live at https://hub.5.45.109.195.sslip.io.

One shared password (ask Sami), then your name. Home shows floating bubbles: what we signed up for and our projects. Sign up lists open hackathons in Germany and remote, Reach out searches new ones and keeps sponsors, mentors and partners. Every bubble opens a board: About, Tracks with our notes, Kanban, Outreach, Comments, News. Bubbles read their own website and fill the board; the tracker in Emil (Sami's assistant) is the source for hackathon dates and status.

## Start here (Malek)

1. Open the link above, enter the password, pick "Malek".
2. Open the Google Accessibility Hackathon bubble (23./24.09.) and the Cursor Hackathon bubble (17.09.): tracks, notes, outreach and links are there.
3. Your terminal talks to the Hub too: get your token from Sami (it is the `malek:` value of `HUB_AGENT_TOKENS` in `/opt/hub/.env` on the VPS), then

```bash
echo 'export HUB_AGENT_TOKEN=<your token>' >> ~/.zshenv
cp -r skills/hub ~/.claude/skills/hub   # Claude Code skill: "was steht im hub", "trag im hub ein"
curl -s -H "Authorization: Bearer $HUB_AGENT_TOKEN" https://hub.5.45.109.195.sslip.io/api/agent/status | jq '.entries[] | {name, daysToStart, missing}'
```

The full API for agents is in `docs/agent-api.md`. Anything an agent writes carries your name.

## Develop

```bash
npm install
cp .env.example .env        # set HUB_PASSWORD, leave the rest empty for local work
node scripts/seed-dev.mjs   # example bubbles
npm run server              # API on 127.0.0.1:8340
npm run dev                 # Vite on 5180, proxies /api
npm test
```

Deploy (Sami only): `./deploy.sh` builds on the Mac and swaps the container on the VPS. Details, decisions and gotchas: `CLAUDE.md`.

## Where things are

- `src/` React frontend (bubbles in `src/bubbles`, board in `src/board`)
- `server/` Node server without packages: auth, store (JSON per entry), ops, tracker sync with Emil, website reader via Claude, logo hunt, agent API
- `shared/near.mjs` what counts as reachable (Germany plus remote)
- `docs/agent-api.md` contract for terminals and agents
- `skills/hub` Claude Code skill for the Hub
