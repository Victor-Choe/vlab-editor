import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import {
  Editor,
  EditorContent,
  EditorProvider,
  editorSchema,
  getTableOfContents,
  navigateToHeading,
  parseMarkdown,
  type TableOfContentsEntry,
} from "../src/index.js"

beforeAll(() => {
  if (typeof Range.prototype.getClientRects !== "function") {
    Object.defineProperty(Range.prototype, "getClientRects", { value: () => [] })
    Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: () => new DOMRect() })
  }
})
afterEach(cleanup)
function flatten(entries: TableOfContentsEntry[]): TableOfContentsEntry[] {
  return entries.flatMap((entry) => [entry, ...flatten(entry.children)])
}
describe("table of contents", () => {
  it("numbers nested headings in document order and resets child numbering for each parent", () => {
    const doc = parseMarkdown(
      "# 트랜잭션\n\n본문\n\n## 커밋과 롤백\n\n### 롤백 실습\n\n## 격리 수준\n\n# 인덱스\n\n## 실행 계획",
    )
    const original = doc.toJSON()
    const entries = flatten(getTableOfContents(doc))
    expect(entries.map(({ number, title }) => `${number} ${title}`)).toEqual([
      "1 트랜잭션",
      "1.1 커밋과 롤백",
      "1.1.1 롤백 실습",
      "1.2 격리 수준",
      "2 인덱스",
      "2.1 실행 계획",
    ])
    for (const entry of entries) expect(doc.nodeAt(entry.position)?.textContent).toBe(entry.title)
    expect(doc.toJSON()).toEqual(original)
  })
  it("attaches skipped levels to the closest preceding shallower heading", () => {
    const entries = getTableOfContents(
      parseMarkdown("### 시작\n\n###### 깊은 제목\n\n#### 옆 제목\n\n# 새 장\n\n### 하위 제목"),
    )
    expect(flatten(entries).map(({ number, level }) => [number, level])).toEqual([
      ["1", 3],
      ["1.1", 6],
      ["1.2", 4],
      ["2", 1],
      ["2.1", 3],
    ])
  })
  it("extracts nested and formatted headings while excluding paragraphs and code", () => {
    const doc = parseMarkdown(
      "본문 **굵게**\n\n```md\n# 코드 안 제목\n```\n\n# **트랜잭션**과 `SQL`\n\n> ## 인용문 제목\n\n- 항목\n\n  ### 목록 안 제목",
    )
    expect(flatten(getTableOfContents(doc)).map(({ title, number }) => [title, number])).toEqual([
      ["트랜잭션과 SQL", "1"],
      ["인용문 제목", "1.1"],
      ["목록 안 제목", "1.1.1"],
    ])
    expect(getTableOfContents(parseMarkdown("일반 본문만 있습니다."))).toEqual([])
  })
  it("labels empty headings and recalculates positions after changes", () => {
    const doc = editorSchema.node("doc", null, [
      editorSchema.node("heading", { level: 1 }),
      editorSchema.node("heading", { level: 2 }, [editorSchema.text("하위 제목")]),
    ])
    expect(getTableOfContents(doc)[0]?.title).toBe("제목 없음")
    const editor = new Editor({ doc })
    const previous = flatten(getTableOfContents(editor.state.doc))[1]?.position ?? -1
    editor.dispatch(editor.state.tr.insertText("추가", 1))
    const updated = flatten(getTableOfContents(editor.state.doc))
    expect(updated[0]?.title).toBe("추가")
    expect(updated[1]?.position).toBe(previous + 2)
    editor.dispatch(editor.state.tr.delete(0, editor.state.doc.firstChild?.nodeSize ?? 0))
    expect(
      flatten(getTableOfContents(editor.state.doc)).map(({ number, title }) => [number, title]),
    ).toEqual([["1", "하위 제목"]])
  })
  it.each([true, false])(
    "navigates without changing document content (editable: %s)",
    (editable) => {
      const onChange = vi.fn()
      const editor = new Editor({
        markdown: "# 같은 제목\n\n본문\n\n# 같은 제목",
        editable,
        onChange,
      })
      const result = render(
        <EditorProvider editor={editor}>
          <EditorContent />
        </EditorProvider>,
      )
      const original = editor.state.doc
      const target = getTableOfContents(original)[1]?.position ?? -1
      expect(navigateToHeading(editor, target)).toBe(true)
      expect(editor.state.selection.from).toBe(target + 1)
      expect(editor.state.selection.$from.parent.type.name).toBe("heading")
      expect(editor.state.doc).toBe(original)
      expect(onChange).not.toHaveBeenCalled()
      if (editable) expect(result.getByRole("textbox").contains(document.activeElement)).toBe(true)
    },
  )
  it("ignores invalid, stale, and unmounted navigation targets", () => {
    const editor = new Editor({ markdown: "# 제목" })
    expect(navigateToHeading(editor, 0)).toBe(false)
    const result = render(
      <EditorProvider editor={editor}>
        <EditorContent />
      </EditorProvider>,
    )
    for (const position of [-1, 0.5, 1, 10000, Number.NaN])
      expect(navigateToHeading(editor, position)).toBe(false)
    editor.setMarkdown("일반 문단")
    expect(navigateToHeading(editor, 0)).toBe(false)
    result.unmount()
    expect(navigateToHeading(editor, 0)).toBe(false)
  })
})
