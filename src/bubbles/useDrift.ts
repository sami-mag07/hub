import { useEffect, type RefObject } from 'react'
import type { Placed } from './layout'

// Ein requestAnimationFrame-Loop für alle Blasen. Positionen leben außerhalb
// von React und landen direkt als transform im DOM; React rendert pro Frame
// nichts. Jede Blase wandert auf zwei langsamen Sinuswellen um ihren Anker,
// eine weiche Abstoßung hält Nachbarn auseinander.

interface Body {
  el: HTMLElement
  p: Placed
  x: number
  y: number
  held: boolean
}

const SEPARATION = 10

export function useDrift(fieldRef: RefObject<HTMLElement | null>, placed: Placed[], animate: boolean) {
  useEffect(() => {
    const field = fieldRef.current
    if (!field || !placed.length) return
    const bodies: Body[] = []
    for (const p of placed) {
      const el = field.querySelector<HTMLElement>(`[data-id="${p.id}"]`)
      if (!el) continue
      el.style.width = `${p.d}px`
      el.style.height = `${p.d}px`
      bodies.push({ el, p, x: p.ax, y: p.ay, held: false })
    }
    // Unter dem Zeiger oder mit Fokus bleibt eine Blase stehen, damit man sie trifft.
    const holds: Array<() => void> = []
    for (const b of bodies) {
      const hold = () => (b.held = true)
      const release = () => (b.held = false)
      b.el.addEventListener('pointerenter', hold)
      b.el.addEventListener('pointerleave', release)
      b.el.addEventListener('focusin', hold)
      b.el.addEventListener('focusout', release)
      holds.push(() => {
        b.el.removeEventListener('pointerenter', hold)
        b.el.removeEventListener('pointerleave', release)
        b.el.removeEventListener('focusin', hold)
        b.el.removeEventListener('focusout', release)
      })
    }
    const write = (b: Body) => {
      b.el.style.transform = `translate3d(${(b.x - b.p.d / 2).toFixed(1)}px, ${(b.y - b.p.d / 2).toFixed(1)}px, 0)`
    }
    for (const b of bodies) write(b)
    if (!animate) {
      holds.forEach((off) => off())
      return
    }

    let raf = 0
    let running = true
    const tick = () => {
      if (!running) return
      const t = performance.now() / 1000
      for (const b of bodies) {
        if (b.held) continue
        const tx = b.p.ax + b.p.amp * Math.sin(b.p.w1 * t + b.p.p1)
        const ty = b.p.ay + b.p.amp * Math.sin(b.p.w2 * t + b.p.p2)
        b.x += (tx - b.x) * 0.05
        b.y += (ty - b.y) * 0.05
      }
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i]
          const c = bodies[j]
          const dx = c.x - a.x
          const dy = c.y - a.y
          const dist = Math.hypot(dx, dy) || 0.001
          const min = (a.p.d + c.p.d) / 2 + SEPARATION
          if (dist < min) {
            const push = ((min - dist) / 2) * 0.5
            const nx = dx / dist
            const ny = dy / dist
            a.x -= nx * push
            a.y -= ny * push
            c.x += nx * push
            c.y += ny * push
          }
        }
      }
      for (const b of bodies) write(b)
      raf = requestAnimationFrame(tick)
    }
    const onVisibility = () => {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(raf)
      } else if (!running) {
        running = true
        raf = requestAnimationFrame(tick)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    raf = requestAnimationFrame(tick)
    return () => {
      running = false
      cancelAnimationFrame(raf)
      holds.forEach((off) => off())
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fieldRef, placed, animate])
}
