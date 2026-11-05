import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { AllSelection, NodeSelection, TextSelection } from "prosemirror-state"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import {
  BlockquoteButton,
  BulletListButton,
  CodeBlockButton,
  Editor,
  EditorContent,
  EditorProvider,
  editorSchema,
  HeadingButton,
  HorizontalRuleButton,
  headingLevels,
  IndentListButton,
  InlineCodeButton,
  isCommandActive,
  OrderedListButton,
  OutdentListButton,
  parseMarkdown,
  ToolBar,
} from "../src/index.js"

afterEach(cleanup)
beforeAll(() => {
  if (typeof Range.prototype.getClientRects !== "function") {
    Object.defineProperty(Range.prototype, "getClientRects", { value: () => [] })
    Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: () => new DOMRect() })
  }
})
function selectText(editor: Editor, text: string, selected = false) {
  let position: number | undefined
  editor.state.doc.descendants((node, pos) => {
    if (position !== undefined || !node.isText) return
    const index = node.text?.indexOf(text) ?? -1
    if (index !== -1) position = pos + index
  })
  if (position === undefined) throw new Error(`Text not found: ${text}`)
  editor.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(
        editor.state.doc,
        position,
        selected ? position + text.length : position,
      ),
    ),
  )
}
describe("basic formatting commands", () => {
  it("supports whole-document selection through list conversion and removal", () => {
    const editor = new Editor({ markdown: "첫째\n\n둘째" })
    const before = editor.state.doc
    editor.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)))
    editor.execute("bulletList")
    editor.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)))
    expect(isCommandActive("bulletList", editor.state)).toBe(true)
    expect(editor.canExecute("bulletList")).toBe(true)
    editor.execute("orderedList")
    expect(editor.state.doc.firstChild?.type.name).toBe("ordered_list")
    editor.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)))
    expect(isCommandActive("orderedList", editor.state)).toBe(true)
    editor.execute("orderedList")
    expect(editor.state.doc.eq(before)).toBe(true)
  })
  it.each(["blockquote", "codeBlock"] as const)(
    "toggles %s off with a whole-document selection",
    (command) => {
      const editor = new Editor({ markdown: "내용" })
      const before = editor.state.doc
      editor.execute(command)
      editor.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)))
      expect(isCommandActive(command, editor.state)).toBe(true)
      editor.execute(command)
      expect(editor.state.doc.eq(before)).toBe(true)
    },
  )
  it.each(headingLevels)("creates and roundtrips H%i from the public command", (level) => {
    const editor = new Editor({ markdown: "제목" })
    const before = editor.state
    expect(editor.canExecute(`heading${level}`)).toBe(true)
    expect(editor.state).toBe(before)
    expect(editor.execute(`heading${level}`)).toBe(true)
    expect(editor.state.doc.eq(parseMarkdown(`${"#".repeat(level)} 제목`))).toBe(true)
    expect(isCommandActive(`heading${level}`, editor.state)).toBe(true)
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
  })
  it.each([
    ["bulletList", "- 본문"],
    ["orderedList", "1. 본문"],
    ["blockquote", "> 본문"],
    ["codeBlock", "```\n본문\n```"],
  ] as const)(
    "toggles %s through the same schema as Markdown and can undo it",
    (command, source) => {
      const editor = new Editor({ markdown: "본문" })
      const before = editor.state.doc
      expect(editor.execute(command)).toBe(true)
      expect(editor.state.doc.eq(parseMarkdown(source))).toBe(true)
      expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
      expect(isCommandActive(command, editor.state)).toBe(true)
      expect(editor.execute("undo")).toBe(true)
      expect(editor.state.doc.eq(before)).toBe(true)
      expect(editor.execute("redo")).toBe(true)
      expect(editor.execute(command)).toBe(true)
      expect(editor.state.doc.eq(before)).toBe(true)
    },
  )
  it("wraps selected paragraphs as separate list items and preserves the selection", () => {
    const editor = new Editor({ markdown: "첫 문단\n\n둘째 문단\n\n남겨둘 문단" })
    editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 11)))
    expect(editor.execute("bulletList")).toBe(true)
    const list = editor.state.doc.firstChild
    expect(list?.type.name).toBe("bullet_list")
    expect(list?.childCount).toBe(2)
    expect(editor.state.doc.lastChild?.textContent).toBe("남겨둘 문단")
    expect(
      editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, " "),
    ).toContain("첫 문단")
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
  })
  it("switches the nearest shared list kind without losing items or nested structure", () => {
    const editor = new Editor({ markdown: "- 첫 항목\n  - 안쪽\n- 둘째 항목" })
    const before = editor.state.doc
    selectText(editor, "첫 항목")
    editor.execute("orderedList")
    expect(editor.state.doc.firstChild?.type.name).toBe("ordered_list")
    expect(editor.state.doc.firstChild?.childCount).toBe(2)
    expect(editor.state.doc.firstChild?.firstChild?.lastChild?.type.name).toBe("bullet_list")
    expect(isCommandActive("orderedList", editor.state)).toBe(true)
    expect(isCommandActive("bulletList", editor.state)).toBe(false)
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
    editor.execute("bulletList")
    expect(editor.state.doc.eq(before)).toBe(true)
  })
  it("lifts only the selected item when toggling a list off", () => {
    const editor = new Editor({ markdown: "- 첫 항목\n- 둘째 항목\n- 셋째 항목" })
    selectText(editor, "둘째 항목")
    editor.execute("bulletList")
    expect(editor.state.doc.childCount).toBe(3)
    expect(editor.state.doc.child(0).type.name).toBe("bullet_list")
    expect(editor.state.doc.child(1).type.name).toBe("paragraph")
    expect(editor.state.doc.child(1).textContent).toBe("둘째 항목")
    expect(editor.state.doc.child(2).type.name).toBe("bullet_list")
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
  })
  it("indents and outdents an item with the upstream list commands", () => {
    const editor = new Editor({ markdown: "- 첫 항목\n- 둘째 항목" })
    const before = editor.state.doc
    expect(editor.canExecute("indentList")).toBe(false)
    selectText(editor, "둘째 항목")
    expect(editor.execute("indentList")).toBe(true)
    expect(editor.state.doc.firstChild?.childCount).toBe(1)
    expect(editor.state.doc.firstChild?.firstChild?.lastChild?.type.name).toBe("bullet_list")
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
    expect(editor.execute("outdentList")).toBe(true)
    expect(editor.state.doc.eq(before)).toBe(true)
  })
  it("removes a quote around a list without lifting or flattening the list items", () => {
    const editor = new Editor({ markdown: "> - 첫 항목\n> - 둘째 항목" })
    selectText(editor, "첫 항목")
    expect(editor.execute("blockquote")).toBe(true)
    expect(editor.state.doc.eq(parseMarkdown("- 첫 항목\n- 둘째 항목"))).toBe(true)
  })
  it("preserves existing emphasis when applying inline code to selected text", () => {
    const editor = new Editor({ markdown: "**한글 코드**" })
    selectText(editor, "한글 코드", true)
    expect(editor.execute("inlineCode")).toBe(true)
    expect(editor.state.doc.firstChild?.firstChild?.marks.map((mark) => mark.type.name)).toEqual([
      "strong",
      "code",
    ])
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
  })
  it("splits text around an inserted rule and places the cursor after it", () => {
    const editor = new Editor({ markdown: "앞뒤" })
    editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)))
    expect(editor.execute("horizontalRule")).toBe(true)
    expect(editor.state.doc.eq(parseMarkdown("앞\n\n---\n\n뒤"))).toBe(true)
    expect(editor.state.selection.$from.parent.textContent).toBe("뒤")
    expect(editor.state.selection.$from.parentOffset).toBe(0)
    editor.execute("undo")
    expect(editor.state.doc.textContent).toBe("앞뒤")
  })
  it("leaves an editable paragraph after a terminal rule and can export it", () => {
    const editor = new Editor()
    editor.execute("horizontalRule")
    expect(editor.state.doc.firstChild?.type.name).toBe("horizontal_rule")
    expect(editor.state.doc.lastChild?.type.name).toBe("paragraph")
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph")
    expect(editor.getMarkdown()).toBe("---")
  })
  it("disables inline formatting inside code blocks and retains raw contents", () => {
    const editor = new Editor({ markdown: "```ts\n**literal**\n```" })
    expect(editor.canExecute("bold")).toBe(false)
    expect(editor.canExecute("italic")).toBe(false)
    expect(editor.canExecute("inlineCode")).toBe(false)
    expect(editor.canExecute("horizontalRule")).toBe(false)
    expect(editor.getMarkdown()).toBe("```ts\n**literal**\n```")
  })
})
describe("composable formatting controls", () => {
  it("connects new controls, active states and disabled states through the provider", () => {
    const editor = new Editor({ markdown: "편집할 문장" })
    const result = render(
      <EditorProvider editor={editor}>
        <ToolBar>
          <HeadingButton level={6} />
          <BulletListButton />
          <OrderedListButton />
          <BlockquoteButton />
          <InlineCodeButton />
          <CodeBlockButton />
          <HorizontalRuleButton />
          <IndentListButton />
          <OutdentListButton />
        </ToolBar>
        <EditorContent />
      </EditorProvider>,
    )
    const button = (name: string) => result.getByRole("button", { name })
    fireEvent.click(button("제목 6"))
    expect(editor.state.doc.firstChild?.attrs.level).toBe(6)
    expect(button("제목 6").getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(button("코드 블록"))
    expect(button("코드 블록").getAttribute("aria-pressed")).toBe("true")
    expect(button("인라인 코드").hasAttribute("disabled")).toBe(true)
    fireEvent.click(button("코드 블록"))
    fireEvent.click(button("글머리 목록"))
    expect(button("글머리 목록").getAttribute("aria-pressed")).toBe("true")
    expect(button("목록 들여쓰기").hasAttribute("disabled")).toBe(true)
    fireEvent.click(button("번호 목록"))
    expect(button("번호 목록").getAttribute("aria-pressed")).toBe("true")
    expect(button("글머리 목록").getAttribute("aria-pressed")).toBe("false")
    act(() => editor.execute("orderedList"))
    fireEvent.click(button("인용문"))
    expect(button("인용문").getAttribute("aria-pressed")).toBe("true")
    expect(button("구분선").hasAttribute("aria-pressed")).toBe(false)
    expect(editor.state.doc.firstChild?.type).toBe(editorSchema.nodes.blockquote)
  })
})
