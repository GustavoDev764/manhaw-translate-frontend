import type * as OpenCvTypes from '@techstark/opencv-js'
import opencvUrl from '@techstark/opencv-js/dist/opencv.js?url'

export type CV = typeof OpenCvTypes

type CvModule = CV & { onRuntimeInitialized?: () => void }

let loading: Promise<{ cv: CV }> | null = null

function ready(value: unknown): Promise<{ cv: CV }> {
  if (value instanceof Promise) return value.then(ready)
  const cv = value as CvModule
  if (cv?.Mat) return Promise.resolve({ cv })
  return new Promise((resolve) => {
    cv.onRuntimeInitialized = () => resolve({ cv })
  })
}

export function loadOpenCv(): Promise<{ cv: CV }> {
  loading ??= new Promise<{ value: unknown }>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = opencvUrl
    script.async = true
    script.onload = () => {
      const value = (window as unknown as { cv?: unknown }).cv
      if (value) resolve({ value })
      else reject(new Error('O OpenCV carregou, mas não ficou disponível.'))
    }
    script.onerror = () => reject(new Error('Não consegui baixar o OpenCV.'))
    document.head.appendChild(script)
  })
    .then((box) => ready(box.value))
    .catch((err: unknown) => {
      loading = null
      throw err
    })
  return loading
}
