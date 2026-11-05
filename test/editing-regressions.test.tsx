import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { Slice } from "prosemirror-model"
import { TextSelection } from "prosemirror-state"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import {
  BoldButton,
  Editor,
  EditorContent,
  EditorProvider,
  getPendingImageUploads,
  ImageUploadError,
  insertHardBreak,
  parseMarkdown,
  serializeMarkdown,
  ToolBar,
} from "../src/index.js"

afterEach(cleanup)
beforeAll(() => {
  if (typeof Range.prototype.getClientRects !== "function") {
    Object.defineProperty(Range.prototype, "getClientRects", { value: () => [] })
    Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: () => new DOMRect() })
  }
})
function mount(editor: Editor) {
  return render(
    <EditorProvider editor={editor}>
      <ToolBar>
        <BoldButton />
      </ToolBar>
      <EditorContent />
    </EditorProvider>,
  )
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
function file(name: string) {
  return new File(["image"], name, { type: "image/png" })
}
describe("line breaks and whitespace", () => {
  it.each(["안녕 ", "안녕  ", " ", "  시작", "첫 문장 다음 "])(
    "allows typing edge spaces without changing the live text: %j",
    (source) => {
      const editor = new Editor()
      editor.dispatch(editor.state.tr.insertText(source))
      const snapshot = editor.getSnapshot()
      expect(editor.getMarkdown()).toBe(source.trim())
      expect(editor.state.doc.textContent).toBe(source)
      expect(editor.getSnapshot()).toBe(snapshot)
    },
  )
  it("keeps internal/code spaces and supports a formatted line ending in Space + Shift+Enter", () => {
    const editor = new Editor()
    editor.execute("bold")
    editor.dispatch(editor.state.tr.insertText("안녕 "))
    editor.execute(insertHardBreak)
    expect(editor.getMarkdown()).toBe("**안녕**<br>")
    const code = new Editor({ markdown: "```ts\n  const x = 1  \n```" })
    expect(code.getMarkdown()).toContain("  const x = 1  ")
    const inline = parseMarkdown("`  a  b  `")
    expect(inline.textContent).toBe(" a  b ")
    expect(parseMarkdown(serializeMarkdown(inline)).eq(inline)).toBe(true)
  })
  it("allows spaces at a formatting boundary without changing live formatting or internal spaces", () => {
    const editor = new Editor()
    editor.execute("bold")
    editor.dispatch(editor.state.tr.insertText("강조 "))
    editor.execute("bold")
    editor.dispatch(editor.state.tr.insertText("본문  내용 "))
    expect(editor.getMarkdown()).toBe("**강조** 본문  내용")
    expect(editor.state.doc.firstChild?.firstChild?.text).toBe("강조 ")
  })
  it.each([
    "줄 끝  \n다음 줄",
    "줄 끝\\\n다음 줄",
    "첫<br>둘",
    "첫<br />둘",
    "<br>",
    "<br><br>",
    "끝<br>",
    "**강조**<br>",
    "- 첫  \n  다음",
    "> 첫  \n> 다음",
  ])("preserves hard line breaks through import/export %j", (source) => {
    const doc = parseMarkdown(source)
    expect(parseMarkdown(serializeMarkdown(doc)).eq(doc)).toBe(true)
  })
  it("supports Shift+Enter, including an empty trailing line, and undo", () => {
    const editor = new Editor({ markdown: "본문" })
    const result = mount(editor)
    editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 3)))
    fireEvent.keyDown(result.getByRole("textbox"), { key: "Enter", shiftKey: true })
    expect(editor.getMarkdown()).toBe("본문<br>")
    editor.dispatch(editor.state.tr.insertText("다음"))
    expect(editor.getMarkdown()).toContain("본문\\\n다음")
    editor.execute("undo")
    expect(editor.state.doc.textContent).toBe("본문")
  })
  it("does not place hard breaks inside code blocks", () => {
    const editor = new Editor({ markdown: "```ts\nconst x = 1\n```" })
    expect(editor.execute(insertHardBreak)).toBe(false)
  })
})
describe("editable state", () => {
  it("disables editing and toolbar commands without resetting document/history, then enables them again", () => {
    const editor = new Editor({ markdown: "본문" })
    const result = mount(editor)
    const doc = editor.state.doc
    act(() => editor.setEditable(false))
    expect(result.getByRole("textbox").getAttribute("contenteditable")).toBe("false")
    expect((result.getByRole("button", { name: "굵게" }) as HTMLButtonElement).disabled).toBe(true)
    expect(editor.execute("bold")).toBe(false)
    expect(editor.state.doc).toBe(doc)
    act(() => editor.setEditable(true))
    expect(editor.execute("bold")).toBe(true)
    expect((result.getByRole("button", { name: "굵게" }) as HTMLButtonElement).disabled).toBe(false)
  })
  it("starts readonly before the content mounts and still accepts an explicit document replacement", async () => {
    const editor = new Editor({
      editable: false,
      markdown: "기존",
      uploadImage: async () => ({ src: "/uploaded.png" }),
    })
    mount(editor)
    expect(editor.view?.editable).toBe(false)
    editor.setMarkdown("새 본문")
    expect(editor.getMarkdown()).toBe("새 본문")
    await expect(editor.uploadImage(file("image.png"))).rejects.toBeInstanceOf(ImageUploadError)
  })
})
describe("image files from clipboard and drop", () => {
  it("uploads clipboard items even with an empty FileList, including during Korean composition", async () => {
    const uploadImage = vi.fn(async (_file: File) => ({ src: "/clipboard-item.png" }))
    const editor = new Editor({ uploadImage })
    const result = mount(editor)
    const element = result.getByRole("textbox")
    fireEvent.compositionStart(element)
    expect(editor.view?.composing).toBe(true)
    const image = file("screenshot.png")
    const event = new Event("paste", { bubbles: true, cancelable: true })
    Object.defineProperty(event, "clipboardData", {
      value: {
        files: [],
        items: [{ kind: "file", type: "image/png", getAsFile: () => image }],
        getData: () => "",
      },
    })
    fireEvent(element, event)
    expect(event.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(editor.getMarkdown()).toContain("/clipboard-item.png"))
    expect(uploadImage).toHaveBeenCalledOnce()
    expect(uploadImage.mock.calls[0]?.[0]).toBe(image)
    fireEvent.compositionEnd(element)
  })
  it("uploads an image-only HTML data URL without persisting inline image bytes", async () => {
    const uploadImage = vi.fn(async (_file: File) => ({ src: "/html-image.png" }))
    const editor = new Editor({ uploadImage })
    const result = mount(editor)
    const event = new Event("paste", { bubbles: true, cancelable: true })
    Object.defineProperty(event, "clipboardData", {
      value: {
        files: [],
        items: [],
        getData: (type: string) =>
          type === "text/html" ? '<p><img src="data:image/png;base64,aW1hZ2U="></p>' : "",
      },
    })
    fireEvent(result.getByRole("textbox"), event)
    await vi.waitFor(() => expect(editor.getMarkdown()).toContain("/html-image.png"))
    expect(uploadImage.mock.calls[0]?.[0]).toMatchObject({ type: "image/png", size: 5 })
    expect(editor.getMarkdown()).not.toContain("data:")
  })
  it("does not upload the same image twice when items and files both contain it", async () => {
    const uploadImage = vi.fn(async () => ({ src: "/once.png" }))
    const editor = new Editor({ uploadImage })
    const result = mount(editor)
    const image = file("image.png")
    const event = new Event("paste", { bubbles: true, cancelable: true })
    Object.defineProperty(event, "clipboardData", {
      value: {
        files: [image],
        items: [{ kind: "file", type: image.type, getAsFile: () => image }],
        getData: () => "",
      },
    })
    fireEvent(result.getByRole("textbox"), event)
    await vi.waitFor(() => expect(editor.getMarkdown()).toContain("/once.png"))
    expect(uploadImage).toHaveBeenCalledOnce()
  })
  it("keeps rich HTML text and ordinary image URLs together", () => {
    const uploadImage = vi.fn(async () => ({ src: "/uploaded.png" }))
    const editor = new Editor({ uploadImage })
    const result = mount(editor)
    const event = new Event("paste", { bubbles: true, cancelable: true })
    Object.defineProperty(event, "clipboardData", {
      value: {
        files: [],
        items: [],
        getData: (type: string) =>
          type === "text/html"
            ? '<p>앞 <strong>강조</strong><img src="/existing.png" alt="사진"> 뒤</p>'
            : "앞 강조 뒤",
      },
    })
    fireEvent(result.getByRole("textbox"), event)
    expect(editor.getMarkdown()).toContain("**강조**")
    expect(editor.getMarkdown()).toContain("![사진](/existing.png)")
    expect(editor.state.doc.textContent).toBe("앞 강조 뒤")
    expect(uploadImage).not.toHaveBeenCalled()
  })
  it.each([{ imagePaste: false }, { editable: false }])(
    "does not upload when paste or editing is disabled: %j",
    async (options) => {
      const uploadImage = vi.fn(async () => ({ src: "/unexpected.png" }))
      const editor = new Editor({ ...options, uploadImage })
      const result = mount(editor)
      const event = new Event("paste", { bubbles: true, cancelable: true })
      Object.defineProperty(event, "clipboardData", {
        value: { files: [file("image.png")], getData: () => "" },
      })
      fireEvent(result.getByRole("textbox"), event)
      await Promise.resolve()
      expect(uploadImage).not.toHaveBeenCalled()
      expect(editor.state.doc.textContent).toBe("")
    },
  )
  it("keeps a batch's file order when uploads finish in reverse order", async () => {
    const a = deferred<{
        src: string
      }>(),
      b = deferred<{
        src: string
      }>(),
      c = deferred<{
        src: string
      }>()
    const jobs = { "a.png": a, "b.png": b, "c.png": c }
    const editor = new Editor({
      markdown: "본문",
      uploadImage: (input) => jobs[input.name as keyof typeof jobs].promise,
    })
    const pending = editor.uploadImages([file("a.png"), file("b.png"), file("c.png")])
    c.resolve({ src: "/c.png" })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    b.resolve({ src: "/b.png" })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    a.resolve({ src: "/a.png" })
    await pending
    const sources: string[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === "image") sources.push(node.attrs.src)
    })
    expect(sources).toEqual(["/a.png", "/b.png", "/c.png"])
    expect(getPendingImageUploads(editor.state)).toHaveLength(0)
  })
  it("uploads pasted image files and retains the selected text", async () => {
    const uploadImage = vi.fn(async () => ({ src: "/pasted.png" }))
    const editor = new Editor({ markdown: "선택", uploadImage })
    const result = mount(editor)
    editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 3)))
    const event = new Event("paste", { bubbles: true, cancelable: true })
    Object.defineProperty(event, "clipboardData", {
      value: { files: [file("paste.png")], getData: () => "" },
    })
    fireEvent(result.getByRole("textbox"), event)
    await vi.waitFor(() => expect(editor.getMarkdown()).toContain("/pasted.png"))
    expect(editor.state.doc.textContent).toBe("선택")
    expect(uploadImage).toHaveBeenCalledOnce()
  })
  it("uses the dropped position rather than a cursor elsewhere", async () => {
    const editor = new Editor({
      markdown: "첫째\n\n둘째",
      uploadImage: async () => ({ src: "/drop.png" }),
    })
    mount(editor)
    const view = editor.view
    if (!view) throw new Error("Missing view")
    editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 7)))
    vi.spyOn(view, "posAtCoords").mockReturnValue({ pos: 1, inside: 0 })
    const event = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent
    Object.defineProperties(event, {
      dataTransfer: { value: { files: [file("drop.png")] } },
      clientX: { value: 0 },
      clientY: { value: 0 },
    })
    expect(view.someProp("handleDrop", (handler) => handler(view, event, Slice.empty, false))).toBe(
      true,
    )
    await vi.waitFor(() => expect(editor.getMarkdown()).toContain("/drop.png"))
    expect(editor.state.doc.firstChild?.firstChild?.type.name).toBe("image")
    expect(editor.state.doc.lastChild?.textContent).toBe("둘째")
  })
  it("reports automatic upload errors through the current callback", async () => {
    const onImageUploadError = vi.fn()
    const editor = new Editor({
      uploadImage: async () => {
        throw new Error("network failure")
      },
      onImageUploadError,
    })
    const result = mount(editor)
    const event = new Event("paste", { bubbles: true, cancelable: true })
    Object.defineProperty(event, "clipboardData", {
      value: { files: [file("paste.png")], getData: () => "" },
    })
    fireEvent(result.getByRole("textbox"), event)
    await vi.waitFor(() => expect(onImageUploadError).toHaveBeenCalledOnce())
    expect(getPendingImageUploads(editor.state)).toHaveLength(0)
  })
})
