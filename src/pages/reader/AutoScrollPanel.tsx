import { INTERVALS, SPEED_MAX, SPEED_MIN, type AutoSettings } from './readerStore'

export function AutoScrollPanel({ settings, playing, onChange, onToggle }: { settings: AutoSettings; playing: boolean; onChange: (s: AutoSettings) => void; onToggle: () => void }) {
  const setSpeed = (v: number) => onChange({ ...settings, speed: Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(v))) })
  return (
    <div className="w-[min(92vw,360px)] space-y-3 rounded-xl border border-[var(--reader-border)] bg-[var(--reader-surface)] p-3 text-sm shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">Leitura automática</span>
        <button type="button" onClick={onToggle} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${playing ? 'border border-[var(--reader-border)] hover:bg-white/5' : 'bg-[var(--reader-accent)] text-black'}`}>
          {playing ? 'Pausar' : 'Começar'}
        </button>
      </div>
      <div>
        <div className="mb-1 text-xs text-[var(--reader-muted)]">Intervalo</div>
        <div className="flex flex-wrap gap-1">
          {INTERVALS.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange({ ...settings, interval: i })}
              className={`rounded-md px-2.5 py-1 text-xs tabular-nums ${settings.interval === i ? 'bg-[var(--reader-accent)]/20 text-[var(--reader-accent)]' : 'border border-[var(--reader-border)] text-[var(--reader-muted)] hover:bg-white/5'}`}
            >
              {i === 0 ? 'Contínuo' : `${i}s`}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-[var(--reader-muted)]">
          <span>Velocidade</span>
          <span className="tabular-nums text-[var(--reader-text)]">{settings.speed} px/s</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Mais devagar" onClick={() => setSpeed(settings.speed - 1)} disabled={settings.speed <= SPEED_MIN} className="size-8 rounded-md border border-[var(--reader-border)] hover:bg-white/5 disabled:opacity-30">
            −
          </button>
          <input
            type="range"
            aria-label="Velocidade da leitura automática"
            min={SPEED_MIN}
            max={SPEED_MAX}
            step={1}
            value={settings.speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="h-8 flex-1 accent-[var(--reader-accent)]"
          />
          <button type="button" aria-label="Mais rápido" onClick={() => setSpeed(settings.speed + 1)} disabled={settings.speed >= SPEED_MAX} className="size-8 rounded-md border border-[var(--reader-border)] hover:bg-white/5 disabled:opacity-30">
            +
          </button>
        </div>
      </div>
      <p className="text-xs text-[var(--reader-faint)]">
        {settings.interval === 0
          ? 'Desce sem parar, na velocidade escolhida.'
          : `A cada ${settings.interval}s desce ${settings.speed * settings.interval} px com início e fim suaves, como uma rolagem feita à mão.`}{' '}
        Rolar com o mouse ou o dedo continua funcionando. Espaço pausa e retoma.
      </p>
    </div>
  )
}
