---
name: hub
description: The Hub, das Hackathon-Portal von Sami und Malek (hub.5.45.109.195.sslip.io), aus dem Terminal lesen und pflegen. Stand aller aktiven Hackathons und Projekte holen, Aufgaben anlegen, Track-Notizen schreiben, Kommentare hinterlassen, Webseite lesen lassen. Triggert bei "hub", "was steht im hub", "trag im hub ein", "aufgabe im hub", "was fehlt noch für <hackathon>", "hackathon stand".
---

# The Hub aus dem Terminal

Token liegt in der Umgebung als `HUB_AGENT_TOKEN` (Samis Token; Malek bekommt seinen eigenen).
Fehlt er: `ssh root@5.45.109.195 grep HUB_AGENT_TOKENS /opt/hub/.env` zeigt `sami:...,malek:...`, den eigenen Wert in `~/.zshenv` als `export HUB_AGENT_TOKEN=...` ablegen. Nie in Dateien im Repo schreiben.

Base: `https://hub.5.45.109.195.sslip.io`, Header `Authorization: Bearer $HUB_AGENT_TOKEN`.

## Ablauf

1. Immer zuerst `GET /api/agent/status` holen. Antwort: aktive Einträge mit `daysToStart`, `daysToDeadline`, `tracks` (mit `notes`), `openTasks`, `contacts`, `lastComments`, `news` und `missing` (was noch fehlt: description, tracks, links, tasks).
2. Was Sami fragt, aus dieser Antwort beantworten: Stand, nächste Termine, offene Aufgaben je Person, was einem Hackathon noch fehlt.
3. Änderungen als Operation: `POST /api/entries/<id>/<op>` mit JSON-Body, optional `version` aus dem letzten Lesen. Bei 409 neu lesen und wiederholen. Alle Ops, Bodies und Beispiele stehen in `~/Desktop/APP/hub/docs/agent-api.md`.
4. Nach Schreibzugriffen kurz melden, was angelegt wurde (Eintrag, Titel, wer, bis wann).

## Regeln

- Aufgaben: `assignee` ist "Sami" oder "Malek", `due` als YYYY-MM-DD, `label` aus Tech/Pitch/Orga/Outreach/Admin, `priority` high/medium/low.
- Track-Notizen: `tracks/update` mit `trackId` und `notes`. Beschreibungen der Veranstalter nicht überschreiben.
- Kommentare für Absprachen (`comments/add`), nicht für Aufgaben.
- Webseite lesen lassen (`enrich`) nur, wenn `missing` description oder tracks enthält; höchstens einmal je Eintrag und 10 Minuten.
- Nichts löschen und keinen Status im Tracker setzen (`signup`), außer Sami sagt es ausdrücklich.
- Antworten an Sami nach den Regeln aus i-have-adhd: Ergebnis zuerst, kurz.
