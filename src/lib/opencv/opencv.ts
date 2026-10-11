import type * as OpenCvTypes from '@techstark/opencv-js'

export type CV = typeof OpenCvTypes

type CvModule = CV & { onRuntimeInitialized?: () => void }

let loading: Promise<{ cv: CV }> | null = null

export function loadOpenCv(): Promise<{ cv: CV }> {
  loading ??= import('@techstark/opencv-js').then(async (mod) => {
    const raw = ((mod as { default?: unknown }).default ?? mod) as unknown
    if (raw instanceof Promise) return { cv: (await raw) as CV }
    const cv = raw as CvModule
    if (!cv.Mat) {
      await new Promise<void>((resolve) => {
        cv.onRuntimeInitialized = () => resolve()
      })
    }
    return { cv }
  })
  return loading
}
