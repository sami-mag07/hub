// Blasen auf ein Raster legen, das sie nie überlappen lässt, und mit einem
// Jitter aus dem Hash der ID verschieben, damit es organisch aussieht und bei
// jedem Laden gleich bleibt. Neue Blasen suchen sich über den Hash eine freie
// Zelle, die anderen bleiben, wo sie waren.

export type Tier = 'L' | 'M' | 'S'

export interface Item {
  id: string
  tier: Tier
}

export interface Placed {
  id: string
  d: number
  ax: number
  ay: number
  amp: number
  w1: number
  w2: number
  p1: number
  p2: number
}

export function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// Kleiner seedbarer Zufall (mulberry32), damit der Jitter je ID stabil ist.
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GAP = 18

export function diameters(width: number): Record<Tier, number> {
  if (width < 1024) return { L: 112, M: 92, S: 76 }
  return { L: 148, M: 116, S: 92 }
}

export function computeLayout(items: Item[], W: number, H: number): Placed[] {
  const n = items.length
  if (!n || W <= 0 || H <= 0) return []
  const base = diameters(W)
  const padX = Math.min(48, W * 0.06)
  const padY = Math.min(48, H * 0.08)
  const innerW = W - 2 * padX
  const innerH = H - 2 * padY

  let cols = Math.max(1, Math.min(n, Math.round(Math.sqrt((n * innerW) / innerH))))
  let rows = Math.ceil(n / cols)
  // Kein Rasterfeld ohne Nutzer, sonst ist die letzte Zeile halb leer und es
  // wirkt wie ein Fehler statt wie ein Schwarm.
  while (cols > 1 && (cols - 1) * rows >= n) cols--
  rows = Math.ceil(n / cols)

  const cellX = innerW / cols
  const cellY = innerH / rows
  const maxD = Math.max(...items.map((i) => base[i.tier]))
  const scale = Math.min(1, Math.min(cellX, cellY) / (maxD + GAP))

  const cells = cols * rows
  const taken = new Array<boolean>(cells).fill(false)
  const out: Placed[] = []
  for (const it of items) {
    const h = hash32(it.id)
    let c = h % cells
    while (taken[c]) c = (c + 1) % cells
    taken[c] = true
    const col = c % cols
    const row = Math.floor(c / cols)
    const d = Math.round(base[it.tier] * scale)
    const r = rng(h)
    const freeX = Math.max(0, (cellX - d) / 2 - 4)
    const freeY = Math.max(0, (cellY - d) / 2 - 4)
    const jx = (r() * 2 - 1) * freeX * 0.55
    const jy = (r() * 2 - 1) * freeY * 0.55
    const amp = Math.min(14, Math.max(0, Math.min(freeX - Math.abs(jx), freeY - Math.abs(jy))))
    out.push({
      id: it.id,
      d,
      ax: padX + (col + 0.5) * cellX + jx,
      ay: padY + (row + 0.5) * cellY + jy,
      amp,
      w1: 0.12 + r() * 0.12,
      w2: 0.1 + r() * 0.12,
      p1: r() * Math.PI * 2,
      p2: r() * Math.PI * 2,
    })
  }
  return out
}
