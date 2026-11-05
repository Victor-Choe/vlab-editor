import { schema as commonMarkSchema } from "prosemirror-markdown"
import { describe, expect, it, vi } from "vitest"
import {
  Editor,
  editorSchema,
  MarkdownConversionError,
  parseMarkdown,
  serializeMarkdown,
} from "../src/index.js"

const supported = [
  "",
  "일반 본문입니다. Hello 👋",
  "# 제목 1\n\n본문 **굵게**와 *기울임*.\n\n## 제목 2",
  "첫 제목\n===\n\n둘째 제목\n---",
  "한 문단\n여러 줄\n그대로",
  "여러 줄\n제목\n===",
  "여러 줄\n제목\n---",
  "**굵게와 *기울임*** 그리고 ***둘 다***",
  "강조 __굵게__와 _기울임_ 및 안녕**굵게**하세요",
  "\\# 제목 아님\n\n\\*기울임 아님\\* \\*\\*굵게 아님\\*\\*",
  "이스케이프 \\<b\\>HTML 아님\\</b\\>와 \\[링크 아님\\](url)",
  "A &amp; B &lt;tag&gt; &#x1F44B;",
  "열 | 둘\n문자 | 그대로",
  "미완성 **마크다운과 *표시",
  "#\n\n##",
  "### 제목 3\n\n#### 제목 4\n\n##### 제목 5\n\n###### 제목 6",
  "- 첫 항목\n- **둘째**\n  - 안쪽 항목\n  - `코드`",
  "3. 셋\n4. 넷\n\n   두 번째 문단\n\n   > 목록 안 인용",
  "0. 영부터 시작\n1. 하나",
  "- 첫 문단\n\n  둘째 문단\n\n- 다음 항목",
  "> 인용 **굵게**\n>\n> - 목록\n>   1. 중첩\n>\n> > 중첩 인용",
  "---\n\n본문\n\n***",
  "문장 `코드`와 **`굵은 코드`** 그리고 `` `백틱` ``",
  "```ts\nconst greeting = '**변환 안 함**'\n\nconsole.log(greeting)\n```",
  "    들여쓴 코드\n    다음 줄",
  "````md\n```inner\n내용\n```\n````",
  "~~~a`b\n~~~안쪽\n~~~~",
  "- \\[x\\] 체크 표시를 가진 일반 텍스트",
]
describe("Markdown conversions", () => {
  it.each(supported)("preserves supported document content and marks: %j", (source) => {
    const doc = parseMarkdown(source)
    const markdown = serializeMarkdown(doc)
    expect(parseMarkdown(markdown).eq(doc)).toBe(true)
  })
  it("uses the existing editor schema and converts headings and marks", () => {
    const doc = parseMarkdown("# 제목\n\n본문 **굵게** *기울임*.")
    expect(doc.type.schema).toBe(editorSchema)
    expect(doc.child(0).attrs.level).toBe(1)
    expect(doc.child(1).child(1).marks[0]?.type.name).toBe("strong")
    expect(doc.child(1).child(3).marks[0]?.type.name).toBe("em")
    expect(serializeMarkdown(doc)).toBe("# 제목\n\n본문 **굵게** *기울임*.")
  })
  it("escapes literal HTML, entities, links and GFM-looking editor text", () => {
    const text =
      "<b>literal</b> &copy; ~~plain~~\n| a | b |\n| --- | --- |\n[link](url) ![image](url)"
    const doc = editorSchema.nodes.doc.create(null, [
      editorSchema.nodes.paragraph.create(null, editorSchema.text(text)),
    ])
    expect(parseMarkdown(serializeMarkdown(doc)).eq(doc)).toBe(true)
  })
  it("normalizes empty paragraph placeholders without discarding nonempty blocks", () => {
    const paragraph = editorSchema.nodes.paragraph
    const doc = editorSchema.nodes.doc.create(null, [
      paragraph.create(),
      paragraph.create(null, editorSchema.text("첫 문단")),
      paragraph.create(),
      paragraph.create(),
      paragraph.create(null, editorSchema.text("둘째 문단")),
      paragraph.create(),
    ])
    expect(serializeMarkdown(doc)).toBe("첫 문단\n\n둘째 문단")
    expect(parseMarkdown(serializeMarkdown(doc)).childCount).toBe(2)
    expect(serializeMarkdown(editorSchema.nodes.doc.create(null, [paragraph.create()]))).toBe("")
  })
  const unsupported = [
    ["[링크](ftp://example.com)", "link_url"],
    ["![설명](data:image/png;base64,aGVsbG8=)", "image_url"],
    ["<div>HTML</div>", "html"],
    ["문단 <b>HTML</b>", "html"],
  ]
  it.each(unsupported)("rejects unsupported syntax instead of losing it: %j", (source, feature) => {
    try {
      parseMarkdown(source ?? "")
      expect.fail("Unsupported Markdown must throw")
    } catch (error) {
      expect(error).toBeInstanceOf(MarkdownConversionError)
      if (!(error instanceof MarkdownConversionError)) throw error
      expect(error.phase).toBe("parse")
      expect(error.issues.some((issue) => issue.feature === feature)).toBe(true)
    }
  })
  it("reports one-based block starting lines and multiple unsupported features", () => {
    try {
      parseMarkdown(
        "지원 본문\n\n[링크](ftp://example.com)\n\n<div>HTML</div>\n\n![이미지](data:image/png;base64,eA==)",
      )
      expect.fail("Unsupported Markdown must throw")
    } catch (error) {
      expect(error).toBeInstanceOf(MarkdownConversionError)
      if (!(error instanceof MarkdownConversionError)) throw error
      expect(error.issues).toEqual([
        expect.objectContaining({ feature: "link_url", line: 3 }),
        expect.objectContaining({ feature: "html", line: 5 }),
        expect.objectContaining({ feature: "image_url", line: 7 }),
      ])
    }
  })
  it("rejects foreign schemas and validates heading levels at creation", () => {
    expect(() =>
      serializeMarkdown(commonMarkSchema.node("doc", null, [commonMarkSchema.node("paragraph")])),
    ).toThrow(MarkdownConversionError)
    expect(() => editorSchema.node("heading", { level: 7 })).toThrow(RangeError)
  })
  it("refuses editor states that would lose meaningful text or formatting", () => {
    const doc = editorSchema.node("doc", null, [
      editorSchema.node("code_block", { params: "ts\nextra-info" }, [
        editorSchema.text("const x = 1"),
      ]),
    ])
    expect(() => serializeMarkdown(doc)).toThrow(MarkdownConversionError)
  })
})
describe("Editor Markdown API", () => {
  it("applies source changes as a separate undo event without dropping earlier history", () => {
    const editor = new Editor({ markdown: "이전" })
    editor.dispatch(editor.state.tr.insertText("!", editor.state.doc.content.size - 1))
    editor.replaceMarkdown("# 변경한 원문")
    expect(editor.getMarkdown()).toBe("# 변경한 원문")
    editor.dispatch(editor.state.tr.insertText("후속 ", 1))
    editor.execute("undo")
    expect(editor.getMarkdown()).toBe("# 변경한 원문")
    editor.execute("undo")
    expect(editor.getMarkdown()).toBe("이전!")
    editor.execute("undo")
    expect(editor.getMarkdown()).toBe("이전")
    editor.execute("redo")
    editor.execute("redo")
    expect(editor.getMarkdown()).toBe("# 변경한 원문")
  })
  it("does not add an undo event when applying only a Markdown notation change", () => {
    const editor = new Editor({ markdown: "__원문__" })
    const before = editor.getSnapshot()
    editor.replaceMarkdown("**원문**\n")
    expect(editor.getSnapshot()).toBe(before)
    expect(editor.canExecute("undo")).toBe(false)
  })
  it("rejects invalid source edits without changing the document or its history", () => {
    const editor = new Editor({ markdown: "원문" })
    editor.dispatch(editor.state.tr.insertText("!"))
    const before = editor.getSnapshot()
    expect(() => editor.replaceMarkdown("<div>미지원 HTML</div>")).toThrow(MarkdownConversionError)
    expect(editor.getSnapshot()).toBe(before)
    editor.execute("undo")
    expect(editor.getMarkdown()).toBe("원문")
  })
  it("creates a DOM-free editor from Markdown and serializes its current state", () => {
    const editor = new Editor({ markdown: "## 제목\n\n**문서**" })
    expect(editor.view).toBeNull()
    expect(editor.state.doc.firstChild?.attrs.level).toBe(2)
    expect(editor.getMarkdown()).toBe("## 제목\n\n**문서**")
    editor.dispatch(editor.state.tr.insertText("!", editor.state.doc.content.size - 1))
    expect(editor.getMarkdown()).toContain("!")
  })
  it("rejects ambiguous initial content", () => {
    expect(() =>
      Reflect.construct(Editor, [{ doc: parseMarkdown("본문"), markdown: "다른 본문" }]),
    ).toThrow("either doc or markdown")
  })
  it("replaces documents and resets selection, stored marks and undo/redo history", () => {
    const onChange = vi.fn()
    const onUpdate = vi.fn()
    const editor = new Editor({ markdown: "이전 문서", onChange, onUpdate })
    editor.dispatch(editor.state.tr.insertText("!"))
    editor.execute("bold")
    expect(editor.canExecute("undo")).toBe(true)
    const listener = vi.fn()
    editor.subscribe(listener)
    onChange.mockClear()
    onUpdate.mockClear()
    editor.setMarkdown("# 새 문서\n\n*내용*")
    expect(editor.getMarkdown()).toBe("# 새 문서\n\n*내용*")
    expect(editor.state.selection.from).toBe(1)
    expect(editor.state.storedMarks).toBeNull()
    expect(editor.canExecute("undo")).toBe(false)
    expect(editor.canExecute("redo")).toBe(false)
    expect(onChange).toHaveBeenCalledOnce()
    expect(onUpdate).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledOnce()
  })
  it("keeps the entire previous state and history untouched on failed replacement", () => {
    const onChange = vi.fn()
    const onUpdate = vi.fn()
    const editor = new Editor({ markdown: "안전한 문서", onChange, onUpdate })
    editor.dispatch(editor.state.tr.insertText("!"))
    const previous = editor.getSnapshot()
    onChange.mockClear()
    onUpdate.mockClear()
    expect(() => editor.setMarkdown("# 제목\n\n<div>미지원 HTML</div>")).toThrow(
      MarkdownConversionError,
    )
    expect(editor.getSnapshot()).toBe(previous)
    expect(editor.canExecute("undo")).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
    expect(onUpdate).not.toHaveBeenCalled()
  })
  it("does not report a document change when replacing identical content", () => {
    const onChange = vi.fn()
    const onUpdate = vi.fn()
    const editor = new Editor({ markdown: "동일한 문서", onChange, onUpdate })
    editor.setMarkdown("동일한 문서")
    expect(onChange).not.toHaveBeenCalled()
    expect(onUpdate).toHaveBeenCalledOnce()
    editor.setMarkdown("")
    expect(editor.getMarkdown()).toBe("")
    expect(onChange).toHaveBeenCalledOnce()
  })
})
