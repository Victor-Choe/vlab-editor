import { AllSelection, NodeSelection, TextSelection } from "prosemirror-state"
import { describe, expect, it } from "vitest"
import {
  canInsertImage,
  canSetLink,
  Editor,
  editorSchema,
  getLink,
  getSelectedImage,
  insertImage,
  normalizeImageUrl,
  normalizeLinkUrl,
  parseMarkdown,
  serializeMarkdown,
  setLink,
  updateImage,
} from "../src/index.js"

function select(editor: Editor, from: number, to = from) {
  editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)))
}
describe("link and image Markdown", () => {
  it.each([
    '[링크](https://example.com "제목")',
    "[**굵게**와 *기울임* 및 `코드`](https://example.com/path?q=x&y=z)",
    "<https://example.com/path> 그리고 <hello@example.com>",
    "[메일](mailto:hello@example.com) [전화](tel:+821012345678) [목차](#section)",
    "[상대경로](../about)와 [쿼리](?page=1)",
    '![설명](/images/example.png "이미지 제목")',
    "![한글](https://example.com/한글.png)",
    "![백틱 `코드`와 **굵게** &amp; 문자](/image.png)",
    "[![클릭하는 이미지](/image.png)](https://example.com)",
    "- [목록의 링크](/about)\n- ![목록 이미지](/image.png)\n\n> [인용 링크](/quote)",
    '[참조][doc]\n\n[doc]: https://example.com "참조 제목"',
    '![이미지 참조][pic]\n\n[pic]: /image.png "사진"',
  ])("preserves media structure through export and reimport: %s", (source) => {
    const doc = parseMarkdown(source)
    expect(parseMarkdown(serializeMarkdown(doc)).eq(doc)).toBe(true)
  })
  it("keeps all image alternative text while flattening its inline formatting", () => {
    const doc = parseMarkdown("![**굵게** `코드` &amp; 일반](/image.png)")
    expect(doc.firstChild?.firstChild?.attrs.alt).toBe("굵게 코드 & 일반")
  })
  it("normalizes reference syntax and omits unused definitions", () => {
    expect(serializeMarkdown(parseMarkdown("[문서][doc]\n\n[doc]: /docs"))).toBe("[문서](/docs)")
    expect(serializeMarkdown(parseMarkdown("[unused]: /docs"))).toBe("")
  })
})
describe("media URL contracts", () => {
  it.each([
    "javascript:alert(1)",
    " JAVASCRIPT:alert(1) ",
    "java\nscript:alert(1)",
    "java%73cript:alert(1)",
    "vbscript:run",
    "file:///tmp/a",
    "data:text/html,test",
    "blob:https://example.com/id",
    "ftp://example.com",
    "https:\\example.com",
    "",
    "https:",
  ])("rejects unsupported destinations: %j", (source) => {
    expect(normalizeLinkUrl(source)).toBeNull()
    expect(normalizeImageUrl(source)).toBeNull()
  })
  it("normalizes spaces and Unicode consistently with the Markdown parser", () => {
    const link = normalizeLinkUrl(" https://example.com/한 글?q=값 ")
    expect(link).toBe("https://example.com/%ED%95%9C%20%EA%B8%80?q=%EA%B0%92")
    const editor = new Editor()
    editor.execute(setLink({ href: "https://example.com/한 글", text: "한글" }))
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
  })
  it("allows web/relative image URLs and restricts non-image protocols", () => {
    for (const source of [
      "https://example.com/a.png",
      "/images/a.png",
      "./a.png",
      "../a.png",
      "images/a.png",
      "//example.com/a.png",
    ])
      expect(normalizeImageUrl(source)).not.toBeNull()
    expect(normalizeImageUrl("mailto:test@example.com")).toBeNull()
    expect(normalizeImageUrl("data:image/png;base64,AAA=")).toBeNull()
    expect(() => editorSchema.marks.link.create({ href: "javascript:alert(1)" })).toThrow(
      RangeError,
    )
    expect(() => editorSchema.nodes.image.create({ src: "data:text/html,test" })).toThrow(
      RangeError,
    )
  })
  it("does not create active links from unsafe Markdown destinations", () => {
    const doc = parseMarkdown("[문자](javascript:alert(1))")
    expect(doc.firstChild?.firstChild?.marks).toEqual([])
  })
})
describe("link editing commands", () => {
  it("applies a link to selected text, preserving marks and undo/redo", () => {
    const editor = new Editor({ markdown: "**굵게** 다음" })
    select(editor, 1, 3)
    const before = editor.state.doc
    const command = setLink({ href: "https://example.com", title: "설명" })
    expect(editor.canExecute(command)).toBe(true)
    expect(editor.state.doc).toBe(before)
    editor.execute(command)
    expect(getLink(editor.state)).toEqual({
      from: 1,
      to: 3,
      href: "https://example.com",
      title: "설명",
    })
    expect(editor.state.doc.firstChild?.firstChild?.marks.map((mark) => mark.type.name)).toEqual([
      "link",
      "strong",
    ])
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
    editor.execute("undo")
    expect(editor.state.doc.eq(before)).toBe(true)
    editor.execute("redo")
    expect(getLink(editor.state)?.href).toBe("https://example.com")
  })
  it("edits the complete link at a cursor across text with different marks", () => {
    const editor = new Editor({ markdown: '[**첫째**와 *둘째*](/old "이전") 뒤' })
    select(editor, 2)
    editor.execute(setLink({ href: "/new", title: "새 제목" }))
    expect(editor.state.doc.eq(parseMarkdown('[**첫째**와 *둘째*](/new "새 제목") 뒤'))).toBe(true)
    const range = getLink(editor.state)
    expect(range?.from).toBe(1)
    expect(range?.to).toBe(7)
  })
  it("finds links at both cursor boundaries and removes the entire link without deleting text", () => {
    const editor = new Editor({ markdown: "[연결](/old) 뒤" })
    select(editor, 3)
    expect(getLink(editor.state)?.href).toBe("/old")
    expect(editor.execute("removeLink")).toBe(true)
    expect(editor.state.doc.textContent).toBe("연결 뒤")
    expect(editor.state.doc.firstChild?.firstChild?.marks).toEqual([])
    editor.execute("undo")
    select(editor, 1)
    expect(getLink(editor.state)?.href).toBe("/old")
  })
  it("removes only a nonempty selection from a longer link", () => {
    const editor = new Editor({ markdown: "[abcdef](/old)" })
    select(editor, 3, 5)
    editor.execute("removeLink")
    expect(editor.getMarkdown()).toBe("[ab](/old)cd[ef](/old)")
  })
  it("inserts a label or URL at an empty cursor and leaves following input unlinked", () => {
    const editor = new Editor()
    editor.execute(setLink({ href: "/docs", text: "문서" }))
    editor.dispatch(editor.state.tr.insertText(" 뒤"))
    expect(editor.getMarkdown()).toBe("[문서](/docs) 뒤")
    editor.setMarkdown("")
    editor.execute(setLink({ href: "/about" }))
    expect(editor.getMarkdown()).toBe("[/about](/about)")
  })
  it("replaces a label only when explicitly requested", () => {
    const editor = new Editor({ markdown: "[이전](/old)" })
    select(editor, 2)
    editor.execute(setLink({ href: "/new", text: "새 글자" }))
    expect(editor.getMarkdown()).toBe("[새 글자](/new)")
  })
  it("keeps label emphasis when the link follows unformatted text", () => {
    const editor = new Editor({ markdown: "앞 [**이전**](/old) 뒤" })
    select(editor, 4)
    editor.execute(setLink({ href: "/new", text: "새이름" }))
    expect(editor.getMarkdown()).toBe("앞 [**새이름**](/new) 뒤")
    editor.execute("removeLink")
    expect(editor.getMarkdown()).toBe("앞 **새이름** 뒤")
  })
  it("handles a document selection without flattening paragraphs", () => {
    const editor = new Editor({ markdown: "첫째\n\n둘째" })
    editor.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)))
    expect(editor.execute(setLink({ href: "/docs" }))).toBe(true)
    expect(editor.state.doc.childCount).toBe(2)
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
    expect(editor.execute(setLink({ href: "/docs", text: "교체" }))).toBe(false)
  })
  it("rejects invalid destinations and code-block targets without changing state", () => {
    const editor = new Editor({ markdown: "본문" })
    const before = editor.getSnapshot()
    expect(editor.execute(setLink({ href: "javascript:alert(1)" }))).toBe(false)
    expect(editor.getSnapshot()).toBe(before)
    editor.setMarkdown("```\n코드\n```")
    expect(canSetLink(editor.state)).toBe(false)
    expect(editor.execute(setLink({ href: "/docs" }))).toBe(false)
  })
})
describe("image editing commands", () => {
  it("keeps insertion and attribute edits as separate undoable operations", () => {
    const editor = new Editor()
    editor.execute(insertImage({ src: "/first.png", alt: "이전" }))
    editor.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 1)))
    editor.execute(updateImage({ src: "/second.png", alt: "수정" }))
    editor.execute("undo")
    expect(editor.state.doc.firstChild?.firstChild?.attrs.src).toBe("/first.png")
    editor.execute("undo")
    expect(editor.getMarkdown()).toBe("")
  })
  it("inserts an image at the selection and exports URL, alt and title", () => {
    const editor = new Editor({ markdown: "앞 선택 뒤" })
    select(editor, 3, 5)
    const before = editor.state.doc
    expect(editor.execute(insertImage({ src: "/image.png", alt: "설명", title: "제목" }))).toBe(
      true,
    )
    expect(editor.state.doc.eq(parseMarkdown('앞 ![설명](/image.png "제목") 뒤'))).toBe(true)
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
    editor.execute("undo")
    expect(editor.state.doc.eq(before)).toBe(true)
  })
  it("updates only the selected image and keeps its link", () => {
    const editor = new Editor({ markdown: "[![이전](/old.png)](/docs) 뒤" })
    editor.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 1)))
    expect(getSelectedImage(editor.state)?.src).toBe("/old.png")
    editor.execute(updateImage({ src: "/new.png", alt: "새 설명", title: "사진" }))
    expect(getSelectedImage(editor.state)).toEqual({
      from: 1,
      to: 2,
      src: "/new.png",
      alt: "새 설명",
      title: "사진",
    })
    expect(getLink(editor.state)?.href).toBe("/docs")
    expect(parseMarkdown(editor.getMarkdown()).eq(editor.state.doc)).toBe(true)
  })
  it("inserts an image into an empty document and refuses code or invalid URLs", () => {
    const editor = new Editor()
    expect(canInsertImage(editor.state)).toBe(true)
    expect(editor.execute(insertImage({ src: "/image.png" }))).toBe(true)
    expect(editor.getMarkdown()).toBe("![](/image.png)")
    const before = editor.getSnapshot()
    expect(editor.execute(insertImage({ src: "blob:https://example.com/id" }))).toBe(false)
    expect(editor.getSnapshot()).toBe(before)
    editor.setMarkdown("```\n코드\n```")
    expect(canInsertImage(editor.state)).toBe(false)
    expect(editor.execute(insertImage({ src: "/image.png" }))).toBe(false)
  })
})
