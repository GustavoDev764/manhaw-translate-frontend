export interface ReadingSpot {
  chapterId: string
  page: number
}

export interface AutoSettings {
  interval: number
  speed: number
}

export const INTERVALS = [0, 1, 2, 3, 4, 5] as const
export const SPEED_MIN = 5
export const SPEED_MAX = 400
export const DEFAULT_AUTO: AutoSettings = { interval: 0, speed: 40 }

const spotKey = (slug: string) => `mt:reader:${slug}`
const AUTO_KEY = 'mt:reader:auto'

function read(key: string): unknown {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as unknown) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    return
  }
}

export function readSpot(slug: string): ReadingSpot | null {
  const v = read(spotKey(slug)) as Partial<ReadingSpot> | null
  return v && typeof v.chapterId === 'string' && Number.isInteger(v.page) ? { chapterId: v.chapterId, page: v.page! } : null
}

export function saveSpot(slug: string, spot: ReadingSpot) {
  write(spotKey(slug), spot)
}

export function readAuto(): AutoSettings {
  const v = read(AUTO_KEY) as Partial<AutoSettings> | null
  const interval = INTERVALS.includes(v?.interval as (typeof INTERVALS)[number]) ? v!.interval! : DEFAULT_AUTO.interval
  const speed = typeof v?.speed === 'number' && v.speed >= SPEED_MIN && v.speed <= SPEED_MAX ? v.speed : DEFAULT_AUTO.speed
  return { interval, speed }
}

export function saveAuto(settings: AutoSettings) {
  write(AUTO_KEY, settings)
}
