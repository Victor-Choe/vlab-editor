import { type EditorState, Plugin, PluginKey, type Transaction } from "prosemirror-state"
import { Decoration, DecorationSet } from "prosemirror-view"
import type { ImageAttributes } from "./media.js"
export type ImageUploadHandler = (
  file: File,
  context: {
    signal: AbortSignal
  },
) => Promise<ImageAttributes>
export interface ImageUploadOptions {
  uploadImage?: ImageUploadHandler
  imagePaste?: boolean
  imageDrop?: boolean
}
export interface PendingImageUpload {
  readonly id: string
  readonly fileName: string
  readonly position: number
}
export type ImageUploadErrorCode =
  | "not-configured"
  | "invalid-file"
  | "invalid-result"
  | "invalid-target"
  | "target-removed"
  | "cancelled"
  | "failed"
const messages: Record<ImageUploadErrorCode, string> = {
  "not-configured": "이미지 업로드 함수를 연결해 주세요.",
  "invalid-file": "이미지 파일을 선택해 주세요.",
  "invalid-result": "업로드 함수가 사용할 수 있는 이미지 주소를 반환하지 않았습니다.",
  "invalid-target": "현재 위치에 이미지를 넣을 수 없습니다.",
  "target-removed": "이미지를 넣을 위치가 삭제되어 삽입을 취소했습니다.",
  cancelled: "이미지 업로드를 취소했습니다.",
  failed: "이미지 업로드에 실패했습니다.",
}
export class ImageUploadError extends Error {
  readonly code: ImageUploadErrorCode
  constructor(code: ImageUploadErrorCode, options?: ErrorOptions) {
    super(messages[code], options)
    this.name = "ImageUploadError"
    this.code = code
  }
}
interface UploadState {
  decorations: DecorationSet
  uploads: readonly PendingImageUpload[]
}
export interface ImageUploadGroup {
  id: string
  order: number
}
type UploadMeta =
  | {
      add: PendingImageUpload
      group?: ImageUploadGroup
    }
  | {
      remove: string
      complete?: {
        position: number
        size: number
      }
    }
const emptyUploads: readonly PendingImageUpload[] = []
const uploadKey = new PluginKey<UploadState>("vlab-editor-image-upload")
function uploadWidget({ id, fileName, position }: PendingImageUpload, group?: ImageUploadGroup) {
  return Decoration.widget(
    position,
    (view) => {
      const element = view.dom.ownerDocument.createElement("span")
      element.className = "vlab-editor-image-upload"
      element.textContent = "이미지 업로드 중…"
      element.title = fileName
      element.setAttribute("role", "status")
      return element
    },
    { id, fileName, key: id, side: -1, group },
  )
}
export function imageUploadPlugin(): Plugin<UploadState> {
  return new Plugin({
    key: uploadKey,
    state: {
      init: () => ({ decorations: DecorationSet.empty, uploads: emptyUploads }),
      apply(transaction, previous) {
        let decorations = previous.decorations.map(transaction.mapping, transaction.doc)
        const meta = transaction.getMeta(uploadKey) as UploadMeta | undefined
        if (meta && "add" in meta) {
          decorations = decorations.add(transaction.doc, [uploadWidget(meta.add, meta.group)])
        }
        if (meta && "remove" in meta) {
          const completed = previous.decorations.find(
            undefined,
            undefined,
            (spec) => spec.id === meta.remove,
          )[0]
          const group = completed?.spec.group as ImageUploadGroup | undefined
          if (group && meta.complete) {
            for (const original of previous.decorations.find(
              meta.complete.position,
              meta.complete.position,
            )) {
              const nextGroup = original.spec.group as ImageUploadGroup | undefined
              if (nextGroup?.id !== group.id || nextGroup.order <= group.order) continue
              const mapped = decorations.find(
                undefined,
                undefined,
                (spec) => spec.id === original.spec.id,
              )[0]
              if (!mapped) continue
              decorations = decorations.remove([mapped]).add(transaction.doc, [
                uploadWidget(
                  {
                    id: original.spec.id as string,
                    fileName: original.spec.fileName as string,
                    position: mapped.from + meta.complete.size,
                  },
                  nextGroup,
                ),
              ])
            }
          }
          decorations = decorations.remove(
            decorations.find(undefined, undefined, (spec) => spec.id === meta.remove),
          )
        }
        if (decorations === previous.decorations) return previous
        const uploads = decorations.find().map((decoration) => ({
          id: decoration.spec.id as string,
          fileName: decoration.spec.fileName as string,
          position: decoration.from,
        }))
        return { decorations, uploads: uploads.length ? uploads : emptyUploads }
      },
    },
    props: { decorations: (state) => uploadKey.getState(state)?.decorations ?? null },
  })
}
export function getPendingImageUploads(state: EditorState): readonly PendingImageUpload[] {
  return uploadKey.getState(state)?.uploads ?? emptyUploads
}
export function addImageUpload(
  transaction: Transaction,
  upload: PendingImageUpload,
  group?: ImageUploadGroup,
): Transaction {
  return transaction
    .setMeta(uploadKey, { add: upload, ...(group ? { group } : {}) } satisfies UploadMeta)
    .setMeta("addToHistory", false)
}
export function removeImageUpload(transaction: Transaction, id: string): Transaction {
  return transaction.setMeta(uploadKey, { remove: id } satisfies UploadMeta)
}
export function completeImageUpload(
  transaction: Transaction,
  id: string,
  position: number,
  size: number,
): Transaction {
  return transaction.setMeta(uploadKey, {
    remove: id,
    complete: { position, size },
  } satisfies UploadMeta)
}
