import { fireEvent } from "@testing-library/react"
import { NodeSelection, Selection, TextSelection } from "prosemirror-state"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import {
  BlockSelection,
  blockDragAndDrop,
  Editor,
  moveBlocks,
  parseMarkdown,
} from "../src/index.js"

const mounted: Editor[] = []
afterEach(() => {
  for (const editor of mounted.splice(0)) if (editor.view) editor.unmount(editor.view)
  document.body.replaceChildren()
})
beforeAll(() => {
  Object.defineProperty(window, "scrollBy", { configurable: true, value: () => {} })
  if (typeof Range.prototype.getClientRects !== "function") {
    Object.defineProperty(Range.prototype, "getClientRects", { value: () => [] })
    Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: () => new DOMRect() })
  }
})
function positions(editor: Editor) {
  const result: number[] = []
  editor.state.doc.forEach((_node, from) => {
    result.push(from)
  })
  return result
}
function setup(markdown = "첫째\n\n둘째\n\n셋째\n\n넷째") {
  const editor = new Editor({ markdown, extensions: [blockDragAndDrop()] })
  mounted.push(editor)
  const host = document.createElement("div")
  document.body.append(host)
  const view = editor.mount(host)
  host.getBoundingClientRect = () => new DOMRect(0, 0, 600, 600)
  view.dom.getBoundingClientRect = () => new DOMRect(0, 0, 600, 600)
  editor.state.doc.forEach((_node, from, index) => {
    const element = view.nodeDOM(from) as HTMLElement
    element.getBoundingClientRect = () =>
      new DOMRect(40, 100 + index * 80 - host.scrollTop, 500, 60)
  })
  const handle = host.querySelector<HTMLButtonElement>(".vlab-editor-block-handle")
  if (!handle) throw new Error("Missing handle")
  const clickHandle = (index: number, shiftKey = false) => {
    fireEvent(
      host,
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 100,
        clientY: 110 + index * 80,
      }),
    )
    fireEvent.click(handle, { shiftKey })
  }
  return { editor, view, host, handle, clickHandle }
}
function pointer(target: EventTarget, type: string, x: number, y: number, extra = {}) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  })
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: "mouse" },
    ...extra,
  })
  target.dispatchEvent(event)
  return event
}
function drag(target: EventTarget, type: string, dataTransfer: object, y = 0) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    dataTransfer: { value: dataTransfer },
    clientY: { value: y },
  })
  target.dispatchEvent(event)
  return event
}
describe("whole-block range selection", () => {
  it("reuses the registered constructor after a module reload", async () => {
    const modulePath = "../src/engine/block-selection.ts?reload"
    const reloaded: typeof import("../src/engine/block-selection.js") = await import(modulePath)
    expect(reloaded.BlockSelection).toBe(BlockSelection)
    const editor = new Editor({ markdown: "첫째\n\n둘째" })
    const selection = BlockSelection.create(editor.state.doc, 0, positions(editor)[1])
    expect(Selection.fromJSON(editor.state.doc, selection.toJSON())).toBeInstanceOf(
      reloaded.BlockSelection,
    )
  })
  it.each([false, true])(
    "selects complete blocks with closed clipboard content, backward=%s",
    (backward) => {
      const editor = new Editor({ markdown: "시작\n\n### 제목\n\n- [x] 항목\n\n끝" })
      const [first, , third] = positions(editor)
      if (first === undefined || third === undefined) throw new Error("Missing block")
      const selection = BlockSelection.create(
        editor.state.doc,
        backward ? third : first,
        backward ? first : third,
      )
      expect(selection.from).toBe(first)
      expect(selection.to).toBe(third + (editor.state.doc.nodeAt(third)?.nodeSize ?? 0))
      expect(selection.content().openStart).toBe(0)
      expect(selection.content().openEnd).toBe(0)
      expect(selection.content().content.childCount).toBe(3)
      expect(Selection.fromJSON(editor.state.doc, selection.toJSON()).eq(selection)).toBe(true)
      expect(selection.visible).toBe(false)
    },
  )
  it.each([-1, 1, 0.5, Number.NaN, 999])("rejects non-block position %s", (position) => {
    const editor = new Editor({ markdown: "첫째\n\n둘째" })
    expect(() => BlockSelection.create(editor.state.doc, 0, position)).toThrow(RangeError)
  })
  it("maps boundaries and history bookmarks through preceding edits", () => {
    const editor = new Editor({ markdown: "첫째\n\n둘째\n\n셋째" })
    const [, second, third] = positions(editor)
    if (second === undefined || third === undefined) throw new Error("Missing block")
    const selection = BlockSelection.create(editor.state.doc, second, third)
    const tr = editor.state.tr.insertText("새 ", 1)
    const mapped = selection.map(tr.doc, tr.mapping)
    expect(mapped).toBeInstanceOf(BlockSelection)
    expect(mapped.from).toBe(second + 2)
    expect(mapped.to).toBe(tr.doc.content.size)
    expect(selection.getBookmark().map(tr.mapping).resolve(tr.doc).eq(mapped)).toBe(true)
    const removed = editor.state.tr.delete(second, editor.state.doc.content.size)
    expect(selection.map(removed.doc, removed.mapping)).not.toBeInstanceOf(BlockSelection)
  })
  it("keeps block contents and range direction when moving a mixed group", () => {
    const editor = new Editor({
      markdown: "시작\n\n### 제목\n\n```ts\nconst a = 1\n```\n\n| A |\n| --- |\n| 1 |\n\n끝",
      extensions: [blockDragAndDrop()],
    })
    const [, start, , head, end] = positions(editor)
    if (start === undefined || head === undefined || end === undefined)
      throw new Error("Missing block")
    const original = editor.state.doc
    editor.dispatch(editor.state.tr.setSelection(BlockSelection.create(original, head, start)))
    expect(editor.execute(moveBlocks(start, end, 0))).toBe(true)
    const moved = editor.state.doc
    expect(moved.child(0).eq(original.child(1))).toBe(true)
    expect(moved.child(1).eq(original.child(2))).toBe(true)
    expect(moved.child(2).eq(original.child(3))).toBe(true)
    expect(editor.state.selection.anchor).toBeGreaterThan(editor.state.selection.head)
    expect(parseMarkdown(editor.getMarkdown()).eq(moved)).toBe(true)
    editor.execute("undo")
    expect(editor.state.doc.eq(original)).toBe(true)
    editor.execute("redo")
    expect(editor.state.doc.eq(moved)).toBe(true)
  })
  it("does not mutate selection or history when probing or dropping within the source range", () => {
    const editor = new Editor({ markdown: "첫째\n\n둘째\n\n셋째" })
    const [, second, third] = positions(editor)
    if (second === undefined || third === undefined) throw new Error("Missing block")
    const snapshot = editor.getSnapshot()
    expect(editor.canExecute(moveBlocks(0, third, editor.state.doc.content.size))).toBe(true)
    for (const target of [0, second, third])
      expect(editor.execute(moveBlocks(0, third, target))).toBe(false)
    expect(editor.execute(moveBlocks(1, third, editor.state.doc.content.size))).toBe(false)
    expect(editor.getSnapshot()).toBe(snapshot)
    expect(editor.canExecute("undo")).toBe(false)
  })
})
describe("Notion-style block selection controls", () => {
  it.each([10, 570])(
    "selects from the page margin at x=%s and deletes/restores the entire group",
    (x) => {
      const { editor, view, host } = setup()
      const original = editor.state.doc
      expect(pointer(view.dom, "pointerdown", x, 110).defaultPrevented).toBe(true)
      pointer(document, "pointermove", x, 280)
      pointer(document, "pointerup", x, 280)
      expect(editor.state.selection).toBeInstanceOf(BlockSelection)
      expect(host.querySelectorAll(".vlab-editor-block-selected")).toHaveLength(3)
      expect(view.hasFocus()).toBe(true)
      fireEvent.keyDown(view.dom, { key: "Delete" })
      expect(editor.getMarkdown()).toBe("넷째")
      editor.execute("undo")
      expect(editor.state.doc.eq(original)).toBe(true)
      expect(editor.state.selection).toBeInstanceOf(BlockSelection)
      expect(host.querySelectorAll(".vlab-editor-block-selected")).toHaveLength(3)
    },
  )
  it("retains the range anchor when dragging upward and extending with Shift", () => {
    const { editor, view } = setup()
    pointer(view.dom, "pointerdown", 10, 280)
    pointer(document, "pointermove", 10, 110)
    pointer(document, "pointerup", 10, 110)
    const range = editor.state.selection as BlockSelection
    expect(range.anchorBlock).toBe(positions(editor)[2])
    expect(range.headBlock).toBe(0)
    fireEvent.keyDown(view.dom, { key: "ArrowDown", shiftKey: true })
    expect((editor.state.selection as BlockSelection).headBlock).toBe(positions(editor)[1])
  })
  it("extends a selection with Shift+handle click and moves the selected group by its handle", () => {
    const { editor, host, handle, clickHandle } = setup()
    clickHandle(0)
    clickHandle(1, true)
    expect(host.querySelectorAll(".vlab-editor-block-selected")).toHaveLength(2)
    const data = new Map<string, string>()
    const transfer = {
      clearData: () => data.clear(),
      setData: (key: string, value: string) => data.set(key, value),
      getData: (key: string) => data.get(key) ?? "",
      setDragImage: vi.fn(),
      effectAllowed: "",
    }
    drag(handle, "dragstart", transfer)
    expect(data.get("text/plain")).toContain("첫째")
    expect(data.get("text/plain")).toContain("둘째")
    expect(data.get("text/plain")).not.toContain("셋째")
    drag(host, "drop", transfer, 500)
    expect(editor.getMarkdown()).toBe("셋째\n\n넷째\n\n첫째\n\n둘째")
    expect(host.querySelectorAll(".vlab-editor-block-selected")).toHaveLength(2)
    editor.execute("undo")
    expect(editor.getMarkdown()).toBe("첫째\n\n둘째\n\n셋째\n\n넷째")
  })
  it("supports Escape, Shift+arrows, group keyboard movement and Enter to resume editing", () => {
    const { editor, view, host } = setup()
    fireEvent.keyDown(view.dom, { key: "Escape" })
    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    fireEvent.keyDown(view.dom, { key: "ArrowDown", shiftKey: true })
    fireEvent.keyDown(view.dom, { key: "ArrowDown", shiftKey: true })
    expect(host.querySelectorAll(".vlab-editor-block-selected")).toHaveLength(3)
    fireEvent.keyDown(view.dom, { key: "ArrowDown", altKey: true })
    expect(editor.getMarkdown()).toBe("넷째\n\n첫째\n\n둘째\n\n셋째")
    fireEvent.keyDown(view.dom, { key: "Enter" })
    expect(editor.state.selection).toBeInstanceOf(TextSelection)
    expect(host.querySelectorAll(".vlab-editor-block-selected")).toHaveLength(0)
    expect(editor.state.selection.$from.parent.textContent).toBe("셋째")
  })
  it("supports Shift+click inside a block only while a block selection is active", () => {
    const { editor, view, host, clickHandle } = setup()
    const third = view.nodeDOM(positions(editor)[2] ?? 0) as HTMLElement
    const event = new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
      clientX: 100,
      clientY: 280,
    })
    expect(third.dispatchEvent(event)).toBe(true)
    expect(editor.state.selection).toBeInstanceOf(TextSelection)
    clickHandle(0)
    const select = new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
      clientX: 100,
      clientY: 280,
    })
    third.dispatchEvent(select)
    expect(select.defaultPrevented).toBe(true)
    expect(host.querySelectorAll(".vlab-editor-block-selected")).toHaveLength(3)
  })
  it.each(["body", "readonly", "composing", "touch", "scrollbar"])(
    "does not start margin selection on %s",
    (reason) => {
      const { editor, view, host } = setup()
      const original = editor.state.selection
      if (reason === "readonly") view.setProps({ editable: () => false })
      if (reason === "composing") vi.spyOn(view, "composing", "get").mockReturnValue(true)
      if (reason === "scrollbar") Object.defineProperty(host, "clientWidth", { value: 550 })
      const x = reason === "body" ? 100 : reason === "scrollbar" ? 570 : 10
      const event = pointer(
        view.dom,
        "pointerdown",
        x,
        110,
        reason === "touch" ? { pointerType: { value: "touch" } } : {},
      )
      pointer(document, "pointermove", x, 280)
      pointer(document, "pointerup", x, 280)
      expect(event.defaultPrevented).toBe(false)
      expect(editor.state.selection.eq(original)).toBe(true)
    },
  )
  it("leaves ordinary text selection intact and exports a closed mixed-block clipboard slice", () => {
    const { editor, view } = setup("첫째\n\n| A |\n| --- |\n| 1 |\n\n셋째")
    editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 2)))
    pointer(view.dom, "pointerdown", 100, 110)
    expect(editor.state.selection).toBeInstanceOf(TextSelection)
    pointer(view.dom, "pointerdown", 10, 110)
    pointer(document, "pointermove", 10, 200)
    pointer(document, "pointerup", 10, 200)
    const serialized = view.serializeForClipboard(editor.state.selection.content())
    expect(serialized.dom.innerHTML).toContain("<table")
    expect(serialized.text).toContain("첫째")
    const original = editor.state.doc
    fireEvent.keyDown(view.dom, { key: "Backspace" })
    expect(editor.getMarkdown()).toBe("셋째")
    editor.execute("undo")
    expect(editor.state.doc.eq(original)).toBe(true)
  })
  it("leaves an editable paragraph after deleting every selected block", () => {
    const { editor, view } = setup("첫째\n\n둘째")
    pointer(view.dom, "pointerdown", 10, 110)
    pointer(document, "pointermove", 10, 200)
    pointer(document, "pointerup", 10, 200)
    fireEvent.keyDown(view.dom, { key: "Delete" })
    expect(editor.state.doc.childCount).toBe(1)
    expect(editor.state.doc.firstChild?.type.name).toBe("paragraph")
    expect(editor.state.doc.textContent).toBe("")
    expect(editor.state.selection).toBeInstanceOf(TextSelection)
    expect(view.hasFocus()).toBe(true)
  })
  it("scrolls a bounded editor while selecting and stops on pointer release", async () => {
    const { view, host } = setup()
    host.style.overflowY = "auto"
    Object.defineProperties(host, {
      clientHeight: { value: 400 },
      scrollHeight: { value: 1000 },
    })
    pointer(view.dom, "pointerdown", 10, 110)
    pointer(document, "pointermove", 10, 390)
    await vi.waitFor(() => expect(host.scrollTop).toBeGreaterThan(0))
    pointer(document, "pointerup", 10, 390)
    const stopped = host.scrollTop
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(host.scrollTop).toBe(stopped)
    expect(host.hasAttribute("data-block-selecting")).toBe(false)
  })
  it("formats the contents of selected blocks without losing the selection range", () => {
    const { editor, clickHandle } = setup("### 제목\n\n본문\n\n끝")
    clickHandle(0)
    clickHandle(1, true)
    expect(editor.execute("bold")).toBe(true)
    expect(editor.getMarkdown()).toBe("### **제목**\n\n**본문**\n\n끝")
  })
  it("cancels selection gestures after document replacement or unmount", () => {
    const { editor, view } = setup()
    pointer(view.dom, "pointerdown", 10, 110)
    editor.setMarkdown("새 문서")
    pointer(document, "pointermove", 10, 280)
    expect(editor.state.selection).toBeInstanceOf(TextSelection)
    expect(editor.getMarkdown()).toBe("새 문서")
    editor.unmount(view)
    pointer(document, "pointerup", 10, 280)
    expect(editor.getMarkdown()).toBe("새 문서")
  })
})
