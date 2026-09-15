import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = path.dirname(fileURLToPath(import.meta.url));

/**
 * Lädt `.env` / `.env.local` in process.env — bewusst ohne Dependency.
 * Bereits gesetzte Variablen (echte Umgebungsvariablen) gewinnen.
 */
export function loadDotEnv(dir = path.resolve(hier, '..')) {
  for (const name of ['.env', '.env.local']) {
    const datei = path.join(dir, name);
    if (!fs.existsSync(datei)) continue;
    for (const zeile of fs.readFileSync(datei, 'utf8').split('\n')) {
      const treffer = zeile.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!treffer) continue;
      const wert = treffer[2].replace(/^(['"])(.*)\1$/, '$2');
      if (process.env[treffer[1]] === undefined) process.env[treffer[1]] = wert;
    }
  }
}
