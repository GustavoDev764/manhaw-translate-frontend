
export const SETS = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*?-_=+.:;']

function rand(n: number): number {
  const max = Math.floor(4294967296 / n) * n
  const buf = new Uint32Array(1)
  do crypto.getRandomValues(buf)
  while (buf[0] >= max)
  return buf[0] % n
}

export function generatePassword(length: number): string {
  const all = SETS.join('')
  const out = SETS.map((s) => s[rand(s.length)])
  while (out.length < length) out.push(all[rand(all.length)])
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand(i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out.join('')
}

export function passwordStrength(pw: string): { label: string; color: string; pct: number } {
  const kinds = SETS.filter((s) => [...pw].some((c) => s.includes(c))).length
  if (!pw) return { label: '—', color: 'bg-slate-300', pct: 0 }
  if (pw.length < 8 || kinds < 3) return { label: 'fraca', color: 'bg-failed', pct: 25 }
  if (pw.length < 12 || kinds < 4) return { label: 'média', color: 'bg-queued', pct: 55 }
  if (pw.length < 20) return { label: 'forte', color: 'bg-done', pct: 80 }
  return { label: 'muito forte', color: 'bg-done', pct: 100 }
}

