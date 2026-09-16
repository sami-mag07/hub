# The Hub for agents

Any terminal or agent (Claude Code on a Mac, a script on the VPS) can read and write the Hub with a token. No cookie, no browser.

Base URL: `https://hub.5.45.109.195.sslip.io`
Header on every call: `Authorization: Bearer $HUB_AGENT_TOKEN`
Tokens live in `/opt/hub/.env` on the VPS as `HUB_AGENT_TOKENS=sami:...,malek:...`. The name before the colon becomes the author of everything the agent writes ("sami (agent)").

## Read

- `GET /api/agent/status` — everything that is active (projects, pinned, signed-up hackathons), sorted by the next start: dates, deadline with day counts, description, tracks with notes, open tasks, contacts, last comments, news, and `missing` (what the entry still lacks: description, tracks, links, tasks). Start here.
- `GET /api/agent/whoami` — which name your token carries.
- `GET /api/entries` — short list of all entries; `GET /api/entries/:id` — one entry in full.

## Write

Every change is `POST /api/entries/:id/<op>` with a JSON body. Send `version` from the last read to avoid overwriting someone: on a stale version you get `409` with the fresh entry; re-read and retry.

| op | body |
|---|---|
| `tasks/add` | `title` (required), `description`, `status` todo/doing/done, `assignee`, `due` YYYY-MM-DD, `label` Tech/Pitch/Orga/Outreach/Admin, `priority` high/medium/low |
| `tasks/update` | `taskId` plus any of the fields above |
| `tasks/move` | `taskId`, `status`, `beforeId` or null |
| `tasks/remove` | `taskId` |
| `tracks/add` | `name` (required), `description`, `notes` |
| `tracks/update` | `trackId` plus any of `name`, `description`, `notes` |
| `comments/add` | `text` |
| `contacts/add` | `name` (required), `role`, `channel`, `status` open/contacted/replied, `note` |
| `links/add` | `label`, `url`, `type` registration/github/pitch/miro/other |
| `field` | `field` one of `info.description`, `info.prizes`, `info.windows`, `info.cost`, `news.query` (projects also `name`, `link`, `dates.text`, `location`, `deadline`), `value` |
| `pin` | `pinned` true/false |
| `enrich` | empty body: the Hub reads the entry's website and fills empty fields, tracks and links (one call per entry per 10 minutes) |
| `news/refresh` | empty body: fetches news via web search |
| `signup` | `status` beworben or offen: marks the hackathon as signed up in the tracker in Emil |

Projects: `POST /api/entries` with `{ "kind": "project", "name": "...", "link": "https://..." }`.

## Example

```bash
curl -s -H "Authorization: Bearer $HUB_AGENT_TOKEN" https://hub.5.45.109.195.sslip.io/api/agent/status | jq '.entries[] | {name, daysToStart, missing, openTasks: (.openTasks | length)}'

curl -s -H "Authorization: Bearer $HUB_AGENT_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Book train to Garching","assignee":"Malek","due":"2026-11-20","label":"Orga","priority":"medium"}' \
  https://hub.5.45.109.195.sslip.io/api/entries/<id>/tasks/add
```

Limits: 120 requests per minute per IP. Reading a website: 20 per hour in total. Searches: 30 per hour in total.
