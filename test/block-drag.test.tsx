import { cleanup, fireEvent, render } from "@testing-library/react"
import type { Node as ProseMirrorNode } from "prosemirror-model"
import { NodeSelection, TextSelection } from "prosemirror-state"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import {
  blockDragAndDrop,
  Editor,
  EditorContent,
  EditorProvider,
  getPendingImageUploads,
  moveBlock,
  parseMarkdown,
} from "../src/index.js"

afterEach(cleanup)
beforeAll(() => {
  if (typeof Range.prototype.getClientRects !== "function") {
    Object.defineProperty(Range.prototype, "getClientRects", { value: () => [] })
    Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: () => new DOMRect() })
  }
})
function blocks(doc: ProseMirrorNode) {
  const result: {
    node: ProseMirrorNode
    from: number
  }[] = []
  doc.forEach((node, from) => {
    result.push({ node, from })
  })
  return result
}
function setup(markdown = "첫째\n\n둘째\n\n셋째") {
  const editor = new Editor({ markdown, extensions: [blockDragAndDrop()] })
  const result = render(
    <EditorProvider editor={editor}>
      <EditorContent />
    </EditorProvider>,
  )
  const view = editor.view
  if (!view?.dom.parentElement) throw new Error("Missing view")
  const host = view.dom.parentElement
  host.getBoundingClientRect = () => new DOMRect(0, 0, 500, 600)
  view.dom.getBoundingClientRect = () => new DOMRect(30, 100, 450, 400)
  blocks(editor.state.doc).forEach(({ from }, index) => {
    const element = view.nodeDOM(from) as HTMLElement
    element.getBoundingClientRect = () => new DOMRect(40, 100 + index * 100, 400, 60)
  })
  const handle = host.querySelector<HTMLButtonElement>(".vlab-editor-block-handle")
  if (!handle) throw new Error("Missing handle")
  return { editor, view, host, handle, result }
}
function hover(host: HTMLElement, index: number) {
  fireEvent(
    host,
    new MouseEvent("pointermove", { bubbles: true, clientX: 100, clientY: 110 + index * 100 }),
  )
}
function transfer() {
  const values = new Map<string, string>()
  return {
    setData: (key: string, value: string) => values.set(key, value),
    getData: (key: string) => values.get(key) ?? "",
    clearData: () => values.clear(),
    setDragImage: vi.fn(),
    effectAllowed: "",
    dropEffect: "",
  }
}
function drag(
  element: HTMLElement,
  type: string,
  dataTransfer: ReturnType<typeof transfer>,
  clientY = 0,
) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    dataTransfer: { value: dataTransfer },
    clientY: { value: clientY },
    clientX: { value: 100 },
  })
  fireEvent(element, event)
  return event
}
describe("top-level block movement", () => {
  it.each([
    "**문단**과 [링크](/about)",
    "### 제목",
    "- 목록\n  - 중첩 목록",
    "- [x] 완료\n- [ ] 대기",
    "> 인용문",
    "---",
    "```ts\nconst message = '한글'\n```",
    "![설명](/image.png)",
    "| A | B |\n| --- | --- |\n| 1 | 2 |",
  ])("moves %j without losing formatting, nesting or Markdown", (source) => {
    const editor = new Editor({
      markdown: `# 시작\n\n${source}\n\n끝`,
      extensions: [blockDragAndDrop()],
    })
    const original = editor.state.doc
    const sourceBlock = blocks(original)[1]
    if (!sourceBlock) throw new Error("Missing source")
    expect(editor.execute(moveBlock(sourceBlock.from, 0))).toBe(true)
    expect(editor.state.doc.firstChild?.eq(sourceBlock.node)).toBe(true)
    const moved = editor.state.doc
    expect(parseMarkdown(editor.getMarkdown()).eq(moved)).toBe(true)
    editor.execute("undo")
    expect(editor.state.doc.eq(original)).toBe(true)
    editor.execute("redo")
    expect(editor.state.doc.eq(moved)).toBe(true)
  })
  it("moves down using a destination in the original document and isolates subsequent typing", () => {
    const editor = new Editor({
      markdown: "첫째\n\n둘째\n\n셋째",
      extensions: [blockDragAndDrop()],
    })
    const original = editor.state.doc
    editor.execute(moveBlock(0, original.content.size))
    expect(editor.getMarkdown()).toBe("둘째\n\n셋째\n\n첫째")
    const moved = editor.state.doc
    editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1)))
    editor.dispatch(editor.state.tr.insertText("추가 "))
    editor.execute("undo")
    expect(editor.state.doc.eq(moved)).toBe(true)
    editor.execute("undo")
    expect(editor.state.doc.eq(original)).toBe(true)
  })
  it.each([
    [0, 0],
    [0, 4],
    [1, 8],
    [-1, 0],
    [0, -1],
    [0.5, 0],
    [0, 999],
    [0, 5],
  ])("rejects invalid, nested or unchanged positions %j %j", (from, to) => {
    const editor = new Editor({ markdown: "첫째\n\n둘째" })
    const snapshot = editor.getSnapshot()
    expect(editor.execute(moveBlock(from, to))).toBe(false)
    expect(editor.getSnapshot()).toBe(snapshot)
  })
  it("probes without dispatching or changing selection/history", () => {
    const editor = new Editor({ markdown: "첫째\n\n둘째" })
    const snapshot = editor.getSnapshot()
    expect(editor.canExecute(moveBlock(0, editor.state.doc.content.size))).toBe(true)
    expect(editor.getSnapshot()).toBe(snapshot)
    expect(editor.canExecute("undo")).toBe(false)
  })
  it("waits for an upload in the source block while preserving uploads in other moved-around blocks", async () => {
    let resolve!: (value: { src: string }) => void
    const editor = new Editor({
      markdown: "첫째\n\n둘째",
      uploadImage: () =>
        new Promise((yes) => {
          resolve = yes
        }),
    })
    const pending = editor.uploadImage(new File(["image"], "sample.png", { type: "image/png" }))
    expect(editor.canExecute(moveBlock(0, editor.state.doc.content.size))).toBe(false)
    const second = blocks(editor.state.doc)[1]
    if (!second) throw new Error("Missing second")
    expect(editor.execute(moveBlock(second.from, 0))).toBe(true)
    expect(getPendingImageUploads(editor.state)[0]?.position).toBe(second.node.nodeSize + 1)
    await Promise.resolve()
    resolve({ src: "/uploaded.png" })
    await pending
    expect(editor.state.doc.lastChild?.textContent).toBe("첫째")
    expect(editor.getMarkdown()).toContain("![sample.png](/uploaded.png)")
  })
})
describe("block drag extension", () => {
  it("shows a handle on hover, previews a top-level gap and moves the complete block", () => {
    const { editor, host, handle } = setup()
    expect(handle.hidden).toBe(true)
    hover(host, 1)
    expect(handle.getAttribute("aria-label")).toBe("2번째 블록 이동")
    expect(handle.hidden).toBe(false)
    const data = transfer()
    drag(handle, "dragstart", data)
    expect(data.getData("text/html")).toContain("둘째")
    expect(data.effectAllowed).toBe("move")
    drag(host, "dragover", data, 90)
    expect(host.querySelector<HTMLElement>(".vlab-editor-block-drop-indicator")?.hidden).toBe(false)
    drag(host, "drop", data, 90)
    expect(editor.getMarkdown()).toBe("둘째\n\n첫째\n\n셋째")
    expect(host.querySelector("[role=status]")?.textContent).toContain("1번째")
    editor.execute("undo")
    expect(editor.getMarkdown()).toBe("첫째\n\n둘째\n\n셋째")
  })
  it("keeps a drop back onto its own block as a no-op", () => {
    const { editor, host, handle } = setup()
    const original = editor.state.doc
    hover(host, 1)
    const data = transfer()
    drag(handle, "dragstart", data)
    drag(host, "drop", data, 210)
    expect(editor.state.doc).toBe(original)
    expect(editor.canExecute("undo")).toBe(false)
  })
  it("supports Alt+ArrowDown and Alt+ArrowUp without remounting the content view", () => {
    const { editor, host, handle, view } = setup()
    hover(host, 0)
    handle.focus()
    fireEvent.keyDown(handle, { key: "ArrowDown", altKey: true })
    expect(editor.getMarkdown()).toBe("둘째\n\n첫째\n\n셋째")
    fireEvent.keyDown(handle, { key: "ArrowUp", altKey: true })
    expect(editor.getMarkdown()).toBe("첫째\n\n둘째\n\n셋째")
    expect(editor.view).toBe(view)
    expect(document.activeElement).toBe(handle)
  })
  it.each(["Backspace", "Delete"])(
    "deletes the block selected by its handle with %s and supports undo/redo",
    (key) => {
      const { editor, host, handle, view } = setup()
      const original = editor.state.doc
      hover(host, 1)
      fireEvent.click(handle)
      expect(editor.state.selection).toBeInstanceOf(NodeSelection)
      expect(document.activeElement).toBe(handle)
      expect(fireEvent.keyDown(handle, { key })).toBe(false)
      expect(editor.getMarkdown()).toBe("첫째\n\n셋째")
      expect(view.hasFocus()).toBe(true)
      expect(host.querySelector("[role=status]")?.textContent).toContain("삭제")
      editor.execute("undo")
      expect(editor.state.doc.eq(original)).toBe(true)
      editor.execute("redo")
      expect(editor.getMarkdown()).toBe("첫째\n\n셋째")
    },
  )
  it.each([
    "### 제목",
    "- 목록\n  - 중첩 목록",
    "- [x] 완료\n- [ ] 대기",
    "> 인용문",
    "---",
    "```ts\nconst message = '한글'\n```",
    "![설명](/image.png)",
    "| A | B |\n| --- | --- |\n| 1 | 2 |",
  ])("deletes the whole selected %j block and restores it intact on undo", (source) => {
    const { editor, host, handle } = setup(`시작\n\n${source}\n\n끝`)
    const original = editor.state.doc
    hover(host, 1)
    fireEvent.click(handle)
    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    fireEvent.keyDown(handle, { key: "Delete" })
    expect(editor.getMarkdown()).toBe("시작\n\n끝")
    editor.execute("undo")
    expect(editor.state.doc.eq(original)).toBe(true)
  })
  it.each(["Backspace", "Delete"])(
    "keeps an editable empty paragraph when %s removes the only block",
    (key) => {
      const { editor, host, handle, view } = setup("### 유일한 블록")
      const original = editor.state.doc
      hover(host, 0)
      fireEvent.click(handle)
      fireEvent.keyDown(handle, { key })
      expect(editor.state.doc.childCount).toBe(1)
      expect(editor.state.doc.firstChild?.type.name).toBe("paragraph")
      expect(editor.state.doc.firstChild?.content.size).toBe(0)
      expect(editor.state.selection).toBeInstanceOf(TextSelection)
      expect(view.hasFocus()).toBe(true)
      editor.execute("undo")
      expect(editor.state.doc.eq(original)).toBe(true)
    },
  )
  it("keeps handle deletion separate from preceding and subsequent typing in history", () => {
    const { editor, host, handle } = setup()
    const original = editor.state.doc
    editor.dispatch(editor.state.tr.insertText("추가 ", 1))
    const beforeDelete = editor.state.doc
    hover(host, 0)
    fireEvent.click(handle)
    fireEvent.keyDown(handle, { key: "Backspace" })
    const afterDelete = editor.state.doc
    expect(editor.getMarkdown()).toBe("둘째\n\n셋째")
    editor.dispatch(editor.state.tr.insertText("새 "))
    editor.execute("undo")
    expect(editor.state.doc.eq(afterDelete)).toBe(true)
    editor.execute("undo")
    expect(editor.state.doc.eq(beforeDelete)).toBe(true)
    editor.execute("undo")
    expect(editor.state.doc.eq(original)).toBe(true)
  })
  it.each([
    "hover-only",
    "other-selection",
    "readonly",
    "composition",
    "view-composition",
    "composition-keycode",
    "dragging",
  ])("does not delete a block from a handle during %s", (reason) => {
    const { editor, host, handle, view } = setup()
    hover(host, 1)
    if (reason === "hover-only") handle.focus()
    else fireEvent.click(handle)
    if (reason === "other-selection") {
      editor.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)))
      hover(host, 1)
    }
    if (reason === "readonly") view.setProps({ editable: () => false })
    if (reason === "view-composition") vi.spyOn(view, "composing", "get").mockReturnValue(true)
    if (reason === "dragging") drag(handle, "dragstart", transfer())
    const original = editor.state.doc
    fireEvent.keyDown(handle, {
      key: "Backspace",
      isComposing: reason === "composition",
      keyCode: reason === "composition-keycode" ? 229 : 8,
    })
    expect(editor.state.doc).toBe(original)
  })
  it.each(["Escape", "document-edit", "document-replace", "readonly"] as const)(
    "rejects a stale drag after %s",
    (reason) => {
      const { editor, host, handle, view } = setup()
      hover(host, 1)
      const data = transfer()
      drag(handle, "dragstart", data)
      if (reason === "Escape") fireEvent.keyDown(document, { key: "Escape" })
      if (reason === "document-edit") editor.dispatch(editor.state.tr.insertText("새 ", 1))
      if (reason === "document-replace") editor.setMarkdown("새 문서")
      if (reason === "readonly") view.setProps({ editable: () => false })
      const current = editor.state.doc
      expect(drag(host, "drop", data, 90).defaultPrevented).toBe(true)
      expect(editor.state.doc).toBe(current)
      expect(view.dragging).toBeNull()
    },
  )
  it("leaves external drop events to the editor's existing handlers", () => {
    const { host } = setup()
    const data = transfer()
    const event = new Event("drop", { bubbles: true, cancelable: true })
    Object.defineProperty(event, "dataTransfer", { value: data })
    fireEvent(host, event)
    expect(event.defaultPrevented).toBe(false)
  })
  it("allows handle UI customization and filtering while keeping controls outside the document DOM", () => {
    const editor = new Editor({
      markdown: "# 제목\n\n본문",
      extensions: [
        blockDragAndDrop({
          createHandle: () => {
            const button = document.createElement("button")
            button.textContent = "custom"
            return button
          },
          handleClassName: "my-handle",
          indicatorClassName: "my-indicator",
          canDrag: (node) => node.type.name !== "heading",
        }),
      ],
    })
    const result = render(
      <EditorProvider editor={editor}>
        <EditorContent />
      </EditorProvider>,
    )
    expect(result.container.querySelector(".my-handle")?.textContent).toBe("custom")
    expect(result.container.querySelector(".my-indicator")).not.toBeNull()
    expect(editor.view?.dom.querySelector("button")).toBeNull()
    expect(editor.getMarkdown()).toBe("# 제목\n\n본문")
    const host = editor.view?.dom.parentElement
    const handle = host?.querySelector<HTMLButtonElement>(".my-handle")
    if (!host || !handle || !editor.view) throw new Error("Missing view")
    editor.view.dom.getBoundingClientRect = () => new DOMRect(0, 0, 500, 500)
    const headingDOM = editor.view.nodeDOM(0) as HTMLElement
    headingDOM.getBoundingClientRect = () => new DOMRect(40, 100, 400, 60)
    hover(host, 0)
    expect(handle.hidden).toBe(true)
    const paragraph = blocks(editor.state.doc)[1]
    if (!paragraph) throw new Error("Missing paragraph")
    editor.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, paragraph.from + 1)),
    )
    editor.view.focus()
    expect(handle.hidden).toBe(false)
  })
  it("cleans up on content unmount and recreates exactly one handle on replacement/remount", () => {
    const { editor, host, result } = setup()
    editor.setMarkdown("새 본문")
    expect(host.querySelectorAll(".vlab-editor-block-handle")).toHaveLength(1)
    result.unmount()
    expect(
      host.querySelectorAll(
        ".vlab-editor-block-handle, .vlab-editor-block-drop-indicator, .vlab-editor-block-announcement",
      ),
    ).toHaveLength(0)
    const next = render(
      <EditorProvider editor={editor}>
        <EditorContent />
      </EditorProvider>,
    )
    expect(next.container.querySelectorAll(".vlab-editor-block-handle")).toHaveLength(1)
    expect(editor.getMarkdown()).toBe("새 본문")
  })
})
