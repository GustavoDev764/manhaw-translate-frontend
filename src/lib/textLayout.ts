export const DEFAULT_FONT_FAMILY = 'ComicNeueBold'

export interface TextBoxGeometry {
  x: number
  y: number
  w: number
  h: number
  rotation: number
}

export interface TextBoxStyle {
  text: string
  size: number
  lineHeight: number
  align: 'left' | 'center' | 'right'
  color: string
  strokeColor: string | null
  strokeWidth: number
}

export interface TextLayout {
  lines: string[]
  step: number
  x: number
  firstY: number
  overflow: boolean
}

const fontSpec = (size: number, family: string) => `${size}px "${family}"`

function wrapLines(measure: (text: string) => number, text: string, width: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\n/)) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (!line || measure(next) <= width) line = next
      else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}

function layoutText(measure: (text: string) => number, box: TextBoxGeometry, style: TextBoxStyle): TextLayout {
  const lines = wrapLines(measure, style.text, box.w)
  const step = style.size * style.lineHeight
  return {
    lines,
    step,
    x: style.align === 'left' ? -box.w / 2 : style.align === 'right' ? box.w / 2 : 0,
    firstY: -((lines.length - 1) * step) / 2,
    overflow: lines.length * step > box.h * 1.15,
  }
}

export function drawTextBox(ctx: CanvasRenderingContext2D, box: TextBoxGeometry, style: TextBoxStyle, family: string): TextLayout {
  ctx.save()
  ctx.translate(box.x + box.w / 2, box.y + box.h / 2)
  if (box.rotation) ctx.rotate((box.rotation * Math.PI) / 180)
  ctx.font = fontSpec(style.size, family)
  ctx.textBaseline = 'middle'
  ctx.textAlign = style.align
  const layout = layoutText((t) => ctx.measureText(t).width, box, style)
  let y = layout.firstY
  for (const line of layout.lines) {
    if (style.strokeWidth && style.strokeColor) {
      ctx.lineJoin = 'round'
      ctx.lineWidth = style.strokeWidth * 2
      ctx.strokeStyle = style.strokeColor
      ctx.strokeText(line, layout.x, y)
    }
    ctx.fillStyle = style.color
    ctx.fillText(line, layout.x, y)
    y += layout.step
  }
  ctx.restore()
  return layout
}
