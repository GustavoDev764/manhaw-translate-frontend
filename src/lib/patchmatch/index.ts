import type { PatchMatchOptions } from './patchmatch'

type Reply = { type: 'progress'; done: number } | { type: 'done'; data: Uint8ClampedArray } | { type: 'error'; message: string }

export function runPatchMatch(image: ImageData, hole: Uint8Array, options: PatchMatchOptions = {}, onProgress?: (done: number) => void): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./patchmatch.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<Reply>) => {
      const msg = e.data
      if (msg.type === 'progress') return onProgress?.(msg.done)
      worker.terminate()
      if (msg.type === 'error') return reject(new Error(msg.message))
      resolve(new ImageData(new Uint8ClampedArray(msg.data), image.width, image.height))
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message || 'O PatchMatch falhou.'))
    }
    const data = new Uint8ClampedArray(image.data)
    worker.postMessage({ data, width: image.width, height: image.height, hole, options }, [data.buffer, hole.buffer])
  })
}
