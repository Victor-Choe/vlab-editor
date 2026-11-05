import { fireEvent, waitFor } from "@testing-library/react"
import { TextSelection } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { Editor, type EditorOptions, editorSchema, parseMarkdown } from "../src/index.js"

const mounted: {
  editor: Editor
  view: EditorView
  host: HTMLElement
}[] = []
beforeAll(() => {
  if (typeof Range.prototype.getClientRects !== "function") {
    Object.defineProperty(Range.prototype, "getClientRects", { value: () => [] })
    Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: () => new DOMRect() })
  }
})
afterEach(() => {
  for (const { editor, view, host } of mounted.splice(0)) {
    editor.unmount(view)
    host.remove()
  }
})
function setup(options: EditorOptions = {}) {
  const editor = new Editor(options)
  const host = document.createElement("div")
  document.body.append(host)
  const view = editor.mount(host)
  mounted.push({ editor, view, host })
  return { editor, view }
}
function type(view: EditorView, text: string) {
  for (const char of text) {
    const { from, to } = view.state.selection
    const handled = view.someProp("handleTextInput", (handler) =>
      handler(view, from, to, char, () => view.state.tr.insertText(char, from, to)),
    )
    if (!handled) view.dispatch(view.state.tr.insertText(char, from, to))
  }
}
function paste(view: EditorView, text: string, html = "") {
  const event = new Event("paste", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: (format: string) =>
        format === "text/html" ? html : format === "text/plain" ? text : "",
    },
  })
  fireEvent(view.dom, event)
  return event
}
describe("Markdown typing shortcuts", () => {
  it.each([
    "# 제목",
    "## 소제목",
    "### 제목 3",
    "#### 제목 4",
    "##### 제목 5",
    "###### 제목 6",
    "- 목록",
    "+ 목록",
    "* 목록",
    "3. 번호 목록",
    "0. 영부터",
    "2) 번호 목록",
    "> 인용문",
    "`코드`",
    "문장 `` `백틱` `` 다음",
    "`**굵게 아님**`",
    "`_기울임 아님_`",
    "**굵게**",
    "*기울임*",
    "__굵게__",
    "_기울임_",
    "***둘다***",
    "___둘다___",
    "문장 **굵게** 다음",
    "문장 *기울임* 다음",
    "앞**굵게**뒤",
    "# **제목**",
    "**굵게 *기울임***",
    "*기울임 **굵게***",
    "문장 **👋 안녕** 끝",
  ])("converts supported typed syntax and preserves its formatting: %s", (source) => {
    const { editor, view } = setup()
    type(view, source)
    expect(editor.state.doc.eq(parseMarkdown(source))).toBe(true)
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
  })
  it.each([
    "####### 제목",
    "문장 # 제목",
    "\\# 제목",
    "\\**안녕**",
    "**안녕\\**",
    "문장 * 안녕*",
    "*안녕 *",
    "**   **",
    "foo_bar_",
    "foo__bar__",
    "**미완성",
    "~취소선~",
    "[링크](url)",
  ])("keeps incomplete, escaped, unsupported or ambiguous input literal: %s", (source) => {
    const { editor, view } = setup()
    type(view, source)
    expect(editor.state.doc.textContent).toBe(source)
    expect(editor.state.doc.firstChild?.type.name).toBe("paragraph")
    expect(editor.state.doc.firstChild?.firstChild?.marks).toEqual([])
  })
  it("does not extend the newly applied mark to subsequent text", () => {
    const { editor, view } = setup()
    type(view, "**굵게** 그다음")
    expect(editor.state.doc.child(0).child(0).marks[0]?.type.name).toBe("strong")
    expect(editor.state.doc.child(0).child(1).marks).toEqual([])
    expect(editor.state.doc.textContent).toBe("굵게 그다음")
  })
  it("preserves surrounding text, cursor position and existing nested marks", () => {
    const { editor, view } = setup({ markdown: "앞 뒤" })
    editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)))
    type(view, "**중간**")
    expect(editor.state.doc.textContent).toBe("앞중간 뒤")
    expect(editor.state.selection.from).toBe(4)
    expect(editor.state.doc.rangeHasMark(2, 4, editorSchema.marks.strong)).toBe(true)
  })
  it("replaces selected text while retaining its existing formatting", () => {
    const { editor, view } = setup({ markdown: "**선택**" })
    editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 3)))
    type(view, "*새문장*")
    expect(editor.state.doc.textContent).toBe("새문장")
    expect(
      editor.state.doc
        .child(0)
        .child(0)
        .marks.map((mark) => mark.type.name),
    ).toEqual(["strong", "em"])
  })
  it("retains existing emphasis when typing an inline code pair", () => {
    const { editor, view } = setup({ markdown: "**선택**" })
    editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 3)))
    type(view, "`새코드`")
    expect(editor.state.doc.firstChild?.firstChild?.marks.map((mark) => mark.type.name)).toEqual([
      "strong",
      "code",
    ])
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
  })
  it("converts a suffix after a long paragraph without modifying its prefix", () => {
    const { editor, view } = setup()
    type(view, `${"앞".repeat(600)} **굵게**`)
    expect(editor.state.doc.textContent).toBe(`${"앞".repeat(600)} 굵게`)
    expect(editor.state.doc.lastChild?.lastChild?.marks[0]?.type.name).toBe("strong")
  })
  it("does not treat a truncated lookbehind window as a word boundary", () => {
    const { editor, view } = setup()
    const source = `foo_${"a".repeat(499)}_`
    type(view, source)
    expect(editor.state.doc.textContent).toBe(source)
    expect(editor.state.doc.firstChild?.firstChild?.marks).toEqual([])
  })
  it.each([
    "# ",
    "## ",
    "###### ",
    "- ",
    "3. ",
    "> ",
    "--- ",
    "___ ",
    "*** ",
    "```",
    "~~~",
    "`안녕`",
    "**안녕**",
    "*안녕*",
    "***안녕***",
  ])("Backspace immediately restores the literal input: %j", (source) => {
    const { editor, view } = setup()
    type(view, source)
    fireEvent.keyDown(view.dom, { key: "Backspace", keyCode: 8 })
    expect(editor.state.doc.firstChild?.type.name).toBe("paragraph")
    expect(editor.state.doc.textContent).toBe(source)
    expect(editor.state.doc.firstChild?.firstChild?.marks).toEqual([])
    type(view, "!")
    expect(editor.state.doc.textContent).toBe(`${source}!`)
  })
  it("supports undo/redo of the conversion without clearing preceding typing", () => {
    const { editor, view } = setup()
    type(view, "**안녕*")
    const before = editor.state.doc
    type(view, "*")
    const formatted = editor.state.doc
    expect(editor.execute("undo")).toBe(true)
    expect(editor.state.doc.eq(before)).toBe(true)
    expect(editor.execute("redo")).toBe(true)
    expect(editor.state.doc.eq(formatted)).toBe(true)
  })
  it("defers conversion until Korean composition has finished", async () => {
    const { editor, view } = setup()
    const composing = vi.spyOn(view, "composing", "get").mockReturnValue(true)
    type(view, "**안녕**")
    expect(editor.state.doc.textContent).toBe("**안녕**")
    expect(editor.state.doc.firstChild?.firstChild?.marks).toEqual([])
    composing.mockRestore()
    fireEvent.compositionEnd(view.dom, { data: "안녕" })
    await waitFor(() => expect(editor.state.doc.eq(parseMarkdown("**안녕**"))).toBe(true))
  })
  it("ignores a delayed composition callback after its view has been unmounted", async () => {
    const { editor, view } = setup()
    editor.dispatch(editor.state.tr.insertText("**안녕**"))
    fireEvent.compositionEnd(view.dom, { data: "안녕" })
    const state = editor.state
    editor.unmount(view)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(editor.state).toBe(state)
  })
  it("retains disabled shortcut options when setMarkdown creates a new state", () => {
    const { editor, view } = setup({ markdownShortcuts: false })
    type(view, "**그대로**")
    expect(editor.state.doc.textContent).toBe("**그대로**")
    editor.setMarkdown("")
    type(view, "# 그대로")
    expect(editor.state.doc.textContent).toBe("# 그대로")
    expect(editor.state.doc.firstChild?.type.name).toBe("paragraph")
  })
  it("continues lists, changes nesting with Tab and exits an empty item with Enter", () => {
    const { editor, view } = setup()
    type(view, "- 첫 항목")
    fireEvent.keyDown(view.dom, { key: "Enter", keyCode: 13 })
    type(view, "둘째 항목")
    expect(editor.state.doc.eq(parseMarkdown("- 첫 항목\n- 둘째 항목"))).toBe(true)
    fireEvent.keyDown(view.dom, { key: "Tab", keyCode: 9 })
    expect(editor.state.doc.eq(parseMarkdown("- 첫 항목\n  - 둘째 항목"))).toBe(true)
    fireEvent.keyDown(view.dom, { key: "Tab", keyCode: 9, shiftKey: true })
    expect(editor.state.doc.eq(parseMarkdown("- 첫 항목\n- 둘째 항목"))).toBe(true)
    fireEvent.keyDown(view.dom, { key: "Enter", keyCode: 13 })
    fireEvent.keyDown(view.dom, { key: "Enter", keyCode: 13 })
    type(view, "목록 밖")
    expect(editor.state.doc.eq(parseMarkdown("- 첫 항목\n- 둘째 항목\n\n목록 밖"))).toBe(true)
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
  })
  it("does not capture Tab outside a list", () => {
    const { view } = setup()
    expect(fireEvent.keyDown(view.dom, { key: "Tab", keyCode: 9 })).toBe(true)
  })
  it("leaves a quote after an empty paragraph and can continue with normal text", () => {
    const { editor, view } = setup()
    type(view, "> 인용")
    fireEvent.keyDown(view.dom, { key: "Enter", keyCode: 13 })
    fireEvent.keyDown(view.dom, { key: "Enter", keyCode: 13 })
    type(view, "일반 본문")
    expect(editor.state.doc.eq(parseMarkdown("> 인용\n\n일반 본문"))).toBe(true)
  })
  it.each(["--- ", "*** ", "___ "])(
    "converts a rule after Space while preserving an editable cursor: %j",
    (source) => {
      const { editor, view } = setup()
      type(view, source)
      expect(editor.state.doc.firstChild?.type.name).toBe("horizontal_rule")
      expect(editor.state.selection.$from.parent.type.name).toBe("paragraph")
      type(view, "구분선 뒤")
      expect(editor.state.doc.eq(parseMarkdown("---\n\n구분선 뒤"))).toBe(true)
    },
  )
  it("keeps Markdown literal inside a typed code fence and exits with Mod-Enter", () => {
    const { editor, view } = setup()
    type(view, "```")
    type(view, "# **한글**")
    fireEvent.keyDown(view.dom, { key: "Enter", keyCode: 13 })
    type(view, "- 그대로")
    expect(editor.state.doc.firstChild?.type.name).toBe("code_block")
    expect(editor.state.doc.firstChild?.textContent).toBe("# **한글**\n- 그대로")
    fireEvent.keyDown(view.dom, { key: "Enter", keyCode: 13, ctrlKey: true })
    type(view, "일반 본문")
    expect(editor.state.doc.lastChild?.type.name).toBe("paragraph")
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
  })
  it("does not continue inline code on subsequent input or reinterpret its existing contents", () => {
    const { editor, view } = setup()
    type(view, "`코드` 일반")
    expect(editor.state.doc.firstChild?.firstChild?.marks[0]?.type.name).toBe("code")
    expect(editor.state.doc.firstChild?.lastChild?.marks).toEqual([])
    editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)))
    type(view, "**그대로**")
    expect(editor.state.doc.rangeHasMark(1, 3, editorSchema.marks.strong)).toBe(false)
  })
})
describe("Markdown paste", () => {
  it("does not reinterpret Markdown pasted inside an existing inline code span", () => {
    const onMarkdownPasteError = vi.fn()
    const { editor, view } = setup({ markdown: "`코드`", onMarkdownPasteError })
    editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)))
    paste(view, "**원문** [링크](url)")
    expect(editor.state.doc.firstChild?.firstChild?.textContent).toBe("코**원문** [링크](url)드")
    expect(editor.state.doc.firstChild?.childCount).toBe(1)
    expect(editor.state.doc.firstChild?.firstChild?.marks[0]?.type.name).toBe("code")
    expect(onMarkdownPasteError).not.toHaveBeenCalled()
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
  })
  it("keeps pasted code literal, including blank lines and unsupported syntax", () => {
    const onMarkdownPasteError = vi.fn()
    const { editor, view } = setup({ markdown: "```ts\n\n```", onMarkdownPasteError })
    const source = "# **literal**\n\n[link](url)\n- [x] literal"
    paste(view, source)
    expect(editor.state.doc.firstChild?.textContent).toBe(source)
    expect(editor.state.doc.firstChild?.childCount).toBe(1)
    expect(onMarkdownPasteError).not.toHaveBeenCalled()
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
  })
  it("parses a text-only Markdown document at the current selection", () => {
    const { editor, view } = setup()
    const source =
      "###### 제목\n\n본문 **굵게**와 `코드`.\n\n- 목록\n- 다음\n\n> 인용\n\n---\n\n```js\nlet x = 1\n```"
    const event = paste(view, source)
    expect(event.defaultPrevented).toBe(true)
    expect(editor.state.doc.eq(parseMarkdown(source))).toBe(true)
  })
  it("replaces only selected text and preserves the rest of the document", () => {
    const { editor, view } = setup({ markdown: "앞 선택 뒤\n\n다른 문단" })
    editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 3, 5)))
    paste(view, "**교체**")
    expect(editor.state.doc.textContent).toBe("앞 교체 뒤다른 문단")
    expect(editor.state.doc.rangeHasMark(3, 5, editorSchema.marks.strong)).toBe(true)
    expect(editor.state.doc.childCount).toBe(2)
  })
  it.each([
    "# 지원 제목\n\n<div>미지원 HTML</div>",
    "[미지원 링크](ftp://example.com)",
    "[미지원 프로토콜](ftp://example.com)",
    "<div>HTML</div>",
  ])("retains unsupported Markdown as literal source and reports it: %j", (source) => {
    const onMarkdownPasteError = vi.fn()
    const { editor, view } = setup({ onMarkdownPasteError })
    paste(view, source)
    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n\n")).toBe(source)
    expect(editor.state.doc.childCount).toBe(source.split(/\n{2,}/).length)
    expect(editor.state.doc.firstChild?.type.name).toBe("paragraph")
    expect(onMarkdownPasteError).toHaveBeenCalledOnce()
    expect(() => editor.getMarkdown()).not.toThrow()
    expect(editor.execute("undo")).toBe(true)
    expect(editor.state.doc.textContent).toBe("")
  })
  it("pastes literal text when plain-text paste is explicitly requested", () => {
    const onMarkdownPasteError = vi.fn()
    const { editor, view } = setup({ onMarkdownPasteError })
    view.pasteText("# literal\n\n**plain**", new Event("paste") as ClipboardEvent)
    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n\n")).toBe(
      "# literal\n\n**plain**",
    )
    expect(editor.state.doc.firstChild?.type.name).toBe("paragraph")
    expect(onMarkdownPasteError).not.toHaveBeenCalled()
  })
  it("keeps HTML clipboard formatting and ProseMirror copy/paste on the native path", () => {
    const onMarkdownPasteError = vi.fn()
    const { editor, view } = setup({ onMarkdownPasteError })
    paste(view, "**literal**", "<p><strong>rich</strong> **literal**</p>")
    expect(editor.state.doc.textContent).toBe("rich **literal**")
    expect(editor.state.doc.firstChild?.firstChild?.marks[0]?.type.name).toBe("strong")
    expect(onMarkdownPasteError).not.toHaveBeenCalled()
  })
  it("separates paste history from edits immediately before and after it", () => {
    const { editor, view } = setup()
    type(view, "앞 ")
    const before = editor.state.doc
    paste(view, "**중간**")
    const pasted = editor.state.doc
    type(view, " 뒤")
    expect(editor.execute("undo")).toBe(true)
    expect(editor.state.doc.eq(pasted)).toBe(true)
    expect(editor.execute("undo")).toBe(true)
    expect(editor.state.doc.eq(before)).toBe(true)
    expect(editor.execute("redo")).toBe(true)
    expect(editor.state.doc.eq(pasted)).toBe(true)
  })
  it("uses the latest paste error callback after setMarkdown", () => {
    const old = vi.fn()
    const next = vi.fn()
    const { editor, view } = setup({ onMarkdownPasteError: old })
    editor.setCallbacks({ onMarkdownPasteError: next })
    editor.setMarkdown("")
    paste(view, "<div>미지원 HTML</div>")
    expect(old).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
  })
  it("disables Markdown paste independently from typing shortcuts", () => {
    const { editor, view } = setup({ markdownPaste: false })
    editor.setMarkdown("")
    paste(view, "**원문**")
    expect(editor.state.doc.textContent).toBe("**원문**")
    editor.setMarkdown("")
    type(view, "**서식**")
    expect(editor.state.doc.textContent).toBe("서식")
    expect(editor.state.doc.firstChild?.firstChild?.marks[0]?.type.name).toBe("strong")
  })
})
