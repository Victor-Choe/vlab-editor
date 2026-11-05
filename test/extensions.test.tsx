import { cleanup, fireEvent, render } from "@testing-library/react"
import { Plugin } from "prosemirror-state"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { codeHighlighting } from "../src/engine/highlight.js"
import {
  createEditor,
  createEditorSchema,
  createMarkdownCodec,
  Editor,
  EditorContent,
  type EditorExtension,
  EditorProvider,
  insertImage,
  MarkdownConversionError,
  setCodeBlockLanguage,
  setLink,
} from "../src/index.js"

afterEach(cleanup)
beforeAll(() => {
  if (typeof Range.prototype.getClientRects !== "function") {
    Object.defineProperty(Range.prototype, "getClientRects", { value: () => [] })
    Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: () => new DOMRect() })
  }
})
function noteExtension(): EditorExtension {
  return {
    name: "note",
    nodes: {
      note: {
        group: "block",
        content: "text*",
        marks: "",
        defining: true,
        toDOM: () => ["aside", { "data-note": "" }, 0],
        parseDOM: [{ tag: "aside[data-note]" }],
      },
    },
    keymap: ({ schema }) => ({
      "Mod-Alt-n": (state, dispatch) => {
        const node = schema.nodes.note?.create(null, schema.text("알림"))
        if (!node) return false
        dispatch?.(state.tr.replaceSelectionWith(node))
        return true
      },
    }),
    nodeViews: {
      note: () => {
        const dom = document.createElement("aside")
        dom.dataset.noteView = "custom"
        const contentDOM = document.createElement("div")
        dom.append(contentDOM)
        return { dom, contentDOM }
      },
    },
    markdown: {
      configure: (tokenizer) => {
        tokenizer.core.ruler.after("text_join", "note-fence", (state) => {
          for (const token of state.tokens)
            if (token.type === "fence" && token.info === "note") token.type = "note_block"
        })
      },
      tokens: { note_block: { block: "note", noCloseToken: true } },
      nodes: {
        note: (state, node) => {
          state.write("```note\n")
          state.text(node.textContent, false)
          state.write("\n```")
          state.closeBlock(node)
        },
      },
    },
  }
}
describe("native ProseMirror extension adapters", () => {
  it("registers a block, Markdown rules and NodeView without changing the library", () => {
    const editor = new Editor({ extensions: [noteExtension()], markdown: "```note\n알림\n```" })
    const result = render(
      <EditorProvider editor={editor}>
        <EditorContent />
      </EditorProvider>,
    )
    expect(editor.state.doc.firstChild?.type.name).toBe("note")
    expect(result.container.querySelector("[data-note-view]")?.textContent).toBe("알림")
    expect(editor.getMarkdown()).toBe("```note\n알림\n```")
    editor.setMarkdown("```note\n새 알림\n```\n\n본문")
    expect(result.container.querySelector("[data-note-view]")?.textContent).toBe("새 알림")
    expect(editor.getMarkdown()).toContain("새 알림")
    expect(new Editor({ markdown: "```note\n알림\n```" }).state.doc.firstChild?.type.name).toBe(
      "code_block",
    )
  })
  it("keeps built-in formatting, media, shortcuts and custom keymaps working in extended schemas", () => {
    const editor = new Editor({ extensions: [noteExtension()], markdown: "본문" })
    const result = render(
      <EditorProvider editor={editor}>
        <EditorContent />
      </EditorProvider>,
    )
    editor.execute("bold")
    editor.dispatch(editor.state.tr.insertText("굵게"))
    expect(editor.getMarkdown()).toContain("**굵게**")
    editor.execute("bold")
    expect(editor.execute(setLink({ href: "/about", text: "링크" }))).toBe(true)
    expect(editor.execute(insertImage({ src: "/image.png" }))).toBe(true)
    expect(editor.getMarkdown()).toContain("![](/image.png)")
    fireEvent.keyDown(result.getByRole("textbox"), { key: "n", ctrlKey: true, altKey: true })
    expect(
      editor.state.doc.toJSON().content.some((node: { type: string }) => node.type === "note"),
    ).toBe(true)
  })
  it("supports per-editor plugin lifecycle and creates new plugin instances after replacement", () => {
    const destroy = vi.fn()
    const factory = vi.fn(() => [new Plugin({ view: () => ({ destroy }) })])
    const editor = new Editor({ extensions: [{ name: "third-party-plugin", plugins: factory }] })
    const host = document.createElement("div")
    const view = editor.mount(host)
    expect(factory).toHaveBeenCalledOnce()
    editor.setMarkdown("새 문서")
    expect(factory).toHaveBeenCalledTimes(2)
    expect(destroy).toHaveBeenCalledOnce()
    editor.unmount(view)
    expect(destroy).toHaveBeenCalledTimes(2)
  })
  it("accepts a schema-aware initial document factory and a standalone codec", () => {
    const extensions = [noteExtension()]
    const editor = new Editor({
      extensions,
      doc: (schema) => schema.node("doc", null, [schema.node("note", null, [schema.text("처음")])]),
    })
    expect(editor.getMarkdown()).toContain("처음")
    const schema = createEditorSchema(extensions)
    const codec = createMarkdownCodec(schema, extensions)
    expect(codec.serialize(codec.parse("```note\n왕복\n```"))).toContain("왕복")
  })
  it("wires the same extensions through the imperative createEditor API", () => {
    const host = document.createElement("div")
    const view = createEditor(host, {
      extensions: [noteExtension()],
      markdown: "```note\n알림\n```",
    })
    expect(host.querySelector("[data-note-view]")).not.toBeNull()
    view.destroy()
  })
  it("rejects schema/name/NodeView collisions instead of silently replacing core behavior", () => {
    expect(() => new Editor({ extensions: [{ name: "one" }, { name: "one" }] })).toThrow(
      /duplicate/,
    )
    expect(
      () => new Editor({ extensions: [{ name: "override", nodes: { paragraph: {} } }] }),
    ).toThrow(/duplicate node/)
    expect(
      () =>
        new Editor({
          extensions: [
            {
              name: "unknown",
              nodeViews: { nope: () => ({ dom: document.createElement("div") }) },
            },
          ],
        }),
    ).toThrow(/unknown NodeView/)
  })
  it("refuses Markdown export for a custom block without a codec, while retaining the document", () => {
    const extension = noteExtension()
    delete extension.markdown
    const editor = new Editor({
      extensions: [extension],
      doc: (schema) => schema.node("doc", null, [schema.node("note", null, [schema.text("보존")])]),
    })
    const doc = editor.state.doc
    expect(() => editor.getMarkdown()).toThrow(MarkdownConversionError)
    expect(editor.state.doc).toBe(doc)
  })
})
describe("optional code highlighting decorations", () => {
  const highlight = vi.fn((_language: string, code: string) => ({
    type: "root",
    children: [
      {
        type: "element",
        properties: { className: ["hljs-keyword"] },
        children: [{ type: "text", value: code }],
      },
    ],
  }))
  const highlighter = { registered: (language: string) => language === "ts", highlight }
  it("changes a language by selection or exact NodeView position, preserving metadata and undo", () => {
    const editor = new Editor({ markdown: "```ts title=example\nconst x = 1\n```" })
    expect(editor.execute(setCodeBlockLanguage("js"))).toBe(true)
    expect(editor.getMarkdown()).toContain("```js title=example")
    editor.execute("undo")
    expect(editor.getMarkdown()).toContain("```ts title=example")
    expect(editor.execute(setCodeBlockLanguage("", 0))).toBe(true)
    expect(editor.state.doc.firstChild?.attrs.params).toBe("")
    expect(editor.execute(setCodeBlockLanguage("unsafe language", 0))).toBe(false)
    expect(editor.execute(setCodeBlockLanguage("ts", -1))).toBe(false)
  })
  it("decorates code, preserves source/Markdown, caches unchanged blocks and survives replacement", () => {
    highlight.mockClear()
    const markdown = "```ts\nconst 한글 = '🙂'\n```"
    const editor = new Editor({ markdown, extensions: [codeHighlighting({ highlighter })] })
    const result = render(
      <EditorProvider editor={editor}>
        <EditorContent />
      </EditorProvider>,
    )
    expect(result.container.querySelector(".hljs-keyword")?.textContent).toBe("const 한글 = '🙂'")
    expect(editor.getMarkdown()).toBe(markdown)
    editor.dispatch(editor.state.tr.setMeta("metadata", true))
    expect(highlight).toHaveBeenCalledOnce()
    editor.dispatch(editor.state.tr.insertText("x"))
    expect(highlight).toHaveBeenCalledTimes(2)
    editor.setMarkdown(markdown)
    expect(result.container.querySelector(".hljs-keyword")).not.toBeNull()
  })
  it.each(["unknown", ""])(
    "keeps unregistered or unspecified language %j as editable text",
    (language) => {
      const editor = new Editor({
        markdown: `\`\`\`${language}\nconst x = 1\n\`\`\``,
        extensions: [codeHighlighting({ highlighter })],
      })
      const result = render(
        <EditorProvider editor={editor}>
          <EditorContent />
        </EditorProvider>,
      )
      expect(result.container.querySelector(".hljs-keyword")).toBeNull()
      expect(editor.state.doc.textContent).toBe("const x = 1")
    },
  )
  it("skips oversized blocks and safely tolerates a broken highlighting grammar", () => {
    const editor = new Editor({
      markdown: "```ts\n123456\n```",
      extensions: [codeHighlighting({ highlighter, maxCodeLength: 3 })],
    })
    const result = render(
      <EditorProvider editor={editor}>
        <EditorContent />
      </EditorProvider>,
    )
    expect(result.container.querySelector(".hljs-keyword")).toBeNull()
    const broken = new Editor({
      markdown: "```ts\ntext\n```",
      extensions: [
        codeHighlighting({
          highlighter: {
            registered: () => true,
            highlight: () => {
              throw new Error("grammar failed")
            },
          },
        }),
      ],
    })
    expect(broken.getMarkdown()).toContain("text")
  })
})
