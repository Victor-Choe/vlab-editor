import { fireEvent } from "@testing-library/react"
import type { Node as ProseMirrorNode } from "prosemirror-model"
import { NodeSelection, TextSelection } from "prosemirror-state"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import {
  BlockSelection,
  blockDragAndDrop,
  Editor,
  insertImage,
  moveBlock,
  moveBlocks,
  parseMarkdown,
  setLink,
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
function find(editor: Editor, text: string, type = "list_item") {
  let found:
    | {
        node: ProseMirrorNode
        from: number
      }
    | undefined
  editor.state.doc.descendants((node, from) => {
    if (node.type.name === type && node.firstChild?.textContent === text) found = { node, from }
  })
  if (!found) throw new Error(`Missing ${type}: ${text}`)
  return found
}
function cursor(editor: Editor, text: string) {
  let position: number | undefined
  editor.state.doc.descendants((node, from) => {
    if (node.isText && node.text === text) position = from + node.nodeSize
  })
  if (position === undefined) throw new Error(`Missing text: ${text}`)
  editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, position)))
}
function setup(markdown = "- 부모\n  - 자식\n  - 형제\n- 다음\n\n끝") {
  const editor = new Editor({ markdown, extensions: [blockDragAndDrop()] })
  mounted.push(editor)
  const host = document.createElement("div")
  document.body.append(host)
  const view = editor.mount(host)
  host.getBoundingClientRect = view.dom.getBoundingClientRect = () => new DOMRect(0, 0, 700, 700)
  editor.state.doc.descendants((node, from) => {
    if (node.isText) return
    const element = view.nodeDOM(from)
    if (element?.nodeType !== 1) return
    const text = node.firstChild?.textContent ?? node.textContent
    const y =
      text === "자식"
        ? 180
        : text === "형제"
          ? 260
          : text === "다음"
            ? 340
            : text === "끝"
              ? 440
              : 100
    const nested = ["자식", "형제"].includes(text)
    const height =
      node.type.name === "bullet_list"
        ? nested
          ? 140
          : 300
        : text === "부모" && node.type.name === "list_item" && node.childCount > 1
          ? 220
          : 40
    ;(element as HTMLElement).getBoundingClientRect = () =>
      new DOMRect(nested ? 100 : 60, y, nested ? 500 : 560, height)
  })
  const handle = host.querySelector<HTMLButtonElement>(".vlab-editor-block-handle")
  if (!handle) throw new Error("Missing handle")
  function hover(y: number) {
    fireEvent(host, new MouseEvent("pointermove", { bubbles: true, clientX: 130, clientY: y }))
  }
  return { editor, view, host, handle, hover }
}
describe("nested list blocks", () => {
  it.each(["- ", "1. ", "- [ ] "])(
    "drops an existing paragraph below a %j list item's label as an unnumbered child",
    (marker) => {
      const { editor, view, host, handle, hover } = setup(
        `${marker}항목\n\n**옮길 문단** [자료](https://example.com)`,
      )
      const original = editor.state.doc
      const sourcePosition = original.firstChild?.nodeSize ?? 0
      const source = original.nodeAt(sourcePosition)
      if (!source) throw new Error("Missing paragraph")
      ;(view.nodeDOM(sourcePosition) as HTMLElement).getBoundingClientRect = () =>
        new DOMRect(60, 500, 560, 40)
      hover(510)
      fireEvent.click(handle)
      const values = new Map<string, string>()
      const dataTransfer = {
        clearData: () => values.clear(),
        setData: (key: string, value: string) => values.set(key, value),
        getData: (key: string) => values.get(key) ?? "",
        setDragImage: () => {},
      }
      const drag = (target: HTMLElement, type: string) => {
        const event = new Event(type, { bubbles: true, cancelable: true })
        Object.defineProperties(event, {
          dataTransfer: { value: dataTransfer },
          clientX: { value: 140 },
          clientY: { value: 125 },
        })
        target.dispatchEvent(event)
      }
      drag(handle, "dragstart")
      drag(host, "dragover")
      expect(
        host.querySelector<HTMLElement>(".vlab-editor-block-drop-indicator")?.dataset.dropKind,
      ).toBe("child")
      drag(host, "drop")
      expect(editor.state.doc.childCount).toBe(1)
      const item = editor.state.doc.firstChild?.firstChild
      expect(item?.childCount).toBe(2)
      expect(item?.child(1).eq(source)).toBe(true)
      expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
      editor.execute("undo")
      expect(editor.state.doc.eq(original)).toBe(true)
    },
  )
  it.each(["- ", "1. ", "- [ ] "])(
    "moves a paragraph into an empty child paragraph in a %j list without leaving the placeholder",
    (marker) => {
      const { editor } = setup(`${marker}항목\n\n옮길 문단`)
      cursor(editor, "항목")
      editor.execute("insertListParagraph")
      const empty = editor.state.selection.$from.before()
      const source = editor.state.doc.firstChild?.nodeSize ?? 0
      const original = editor.state.doc
      expect(
        editor.execute(
          moveBlocks(source, editor.state.doc.content.size, empty, { replaceEmpty: true }),
        ),
      ).toBe(true)
      expect(editor.state.doc.firstChild?.firstChild?.childCount).toBe(2)
      expect(editor.state.doc.firstChild?.firstChild?.lastChild?.textContent).toBe("옮길 문단")
      expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
      editor.execute("undo")
      expect(editor.state.doc.eq(original)).toBe(true)
    },
  )
  it.each(["block", "text"])("targets the clicked child after a previous %s selection", (kind) => {
    const { editor, view, handle, hover } = setup()
    if (kind === "block") {
      hover(110)
      fireEvent.click(handle)
    } else cursor(editor, "끝")
    const child = find(editor, "자식")
    const paragraph = view.nodeDOM(child.from + 1) as HTMLElement
    vi.spyOn(view, "posAtCoords").mockReturnValue({ pos: child.from + 2, inside: child.from + 1 })
    fireEvent(
      paragraph,
      new MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 140,
        clientY: 190,
      }),
    )
    expect(editor.state.selection).toBeInstanceOf(TextSelection)
    expect(editor.state.selection.$from.parent.textContent).toBe("자식")
    expect(editor.execute("insertListParagraph")).toBe(true)
    expect(find(editor, "자식").node.childCount).toBe(2)
    expect(find(editor, "부모").node.childCount).toBe(2)
  })
  it.each(["- ", "1. ", "- [ ] "])(
    "moves one %j item with all its descendants and preserves Markdown",
    (marker) => {
      const indent = marker.startsWith("1.") ? "   " : "  "
      const editor = new Editor({
        markdown: `${marker}부모\n${indent}- 자식\n\n${indent}  [자료](https://example.com)\n\n${indent}  ![이미지](/image.png)\n${marker}다음\n\n끝`,
        extensions: [blockDragAndDrop()],
      })
      const original = editor.state.doc
      const parent = find(editor, "부모")
      const next = find(editor, "다음")
      expect(editor.execute(moveBlock(parent.from, next.from + next.node.nodeSize))).toBe(true)
      expect(editor.state.doc.firstChild?.firstChild?.firstChild?.textContent).toBe("다음")
      expect(editor.state.doc.firstChild?.lastChild?.eq(parent.node)).toBe(true)
      expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
      editor.execute("undo")
      expect(editor.state.doc.eq(original)).toBe(true)
    },
  )
  it("moves a nested item to its parent's level and removes the empty nested list", () => {
    const editor = new Editor({
      markdown: "- 부모\n  - 자식\n- 다음",
      extensions: [blockDragAndDrop()],
    })
    const original = editor.state.doc
    const child = find(editor, "자식")
    const next = find(editor, "다음")
    expect(editor.execute(moveBlock(child.from, next.from))).toBe(true)
    expect(editor.state.doc.firstChild?.childCount).toBe(3)
    expect(editor.state.doc.firstChild?.firstChild?.childCount).toBe(1)
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
    editor.execute("undo")
    expect(editor.state.doc.eq(original)).toBe(true)
  })
  it("moves sibling items together and promotes a selection crossing nesting levels", () => {
    const { editor } = setup()
    const child = find(editor, "자식")
    const sibling = find(editor, "형제")
    const next = find(editor, "다음")
    const selection = BlockSelection.create(editor.state.doc, child.from, sibling.from)
    expect(selection.content().content.childCount).toBe(2)
    expect(selection.content().openStart).toBe(0)
    editor.dispatch(editor.state.tr.setSelection(selection))
    expect(editor.execute(moveBlocks(selection.from, selection.to, next.from))).toBe(true)
    expect(editor.state.doc.firstChild?.childCount).toBe(4)
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
    const cross = BlockSelection.create(
      editor.state.doc,
      find(editor, "자식").from,
      find(editor, "다음").from,
    )
    expect(cross.content().content.childCount).toBe(3)
  })
  it("can place a list item outside its old list and merges adjacent compatible lists", () => {
    const editor = new Editor({
      markdown: "- 첫째\n- 둘째\n- 셋째\n\n끝",
      extensions: [blockDragAndDrop()],
    })
    const second = find(editor, "둘째")
    const end = editor.state.doc.content.size
    expect(editor.execute(moveBlock(second.from, end))).toBe(true)
    expect(editor.state.doc.lastChild?.type.name).toBe("bullet_list")
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
    const last = find(editor, "둘째")
    const firstList = editor.state.doc.firstChild
    if (!firstList) throw new Error("Missing list")
    expect(editor.execute(moveBlock(last.from, firstList.nodeSize))).toBe(true)
    expect(editor.state.doc.childCount).toBe(2)
    expect(editor.state.doc.firstChild?.childCount).toBe(3)
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
  })
  it("shows the child item handle, selects only that item and deletes/restores it", () => {
    const { editor, handle, host, hover } = setup()
    const child = find(editor, "자식")
    const original = editor.state.doc
    hover(190)
    expect(handle.dataset.blockPosition).toBe(String(child.from))
    fireEvent.click(handle)
    expect(host.querySelectorAll(".vlab-editor-block-selected")).toHaveLength(1)
    expect(editor.state.selection.from).toBe(child.from)
    fireEvent.keyDown(handle, { key: "Delete" })
    expect(editor.getMarkdown()).not.toContain("자식")
    expect(editor.getMarkdown()).toContain("부모")
    expect(editor.getMarkdown()).toContain("형제")
    editor.execute("undo")
    expect(editor.state.doc.eq(original)).toBe(true)
  })
  it("deletes the final nested item without leaving a blank bullet and preserves clipboard list type", () => {
    const { editor, view, handle, hover } = setup("1. 부모\n   1. 자식\n2. 다음\n\n끝")
    const original = editor.state.doc
    hover(190)
    fireEvent.click(handle)
    const clipboard = view.serializeForClipboard(editor.state.selection.content())
    expect(clipboard.dom.innerHTML).toContain("<ol")
    expect(clipboard.dom.innerHTML).toContain("자식")
    fireEvent.keyDown(handle, { key: "Backspace" })
    expect(editor.state.doc.firstChild?.firstChild?.childCount).toBe(1)
    expect(editor.getMarkdown()).not.toContain("자식")
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
    editor.execute("undo")
    expect(editor.state.doc.eq(original)).toBe(true)
  })
  it("adds a plain child paragraph for a link/image and moves it with its list item", () => {
    const { editor } = setup()
    cursor(editor, "자식")
    expect(editor.execute("insertListParagraph")).toBe(true)
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph")
    expect(editor.state.selection.$from.node(-1).type.name).toBe("list_item")
    expect(() => editor.getMarkdown()).not.toThrow()
    expect(editor.execute(setLink({ href: "https://example.com", text: "참고 링크" }))).toBe(true)
    expect(editor.execute("insertListParagraph")).toBe(true)
    expect(editor.execute(insertImage({ src: "/example.png", alt: "자료" }))).toBe(true)
    const child = find(editor, "자식")
    expect(child.node.childCount).toBe(3)
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
    const sibling = find(editor, "형제")
    expect(editor.execute(moveBlock(child.from, sibling.from + sibling.node.nodeSize))).toBe(true)
    expect(find(editor, "자식").node.eq(child.node)).toBe(true)
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
  })
  it("supports Mod+Enter, Tab and Shift+Tab on item block selections", () => {
    const { editor, view, handle, hover } = setup("- 부모\n- 자식\n- 다음\n\n끝")
    hover(190)
    fireEvent.click(handle)
    expect(editor.state.selection).not.toBeInstanceOf(NodeSelection)
    fireEvent.keyDown(handle, { key: "Tab" })
    expect(editor.state.doc.firstChild?.firstChild?.lastChild?.type.name).toBe("bullet_list")
    expect(editor.execute("outdentList")).toBe(true)
    cursor(editor, "자식")
    const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true }
    fireEvent.keyDown(view.dom, { key: "Enter", ...mod })
    expect(find(editor, "자식").node.childCount).toBe(2)
    expect(editor.state.selection.$from.parent.content.size).toBe(0)
  })
})
