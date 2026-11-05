import { cleanup, fireEvent, render } from "@testing-library/react"
import { DOMParser, DOMSerializer } from "prosemirror-model"
import { AllSelection, TextSelection } from "prosemirror-state"
import { CellSelection, TableMap } from "prosemirror-tables"
import type { EditorView } from "prosemirror-view"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import {
  Editor,
  EditorContent,
  EditorProvider,
  insertTable,
  isCommandActive,
  MarkdownConversionError,
  parseMarkdown,
  serializeMarkdown,
  setTableAlignment,
} from "../src/index.js"

afterEach(cleanup)
beforeAll(() => {
  if (typeof Range.prototype.getClientRects !== "function") {
    Object.defineProperty(Range.prototype, "getClientRects", { value: () => [] })
    Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: () => new DOMRect() })
  }
})
function select(editor: Editor, text: string, range = false) {
  let position: number | undefined
  editor.state.doc.descendants((node, pos) => {
    if (position === undefined && node.isText && node.text?.includes(text))
      position = pos + node.text.indexOf(text)
  })
  if (position === undefined) throw new Error(`Missing ${text}`)
  editor.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, position, range ? position + text.length : position),
    ),
  )
}
function type(view: EditorView, source: string) {
  for (const char of source) {
    const { from, to } = view.state.selection
    if (
      !view.someProp("handleTextInput", (handler) =>
        handler(view, from, to, char, () => view.state.tr.insertText(char)),
      )
    )
      view.dispatch(view.state.tr.insertText(char, from, to))
  }
}
describe("GFM conversions", () => {
  it.each([
    "- [ ] 할 일\n- [x] 완료\n- 일반 항목",
    "3. [X] 번호 체크\n4. [ ] 대기",
    "- [ ] 부모\n  - [x] 자식\n  - 일반 항목",
    "> - [x] **굵게**와 ~~취소선~~",
    "~~취소~~, **~~중첩~~**, [~~링크~~](/about)",
    "| 왼쪽 | 가운데 | 오른쪽 |\n| :--- | :---: | ---: |\n| **굵게** | ~~삭제~~ | `코드` |",
    "| A | B |\n| --- | --- |\n| a\\|b | `x\\|y` |",
    "| A | B |\n| --- | --- |\n| [링크](/about) | ![이미지](/img.png) |",
    "| 빈 셀 | 값 |\n| --- | --- |\n| | |",
    "| 머리만 |\n| --- |",
    "> | A | B |\n> | --- | --- |\n> | 1 | 2 |",
    "- 表\n\n  | A | B |\n  | --- | --- |\n  | 1 | 2 |",
    "- \\[x\\] 일반 텍스트",
  ])("preserves the structure and state of %j", (source) => {
    const doc = parseMarkdown(source)
    expect(parseMarkdown(serializeMarkdown(doc)).eq(doc)).toBe(true)
  })
  it("keeps escaped check markers literal, and empty task items checked", () => {
    expect(parseMarkdown("- \\[x\\] 일반").firstChild?.firstChild?.attrs.checked).toBeNull()
    expect(parseMarkdown("- [x]").firstChild?.firstChild?.attrs.checked).toBe(true)
    expect(parseMarkdown("- [ ]").firstChild?.firstChild?.attrs.checked).toBe(false)
  })
  it("refuses unsupported merged cells rather than silently flattening them", () => {
    const doc = parseMarkdown("| A | B |\n| --- | --- |\n| 1 | 2 |")
    const editor = new Editor({ doc })
    editor.dispatch(
      editor.state.tr.setNodeMarkup(2, undefined, { ...doc.nodeAt(2)?.attrs, colspan: 2 }),
    )
    expect(() => editor.getMarkdown()).toThrow(MarkdownConversionError)
  })
})
describe("checklists and strike", () => {
  it("updates checkbox editability even when readonly changes reuse the node view", () => {
    const editor = new Editor({ markdown: "- [ ] 기존 항목" })
    const result = render(
      <EditorProvider editor={editor}>
        <EditorContent />
      </EditorProvider>,
    )
    const checkbox = result.getByRole("checkbox", { name: "완료 상태" }) as HTMLInputElement
    editor.setEditable(false)
    expect(checkbox.disabled).toBe(true)
    editor.replaceMarkdown("- [ ] 원문에서 만든 항목")
    editor.setEditable(true)
    const restored = result.getByRole("checkbox", { name: "완료 상태" }) as HTMLInputElement
    expect(restored.disabled).toBe(false)
    fireEvent.click(restored)
    expect(editor.getMarkdown()).toBe("* [x] 원문에서 만든 항목")
    editor.setEditable(false)
    expect(restored.disabled).toBe(true)
  })
  it("converts an ordinary paragraph, toggles task state via checkbox and supports undo", () => {
    const editor = new Editor({ markdown: "할 일" })
    const result = render(
      <EditorProvider editor={editor}>
        <EditorContent />
      </EditorProvider>,
    )
    editor.execute("taskList", { focus: false })
    expect(editor.getMarkdown()).toBe("* [ ] 할 일")
    expect(isCommandActive("taskList", editor.state)).toBe(true)
    fireEvent.click(result.getByRole("checkbox", { name: "완료 상태" }))
    expect(editor.getMarkdown()).toBe("* [x] 할 일")
    editor.execute("undo", { focus: false })
    expect(editor.getMarkdown()).toBe("* [ ] 할 일")
    editor.execute("taskList", { focus: false })
    expect(editor.getMarkdown()).toBe("* 할 일")
  })
  it("wraps multiple selected paragraphs and preserves nested list content", () => {
    const editor = new Editor({ markdown: "첫째\n\n둘째" })
    editor.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)))
    expect(editor.execute("taskList")).toBe(true)
    expect(editor.getMarkdown()).toContain("[ ] 첫째")
    expect(editor.getMarkdown()).toContain("[ ] 둘째")
    editor.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)))
    expect(isCommandActive("taskList", editor.state)).toBe(true)
    editor.execute("taskList")
    expect(editor.getMarkdown()).not.toContain("[ ]")
  })
  it("does not turn an ordinary parent into a task when copying a nested checked item as HTML", () => {
    const original = parseMarkdown("- 일반 부모\n  - [x] 완료 자식")
    const container = document.createElement("div")
    container.append(
      DOMSerializer.fromSchema(original.type.schema).serializeFragment(original.content),
    )
    const restored = DOMParser.fromSchema(original.type.schema).parse(container)
    expect(restored.eq(original)).toBe(true)
  })
  it("keeps the input rule's Backspace undo for task markers and strike", () => {
    const editor = new Editor()
    render(
      <EditorProvider editor={editor}>
        <EditorContent />
      </EditorProvider>,
    )
    if (!editor.view) throw new Error("Missing view")
    type(editor.view, "- [x] ")
    fireEvent.keyDown(editor.view.dom, { key: "Backspace" })
    expect(editor.state.doc.firstChild?.firstChild?.attrs.checked).toBeNull()
    expect(editor.state.doc.textContent).toBe("[x] ")
    editor.setMarkdown("")
    type(editor.view, "~~취소~~")
    fireEvent.keyDown(editor.view.dom, { key: "Backspace" })
    expect(editor.state.doc.textContent).toBe("~~취소~~")
    expect(editor.state.doc.firstChild?.firstChild?.marks).toEqual([])
  })
  it("resets the next checkbox on Enter and uses the existing list indentation commands", () => {
    const editor = new Editor({ markdown: "- [x] 첫째" })
    const result = render(
      <EditorProvider editor={editor}>
        <EditorContent />
      </EditorProvider>,
    )
    select(editor, "첫째")
    editor.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, editor.state.selection.from + 2),
      ),
    )
    fireEvent.keyDown(result.getByRole("textbox"), { key: "Enter" })
    expect(editor.state.doc.firstChild?.childCount).toBe(2)
    expect(editor.state.doc.firstChild?.child(0).attrs.checked).toBe(true)
    expect(editor.state.doc.firstChild?.child(1).attrs.checked).toBe(false)
    editor.dispatch(editor.state.tr.insertText("둘째"))
    editor.execute("indentList")
    expect(editor.getMarkdown()).toContain("  * [ ] 둘째")
    editor.execute("outdentList")
    expect(editor.state.doc.firstChild?.childCount).toBe(2)
  })
  it.each(["- [ ] 작업", "- [x] 작업", "~~취소선~~"])(
    "converts typed GFM shortcuts %s",
    (source) => {
      const editor = new Editor()
      render(
        <EditorProvider editor={editor}>
          <EditorContent />
        </EditorProvider>,
      )
      if (!editor.view) throw new Error("Missing view")
      type(editor.view, source)
      expect(editor.state.doc.eq(parseMarkdown(source))).toBe(true)
    },
  )
  it("toggles strike with commands and preserves it after export/import", () => {
    const editor = new Editor({ markdown: "지울 말" })
    select(editor, "지울 말", true)
    editor.execute("strike")
    expect(editor.getMarkdown()).toBe("~~지울 말~~")
    expect(isCommandActive("strike", editor.state)).toBe(true)
    const doc = editor.state.doc
    editor.setMarkdown(editor.getMarkdown())
    expect(editor.state.doc.eq(doc)).toBe(true)
  })
})
describe("upstream table editing", () => {
  const source = "| A | B |\n| --- | --- |\n| 1 | 2 |"
  it("inserts a table with an editable header cell, saves and undoes the insertion", () => {
    const editor = new Editor()
    expect(editor.execute(insertTable({ rows: 2, columns: 2 }))).toBe(true)
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph")
    editor.dispatch(editor.state.tr.insertText("머리"))
    expect(editor.getMarkdown()).toContain("| 머리 |  |")
    editor.execute("undo")
    expect(editor.state.doc.firstChild?.type.name).toBe("paragraph")
  })
  it.each([
    "addRowBefore",
    "addRowAfter",
    "addColumnBefore",
    "addColumnAfter",
    "deleteRow",
    "deleteColumn",
  ] as const)("roundtrips and undoes %s", (command) => {
    const editor = new Editor({ markdown: source })
    select(editor, "1")
    const original = editor.state.doc
    expect(editor.execute(command)).toBe(true)
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
    editor.execute("undo")
    expect(editor.state.doc.eq(original)).toBe(true)
  })
  it("maintains a header when deleting the original first row", () => {
    const editor = new Editor({ markdown: source })
    select(editor, "A")
    editor.execute("deleteRow")
    expect(editor.getMarkdown()).toBe("| 1 | 2 |\n| --- | --- |")
  })
  it("aligns whole columns from a rectangular cell selection", () => {
    const editor = new Editor({ markdown: source })
    const table = editor.state.doc.firstChild
    if (!table) throw new Error("Missing table")
    const map = TableMap.get(table)
    editor.dispatch(
      editor.state.tr.setSelection(
        CellSelection.create(editor.state.doc, 1 + (map.map[0] ?? 0), 1 + (map.map[3] ?? 0)),
      ),
    )
    expect(editor.execute(setTableAlignment("center"))).toBe(true)
    expect(editor.getMarkdown()).toContain("| :---: | :---: |")
    editor.execute("deleteTable")
    expect(editor.getMarkdown()).toBe("")
  })
  it("navigates cells with Tab and Shift+Tab", () => {
    const editor = new Editor({ markdown: source })
    const result = render(
      <EditorProvider editor={editor}>
        <EditorContent />
      </EditorProvider>,
    )
    select(editor, "A")
    fireEvent.keyDown(result.getByRole("textbox"), { key: "Tab" })
    expect(editor.state.selection.$from.parent.textContent).toBe("B")
    fireEvent.keyDown(result.getByRole("textbox"), { key: "Tab", shiftKey: true })
    expect(editor.state.selection.$from.parent.textContent).toBe("A")
  })
  it("pastes GFM table text using the upstream clipboard integration", () => {
    const editor = new Editor()
    render(
      <EditorProvider editor={editor}>
        <EditorContent />
      </EditorProvider>,
    )
    const event = new Event("paste", { bubbles: true, cancelable: true })
    Object.defineProperty(event, "clipboardData", {
      value: { getData: (format: string) => (format === "text/plain" ? source : "") },
    })
    if (!editor.view) throw new Error("Missing view")
    fireEvent(editor.view.dom, event)
    expect(editor.getMarkdown()).toBe(source)
    editor.execute("undo")
    expect(editor.getMarkdown()).toBe("")
  })
  it("leaves a terminal table from its last cell and reuses an existing following paragraph", () => {
    const editor = new Editor({ markdown: source })
    const result = render(
      <EditorProvider editor={editor}>
        <EditorContent />
      </EditorProvider>,
    )
    select(editor, "2")
    fireEvent.keyDown(result.getByRole("textbox"), { key: "Enter" })
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph")
    expect(editor.state.selection.$from.depth).toBe(1)
    expect(editor.state.doc.childCount).toBe(2)
    select(editor, "A")
    editor.execute("exitTable")
    expect(editor.state.doc.childCount).toBe(2)
    editor.dispatch(editor.state.tr.insertText("표 뒤"))
    expect(editor.getMarkdown()).toContain("표 뒤")
  })
})
