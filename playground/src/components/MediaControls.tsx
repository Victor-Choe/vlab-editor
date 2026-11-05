import { type FormEvent, useEffect, useRef, useState } from "react"
import {
  type Editor,
  getLink,
  getPendingImageUploads,
  getSelectedImage,
  ImageButton,
  ImageUploadError,
  insertImage,
  LinkButton,
  normalizeImageUrl,
  normalizeLinkUrl,
  RemoveLinkButton,
  setLink,
  updateImage,
  useEditorContext,
  useEditorState,
} from "vlab-editor"
import { ToolbarIcon } from "./ToolbarIcon"
import "./MediaControls.css"
export interface MediaNotice {
  kind: "success" | "error" | "info"
  message: string
}
interface SelectionTarget {
  doc: Editor["state"]["doc"]
  bookmark: ReturnType<Editor["state"]["selection"]["getBookmark"]>
  label: string
  canReplaceLabel: boolean
}
export function MediaControls({
  onNotice,
  uploadMode,
  onUploadModeChange,
}: {
  onNotice: (notice: MediaNotice) => void
  uploadMode: "success" | "failure"
  onUploadModeChange: (mode: "success" | "failure") => void
}) {
  const editor = useEditorContext()
  const dialog = useRef<HTMLDialogElement>(null)
  const target = useRef<SelectionTarget | null>(null)
  const [kind, setKind] = useState<"link" | "image" | null>(null)
  const [address, setAddress] = useState("")
  const [title, setTitle] = useState("")
  const [label, setLabel] = useState("")
  const [alt, setAlt] = useState("")
  const [source, setSource] = useState<"url" | "upload">("url")
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingImage, setEditingImage] = useState(false)
  const [canReplaceLabel, setCanReplaceLabel] = useState(true)
  useEffect(() => {
    if (kind && dialog.current && !dialog.current.open) dialog.current.showModal()
  }, [kind])
  function open(next: "link" | "image") {
    const state = editor.state
    const link = getLink(state)
    const image = getSelectedImage(state)
    const from = next === "link" && state.selection.empty && link ? link.from : state.selection.from
    const to = next === "link" && state.selection.empty && link ? link.to : state.selection.to
    const text = state.doc.textBetween(from, to, " ")
    target.current = {
      doc: state.doc,
      bookmark: state.selection.getBookmark(),
      label: text,
      canReplaceLabel:
        state.selection.$from.sameParent(state.selection.$to) &&
        state.selection.$from.parent.inlineContent,
    }
    setAddress(next === "link" ? (link?.href ?? "") : (image?.src ?? ""))
    setTitle((next === "link" ? link?.title : image?.title) ?? "")
    setLabel(text)
    setAlt(image?.alt ?? "")
    setSource("url")
    setFile(null)
    setError(null)
    setEditingImage(Boolean(image))
    setCanReplaceLabel(
      state.selection.$from.sameParent(state.selection.$to) &&
        state.selection.$from.parent.inlineContent,
    )
    setKind(next)
  }
  function restoreSelection(): boolean {
    const saved = target.current
    if (!saved || saved.doc !== editor.state.doc) {
      setError("문서가 바뀌었습니다. 창을 닫고 삽입할 위치를 다시 선택해 주세요.")
      return false
    }
    const selection = saved.bookmark.resolve(editor.state.doc)
    if (!selection.eq(editor.state.selection))
      editor.dispatch(editor.state.tr.setSelection(selection))
    return true
  }
  function close() {
    dialog.current?.close()
    setKind(null)
    editor.view?.focus()
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (kind === "image" && source === "upload") {
      if (!file) {
        setError("이미지 파일을 선택해 주세요.")
        return
      }
      if (!restoreSelection()) return
      close()
      try {
        await editor.uploadImage(file, { alt: alt || file.name, title: title || null })
        onNotice({ kind: "success", message: "업로드 함수가 반환한 주소로 이미지를 삽입했습니다." })
      } catch (cause) {
        onNotice({
          kind: cause instanceof ImageUploadError && cause.code === "cancelled" ? "info" : "error",
          message: cause instanceof Error ? cause.message : "이미지 업로드에 실패했습니다.",
        })
      }
      return
    }
    const normalized = kind === "link" ? normalizeLinkUrl(address) : normalizeImageUrl(address)
    if (!normalized) {
      setError("사용할 수 있는 주소를 입력해 주세요.")
      return
    }
    if (!restoreSelection()) return
    const command =
      kind === "link"
        ? setLink({
            href: normalized,
            title: title || null,
            ...(label !== target.current?.label && label ? { text: label } : {}),
          })
        : (editingImage ? updateImage : insertImage)({ src: normalized, alt, title: title || null })
    if (!editor.execute(command, { focus: false })) {
      setError("현재 선택한 범위에서는 적용할 수 없습니다.")
      return
    }
    close()
    onNotice({
      kind: "success",
      message: kind === "link" ? "링크를 적용했습니다." : "이미지를 적용했습니다.",
    })
  }
  return (
    <>
      <LinkButton onClick={() => open("link")}>
        <ToolbarIcon name="link" />
      </LinkButton>
      <RemoveLinkButton>
        <ToolbarIcon name="unlink" />
      </RemoveLinkButton>
      <ImageButton onClick={() => open("image")}>
        <ToolbarIcon name="image" />
      </ImageButton>
      <dialog
        ref={dialog}
        className="media-dialog"
        aria-labelledby="media-dialog-title"
        onClose={() => setKind(null)}
      >
        {kind && (
          <form onSubmit={submit}>
            <div className="media-dialog-heading">
              <h2 id="media-dialog-title">
                {kind === "link" ? "링크 추가·수정" : "이미지 삽입·수정"}
              </h2>
              <button type="button" aria-label="창 닫기" onClick={close}>
                닫기
              </button>
            </div>
            {kind === "image" && !editingImage && (
              <label>
                이미지 가져오기
                <select
                  aria-label="이미지 가져오기"
                  value={source}
                  onChange={(event) => setSource(event.target.value as "url" | "upload")}
                >
                  <option value="url">주소로 삽입</option>
                  <option value="upload">파일 업로드</option>
                </select>
              </label>
            )}
            {kind === "link" || source === "url" ? (
              <label>
                {kind === "link" ? "링크 주소" : "이미지 주소"}
                <input
                  autoComplete="off"
                  inputMode="url"
                  value={address}
                  placeholder={
                    kind === "link"
                      ? "https://example.com 또는 /about"
                      : "https://example.com/image.png 또는 /editor-sample.svg"
                  }
                  onChange={(event) => setAddress(event.target.value)}
                />
              </label>
            ) : (
              <>
                <label>
                  이미지 파일
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                <label>
                  업로드 예제
                  <select
                    aria-label="업로드 예제"
                    value={uploadMode}
                    onChange={(event) =>
                      onUploadModeChange(event.target.value as "success" | "failure")
                    }
                  >
                    <option value="success">1초 후 성공</option>
                    <option value="failure">1초 후 실패</option>
                  </select>
                </label>
                <p className="media-help">
                  데모 업로더는 예제 이미지 주소를 반환합니다. 실제 앱에서는 이 함수를 서버 업로드
                  함수로 연결합니다.
                </p>
              </>
            )}
            {kind === "link" ? (
              <label>
                표시할 글자
                <input
                  value={label}
                  disabled={!canReplaceLabel}
                  placeholder="비워두면 주소를 표시합니다."
                  onChange={(event) => setLabel(event.target.value)}
                />
              </label>
            ) : (
              <label>
                이미지 설명
                <input
                  value={alt}
                  placeholder="이미지의 내용을 설명해 주세요."
                  onChange={(event) => setAlt(event.target.value)}
                />
              </label>
            )}
            <label>
              제목 (선택)
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            {error && (
              <p role="alert" className="media-error">
                {error}
              </p>
            )}
            <div className="media-dialog-actions">
              <button type="button" onClick={close}>
                취소
              </button>
              <button type="submit" className="media-submit">
                {source === "upload" && kind === "image" ? "업로드 시작" : "적용"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  )
}
export function ImageUploadStatus() {
  const editor = useEditorContext()
  const uploads = useEditorState(getPendingImageUploads)
  if (!uploads.length) return null
  return (
    <div className="image-upload-status" aria-live="polite">
      {uploads.map((upload) => (
        <div key={upload.id}>
          <span>{upload.fileName} 업로드 중…</span>
          <button type="button" onClick={() => editor.cancelImageUpload(upload.id)}>
            업로드 취소
          </button>
        </div>
      ))}
    </div>
  )
}
