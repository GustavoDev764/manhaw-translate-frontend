import type { NoteKind } from '../api'

export const NOTE_KINDS: Record<NoteKind, { label: string; short: string; pin: string; chip: string }> = {
  illegible: {
    label: 'Texto ilegível',
    short: 'Ilegível',
    pin: 'bg-amber-500 text-white',
    chip: 'border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  english: {
    label: 'Ainda em inglês',
    short: 'Inglês',
    pin: 'bg-rose-600 text-white',
    chip: 'border-rose-600/60 bg-rose-600/10 text-rose-600 dark:text-rose-400',
  },
  meaning: {
    label: 'Frase sem sentido',
    short: 'Sentido',
    pin: 'bg-violet-600 text-white',
    chip: 'border-violet-600/60 bg-violet-600/10 text-violet-600 dark:text-violet-400',
  },
  other: {
    label: 'Outro problema',
    short: 'Outro',
    pin: 'bg-sky-600 text-white',
    chip: 'border-sky-600/60 bg-sky-600/10 text-sky-600 dark:text-sky-400',
  },
}

export const KIND_ORDER: NoteKind[] = ['illegible', 'english', 'meaning', 'other']

export const byPosition = <T extends { chapter: string; page: string; y: number }>(a: T, b: T) =>
  a.chapter.localeCompare(b.chapter) || a.page.localeCompare(b.page) || a.y - b.y
