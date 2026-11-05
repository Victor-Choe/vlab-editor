import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react"
import { TextSelection } from "prosemirror-state"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import {
  Editor,
  EditorContent,
  EditorProvider,
  editorSchema,
  getPendingImageUploads,
  type ImageAttributes,
  ImageButton,
  ImageUploadError,
  LinkButton,
  parseMarkdown,
  RemoveLinkButton,
  setLink,
  ToolBar,
  useEditor,
} from "../src/index.js"

afterEach(cleanup)
beforeAll(() => {
  if (typeof Range.prototype.getClientRects !== "function") {
    Object.defineProperty(Range.prototype, "getClientRects", { value: () => [] })
    Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: () => new DOMRect() })
  }
})
function file(name = "sample.png") {
  return new File(["image"], name, { type: "image/png" })
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function images(editor: Editor) {
  const result: ImageAttributes[] = []
  editor.state.doc.descendants((node) => {
    if (node.type === editorSchema.nodes.image) result.push(node.attrs as ImageAttributes)
  })
  return result
}
describe("app-supplied image uploads", () => {
  it("keeps selected text while pending, inserts at the mapped end and creates one undoable document change", async () => {
    const task = deferred<ImageAttributes>()
    const onChange = vi.fn()
    const editor = new Editor({ markdown: "선택 뒤", uploadImage: () => task.promise, onChange })
    editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 3)))
    const pending = editor.uploadImage(file(), { alt: "직접 설명", title: "제목" })
    expect(editor.state.doc.textContent).toBe("선택 뒤")
    expect(editor.getMarkdown()).toBe("선택 뒤")
    expect(getPendingImageUploads(editor.state)).toHaveLength(1)
    expect(onChange).not.toHaveBeenCalled()
    editor.dispatch(editor.state.tr.insertText("앞 ", 1))
    const beforeResult = editor.state.doc
    onChange.mockClear()
    task.resolve({ src: "/uploaded.png" })
    await expect(pending).resolves.toEqual({
      src: "/uploaded.png",
      alt: "직접 설명",
      title: "제목",
    })
    expect(editor.state.doc.textContent).toBe("앞 선택 뒤")
    expect(images(editor)).toHaveLength(1)
    expect(getPendingImageUploads(editor.state)).toHaveLength(0)
    expect(onChange).toHaveBeenCalledOnce()
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
    editor.execute("undo")
    expect(editor.state.doc.eq(beforeResult)).toBe(true)
    editor.execute("redo")
    expect(images(editor)).toHaveLength(1)
  })
  it("does not move the user's cursor when an upload completes elsewhere", async () => {
    const task = deferred<ImageAttributes>()
    const editor = new Editor({ markdown: "첫 문단\n\n둘째", uploadImage: () => task.promise })
    const pending = editor.uploadImage(file())
    const end = editor.state.doc.content.size - 1
    editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, end)))
    editor.dispatch(editor.state.tr.insertText(" 작성 중"))
    task.resolve({ src: "/uploaded.png" })
    await pending
    expect(editor.state.selection.$from.parent.textContent).toBe("둘째 작성 중")
    expect(editor.state.selection.$from.parentOffset).toBe("둘째 작성 중".length)
  })
  it("keeps independent positions when uploads complete in reverse order", async () => {
    const first = deferred<ImageAttributes>()
    const second = deferred<ImageAttributes>()
    const editor = new Editor({
      markdown: "앞 뒤",
      uploadImage: (upload) => (upload.name === "first.png" ? first.promise : second.promise),
    })
    const one = editor.uploadImage(file("first.png"))
    editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 4)))
    const two = editor.uploadImage(file("second.png"))
    second.resolve({ src: "/second.png" })
    await two
    first.resolve({ src: "/first.png" })
    await one
    expect(images(editor).map((image) => image.src)).toEqual(["/first.png", "/second.png"])
    expect(editor.state.doc.textContent).toBe("앞 뒤")
  })
  it("reports failures and invalid results without changing the document", async () => {
    const failed = new Editor({
      markdown: "원문",
      uploadImage: async () => {
        throw new Error("network")
      },
    })
    await expect(failed.uploadImage(file())).rejects.toMatchObject({
      code: "failed",
      cause: expect.any(Error),
    })
    expect(failed.getMarkdown()).toBe("원문")
    expect(getPendingImageUploads(failed.state)).toHaveLength(0)
    const invalid = new Editor({ uploadImage: async () => ({ src: "blob:temporary" }) })
    await expect(invalid.uploadImage(file())).rejects.toMatchObject({ code: "invalid-result" })
    expect(images(invalid)).toHaveLength(0)
    expect(getPendingImageUploads(invalid.state)).toHaveLength(0)
  })
  it("rejects missing upload handlers, non-image files and code-block targets", async () => {
    await expect(new Editor().uploadImage(file())).rejects.toMatchObject({ code: "not-configured" })
    const uploadImage = vi.fn(async () => ({ src: "/uploaded.png" }))
    const editor = new Editor({ uploadImage })
    await expect(
      editor.uploadImage(new File(["text"], "a.txt", { type: "text/plain" })),
    ).rejects.toMatchObject({ code: "invalid-file" })
    editor.setMarkdown("```\n코드\n```")
    await expect(editor.uploadImage(file())).rejects.toMatchObject({ code: "invalid-target" })
    expect(uploadImage).not.toHaveBeenCalled()
  })
  it("cancels promptly even when the consumer does not resolve its upload promise", async () => {
    let signal: AbortSignal | undefined
    const editor = new Editor({
      markdown: "원문",
      uploadImage: async (_file, context) => {
        signal = context.signal
        return new Promise(() => {})
      },
    })
    const pending = editor.uploadImage(file())
    await Promise.resolve()
    const id = getPendingImageUploads(editor.state)[0]?.id
    expect(id).toBeDefined()
    expect(editor.cancelImageUpload(id ?? "")).toBe(true)
    await expect(pending).rejects.toMatchObject({ code: "cancelled" })
    expect(signal?.aborted).toBe(true)
    expect(editor.getMarkdown()).toBe("원문")
    expect(getPendingImageUploads(editor.state)).toHaveLength(0)
    expect(editor.cancelImageUpload(id ?? "")).toBe(false)
  })
  it("does not insert elsewhere after the original position is deleted", async () => {
    const task = deferred<ImageAttributes>()
    const editor = new Editor({ markdown: "지울 문서", uploadImage: () => task.promise })
    const pending = editor.uploadImage(file())
    editor.dispatch(
      editor.state.tr.replaceWith(
        0,
        editor.state.doc.content.size,
        editorSchema.nodes.paragraph.create(),
      ),
    )
    task.resolve({ src: "/uploaded.png" })
    await expect(pending).rejects.toMatchObject({ code: "target-removed" })
    expect(images(editor)).toHaveLength(0)
  })
  it("cancels a pending upload only after a new document is successfully parsed", async () => {
    const task = deferred<ImageAttributes>()
    const editor = new Editor({ markdown: "이전", uploadImage: () => task.promise })
    const pending = editor.uploadImage(file())
    const snapshot = editor.getSnapshot()
    expect(() => editor.setMarkdown("<div>미지원 HTML</div>")).toThrow()
    expect(editor.getSnapshot()).toBe(snapshot)
    expect(getPendingImageUploads(editor.state)).toHaveLength(1)
    editor.setMarkdown("새 문서")
    await expect(pending).rejects.toBeInstanceOf(ImageUploadError)
    task.resolve({ src: "/late.png" })
    await Promise.resolve()
    expect(editor.getMarkdown()).toBe("새 문서")
    expect(getPendingImageUploads(editor.state)).toHaveLength(0)
  })
  it("retains the task and result across content view unmount/remount", async () => {
    const task = deferred<ImageAttributes>()
    const editor = new Editor({ uploadImage: () => task.promise })
    const host = document.createElement("div")
    const view = editor.mount(host)
    const pending = editor.uploadImage(file())
    expect(host.querySelector(".vlab-editor-image-upload")).not.toBeNull()
    editor.unmount(view)
    task.resolve({ src: "/uploaded.png" })
    await pending
    const next = editor.mount(host)
    expect(host.querySelector("img[src]")?.getAttribute("src")).toBe("/uploaded.png")
    editor.unmount(next)
  })
})
describe("React media integration", () => {
  it("uses the latest committed upload callback", async () => {
    const first = vi.fn(async () => ({ src: "/first.png" }))
    const next = vi.fn(async () => ({ src: "/next.png" }))
    const hook = renderHook(({ uploadImage }) => useEditor({ uploadImage }), {
      initialProps: { uploadImage: first },
    })
    hook.rerender({ uploadImage: next })
    await hook.result.current.uploadImage(file())
    expect(first).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
    expect(images(hook.result.current)[0]?.src).toBe("/next.png")
  })
  it("cancels uploads when the useEditor owner unmounts", async () => {
    const hook = renderHook(() => useEditor({ uploadImage: async () => new Promise(() => {}) }))
    const editor = hook.result.current
    const pending = editor.uploadImage(file())
    hook.unmount()
    await expect(pending).rejects.toMatchObject({ code: "cancelled" })
    expect(getPendingImageUploads(editor.state)).toHaveLength(0)
  })
  it("keeps the selection and lets the consumer own the dialog UI", () => {
    const editor = new Editor({ markdown: "문장" })
    const openLink = vi.fn()
    const openImage = vi.fn()
    const result = render(
      <EditorProvider editor={editor}>
        <ToolBar>
          <LinkButton onClick={openLink} />
          <ImageButton onClick={openImage} />
          <RemoveLinkButton />
        </ToolBar>
        <EditorContent />
      </EditorProvider>,
    )
    act(() =>
      editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 3))),
    )
    const view = editor.view
    if (!view) throw new Error("Editor did not mount")
    const focus = vi.spyOn(view, "focus")
    const link = result.getByRole("button", { name: "링크 편집" })
    fireEvent.pointerDown(link)
    fireEvent.click(link)
    expect(openLink).toHaveBeenCalledOnce()
    expect(editor.state.selection.from).toBe(1)
    expect(editor.state.selection.to).toBe(3)
    expect(focus).not.toHaveBeenCalled()
    fireEvent.click(result.getByRole("button", { name: "이미지 편집" }))
    expect(openImage).toHaveBeenCalledOnce()
    act(() => {
      editor.execute(setLink({ href: "/docs" }))
    })
    expect(link.getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(result.getByRole("button", { name: "링크 해제" }))
    expect(link.getAttribute("aria-pressed")).toBe("false")
  })
})
