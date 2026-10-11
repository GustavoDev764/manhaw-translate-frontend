import { inpaintPatchMatch, type PatchMatchOptions } from './patchmatch'

type Request = { data: Uint8ClampedArray; width: number; height: number; hole: Uint8Array; options: PatchMatchOptions }

const scope = self as unknown as { postMessage: (message: unknown, transfer?: Transferable[]) => void; onmessage: ((e: MessageEvent<Request>) => void) | null }

scope.onmessage = (e) => {
  const { data, width, height, hole, options } = e.data
  try {
    let last = 0
    const out = inpaintPatchMatch(data, width, height, hole, options, (done) => {
      if (done - last < 0.04 && done < 1) return
      last = done
      scope.postMessage({ type: 'progress', done })
    })
    scope.postMessage({ type: 'done', data: out }, [out.buffer])
  } catch (err) {
    scope.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
