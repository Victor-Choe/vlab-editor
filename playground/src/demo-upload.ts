import type { ImageUploadHandler } from "vlab-editor"
import { sampleImageUrl } from "./assets.js"
export function demoImageUpload(mode: "success" | "failure"): ImageUploadHandler {
  return async (file, { signal }) => {
    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason)
        return
      }
      const cancel = () => {
        clearTimeout(timer)
        reject(signal.reason)
      }
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", cancel)
        resolve()
      }, 1000)
      signal.addEventListener("abort", cancel, { once: true })
    })
    if (mode === "failure") throw new Error("업로드 실패 예제")
    return { src: sampleImageUrl, alt: file.name }
  }
}
