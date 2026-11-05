import MarkdownIt from "markdown-it"
import type Token from "markdown-it/lib/token.mjs"
import { defaultMarkdownSerializer, MarkdownParser, MarkdownSerializer } from "prosemirror-markdown"
import { Fragment, type Node, type Schema } from "prosemirror-model"
import type { EditorExtension } from "./extensions.js"
import { editorSchema, editorTypes } from "./schema.js"
import { normalizeImageUrl, normalizeLinkUrl } from "./urls.js"
export interface MarkdownIssue {
  readonly feature: string
  readonly message: string
  readonly line?: number
}
export class MarkdownConversionError extends Error {
  readonly phase: "parse" | "serialize"
  readonly issues: readonly MarkdownIssue[]
  constructor(
    phase: "parse" | "serialize",
    issues: readonly MarkdownIssue[],
    options?: ErrorOptions,
  ) {
    super(
      issues.map((issue) => `${issue.line ? `${issue.line}행: ` : ""}${issue.message}`).join("\n"),
      options,
    )
    this.name = "MarkdownConversionError"
    this.phase = phase
    this.issues = issues
  }
}
const supportedTokens = new Set([
  "paragraph_open",
  "paragraph_close",
  "heading_open",
  "heading_close",
  "inline",
  "text",
  "softbreak",
  "hardbreak",
  "strong_open",
  "strong_close",
  "em_open",
  "em_close",
  "blockquote_open",
  "blockquote_close",
  "bullet_list_open",
  "bullet_list_close",
  "ordered_list_open",
  "ordered_list_close",
  "list_item_open",
  "list_item_close",
  "hr",
  "code_inline",
  "code_block",
  "fence",
  "link_open",
  "link_close",
  "image",
  "s_open",
  "s_close",
  "table_open",
  "table_close",
  "tr_open",
  "tr_close",
  "thead_open",
  "thead_close",
  "tbody_open",
  "tbody_close",
  "th_open",
  "th_close",
  "td_open",
  "td_close",
])
function unsupportedFeature(type: string): {
  feature: string
  label: string
} {
  if (/^(table|thead|tbody|tr|th|td)_/.test(type)) return { feature: "table", label: "표" }
  if (/^(bullet_list|ordered_list|list_item)_/.test(type))
    return { feature: "list", label: "목록·체크리스트" }
  if (type.startsWith("html_")) return { feature: "html", label: "HTML" }
  if (type === "fence" || type === "code_block")
    return { feature: "code_block", label: "코드 블록" }
  const features: Record<string, string> = {
    blockquote_open: "인용문",
    hr: "구분선",
    link_open: "링크",
    image: "이미지",
    code_inline: "인라인 코드",
    s_open: "취소선",
    hardbreak: "강제 줄바꿈",
  }
  return { feature: type.replace(/_open$/, ""), label: features[type] ?? type }
}
export interface MarkdownCodec {
  parse(markdown: string): Node
  serialize(doc: Node): string
}
export function createMarkdownCodec(
  schema: Schema = editorSchema,
  extensions: readonly EditorExtension[] = [],
): MarkdownCodec {
  const extraTokens = Object.assign(
    {},
    ...extensions.map((extension) => extension.markdown?.tokens),
  ) as Record<string, import("prosemirror-markdown").ParseSpec>
  const tokenizer = new MarkdownIt("commonmark", { html: true }).enable(["table", "strikethrough"])
  for (const extension of extensions) extension.markdown?.configure?.(tokenizer)
  tokenizer.core.ruler.after("text_join", "vlab-editor-gfm", (state) => {
    const result: Token[] = []
    for (let index = 0; index < state.tokens.length; index++) {
      const token = state.tokens[index]
      if (!token) continue
      if (token.type === "html_block" && /^(?:\s*<br\s*\/?\s*>)+\s*$/i.test(token.content)) {
        const inline = new state.Token("inline", "", 0)
        inline.children = Array.from(
          token.content.matchAll(/<br\s*\/?\s*>/gi),
          () => new state.Token("hardbreak", "br", 0),
        )
        result.push(
          new state.Token("paragraph_open", "p", 1),
          inline,
          new state.Token("paragraph_close", "p", -1),
        )
        continue
      }
      if (token.type === "list_item_open" && state.tokens[index + 1]?.type === "paragraph_open") {
        const inline = state.tokens[index + 2]
        const first = inline?.children?.[0]
        const match = inline?.content.match(/^\[([ xX])\](?:[ \t]+|$)/)
        if (match && first?.type === "text" && first.content.startsWith(match[0])) {
          token.attrSet("data-checked", String(match[1] !== " "))
          first.content = first.content.slice(match[0].length)
        }
      }
      if (token.type === "th_close" || token.type === "td_close")
        result.push(new state.Token("paragraph_close", "p", -1))
      result.push(token)
      if (token.type === "th_open" || token.type === "td_open")
        result.push(new state.Token("paragraph_open", "p", 1))
    }
    state.tokens = result
  })
  tokenizer.core.ruler.after("vlab-editor-gfm", "vlab-editor-supported-markdown", (state) => {
    const issues = new Map<string, MarkdownIssue>()
    const addIssue = (feature: string, message: string, line?: number) => {
      if (!issues.has(feature)) issues.set(feature, { feature, message, ...(line ? { line } : {}) })
    }
    const visit = (tokens: readonly Token[], parentLine?: number) => {
      for (const token of tokens) {
        const line = token.map ? token.map[0] + 1 : parentLine
        if (token.type === "text_special") token.type = "text"
        if (token.type === "html_inline" && /^<br\s*\/?\s*>$/i.test(token.content))
          token.type = "hardbreak"
        if (token.type === "link_open" && normalizeLinkUrl(token.attrGet("href")) === null) {
          addIssue("link_url", "지원하지 않는 링크 주소입니다.", line)
        }
        if (token.type === "image" && normalizeImageUrl(token.attrGet("src")) === null) {
          addIssue("image_url", "지원하지 않는 이미지 주소입니다.", line)
        }
        if (
          !supportedTokens.has(token.type) &&
          !extraTokens[token.type.replace(/_(?:open|close)$/, "")] &&
          token.nesting !== -1
        ) {
          const { feature, label } = unsupportedFeature(token.type)
          addIssue(feature, `현재 ${label} 문법을 지원하지 않습니다.`, line)
        }
        if (token.type === "softbreak") {
          token.type = "text"
          token.content = "\n"
        }
        if (token.children) visit(token.children, line)
      }
    }
    visit(state.tokens)
    if (issues.size) throw new MarkdownConversionError("parse", [...issues.values()])
  })
  function imageAlt(tokens: readonly Token[] = []): string {
    return tokens
      .map((token) => {
        if (token.type === "text" || token.type === "code_inline") return token.content
        if (token.type === "softbreak" || token.type === "hardbreak") return "\n"
        return token.children ? imageAlt(token.children) : ""
      })
      .join("")
  }
  const parser = new MarkdownParser(schema, tokenizer, {
    paragraph: { block: "paragraph" },
    heading: { block: "heading", getAttrs: (token) => ({ level: Number(token.tag.slice(1)) }) },
    strong: { mark: "strong" },
    em: { mark: "em" },
    s: { mark: "strike" },
    code_inline: { mark: "code", noCloseToken: true },
    blockquote: { block: "blockquote" },
    bullet_list: { block: "bullet_list" },
    ordered_list: {
      block: "ordered_list",
      getAttrs: (token) => ({ order: Number(token.attrGet("start") ?? 1) }),
    },
    list_item: {
      block: "list_item",
      getAttrs: (token) => ({
        checked:
          token.attrGet("data-checked") === null ? null : token.attrGet("data-checked") === "true",
      }),
    },
    table: { block: "table" },
    thead: { ignore: true },
    tbody: { ignore: true },
    tr: { block: "table_row" },
    th: {
      block: "table_header",
      getAttrs: (token) => ({
        align: token.attrGet("style")?.match(/text-align:(left|center|right)/)?.[1] ?? null,
      }),
    },
    td: {
      block: "table_cell",
      getAttrs: (token) => ({
        align: token.attrGet("style")?.match(/text-align:(left|center|right)/)?.[1] ?? null,
      }),
    },
    hr: { node: "horizontal_rule" },
    code_block: { block: "code_block", noCloseToken: true },
    fence: {
      block: "code_block",
      getAttrs: (token) => ({ params: token.info || "" }),
      noCloseToken: true,
    },
    link: {
      mark: "link",
      getAttrs: (token) => ({
        href: normalizeLinkUrl(token.attrGet("href")),
        title: token.attrGet("title"),
      }),
    },
    image: {
      node: "image",
      getAttrs: (token) => ({
        src: normalizeImageUrl(token.attrGet("src")),
        alt: imageAlt(token.children ?? []),
        title: token.attrGet("title"),
      }),
    },
    hardbreak: { node: "hard_break" },
    ...extraTokens,
  })
  const serializer = new MarkdownSerializer(
    {
      ...defaultMarkdownSerializer.nodes,
      hard_break(state, node, parent, index) {
        if (
          Array.from({ length: parent.childCount - index - 1 }, (_, offset) =>
            parent.child(index + offset + 1),
          ).some((next) => next.type !== node.type)
        )
          state.write("\\\n")
        else state.write("<br>")
      },
      list_item(state, node) {
        if (node.attrs.checked !== null) state.write(node.attrs.checked ? "[x] " : "[ ] ")
        state.renderContent(node)
      },
      table(state, node) {
        const first = node.firstChild
        if (!first) throw new RangeError("Empty table")
        const width = first.childCount
        const alignments: (string | null)[] = []
        first.forEach((cell) => {
          alignments.push(cell.attrs.align)
        })
        node.forEach((row, _position, rowIndex) => {
          if (row.childCount !== width) throw new RangeError("Non-rectangular table")
          const cells: string[] = []
          row.forEach((cell, _offset, column) => {
            if (
              cell.attrs.colspan !== 1 ||
              cell.attrs.rowspan !== 1 ||
              cell.attrs.colwidth !== null ||
              cell.attrs.align !== alignments[column] ||
              cell.childCount !== 1 ||
              cell.firstChild?.type !== editorTypes(schema).nodes.paragraph ||
              cell.type !==
                (rowIndex === 0
                  ? editorTypes(schema).nodes.table_header
                  : editorTypes(schema).nodes.table_cell)
            )
              throw new RangeError("GFM cannot represent this table structure")
            let value = serializer.serialize(cell).trim()
            if (value.includes("\n")) throw new RangeError("GFM cells cannot contain newlines")
            value = value.replace(/(\\*)\|/g, (match, slashes: string) =>
              slashes.length % 2 ? match : `${slashes}\\|`,
            )
            cells.push(value)
          })
          state.ensureNewLine()
          state.write(`| ${cells.join(" | ")} |`)
          if (rowIndex === 0) {
            state.write("\n")
            state.write(
              `| ${alignments.map((align) => (align === "center" ? ":---:" : align === "right" ? "---:" : align === "left" ? ":---" : "---")).join(" | ")} |`,
            )
          }
        })
        state.closeBlock(node)
      },
      heading(state, node, parent, index) {
        if (node.attrs.level <= 2 && node.textContent.includes("\n")) {
          state.renderInline(node)
          state.write(`\n${node.attrs.level === 1 ? "===" : "---"}`)
          state.closeBlock(node)
        } else {
          defaultMarkdownSerializer.nodes.heading?.(state, node, parent, index)
        }
      },
      code_block(state, node, parent, index) {
        if (!node.attrs.params.includes("`")) {
          defaultMarkdownSerializer.nodes.code_block?.(state, node, parent, index)
          return
        }
        const length = Math.max(
          3,
          ...(node.textContent.match(/~{3,}/g) ?? []).map((run) => run.length + 1),
        )
        const fence = "~".repeat(length)
        state.write(`${fence}${node.attrs.params}\n`)
        state.text(node.textContent, false)
        state.write(`\n${fence}`)
        state.closeBlock(node)
      },
      ...Object.assign({}, ...extensions.map((extension) => extension.markdown?.nodes)),
    },
    {
      ...defaultMarkdownSerializer.marks,
      code: {
        ...defaultMarkdownSerializer.marks.code,
        open(state, mark, parent, index) {
          const original = defaultMarkdownSerializer.marks.code?.open
          const value =
            typeof original === "function"
              ? original(state, mark, parent, index)
              : (original ?? "`")
          const text = parent.child(index).textContent
          return /^ [\s\S]* $/.test(text) && /\S/.test(text) && !value.endsWith(" ")
            ? `${value} `
            : value
        },
        close(state, mark, parent, index) {
          const original = defaultMarkdownSerializer.marks.code?.close
          const value =
            typeof original === "function"
              ? original(state, mark, parent, index)
              : (original ?? "`")
          const text = parent.child(index - 1).textContent
          return /^ [\s\S]* $/.test(text) && /\S/.test(text) && !value.startsWith(" ")
            ? ` ${value}`
            : value
        },
      },
      strike: { open: "~~", close: "~~", mixable: true, expelEnclosingWhitespace: true },
      ...Object.assign({}, ...extensions.map((extension) => extension.markdown?.marks)),
    },
    { escapeExtraCharacters: /[<>&|]/g },
  )
  function parse(markdown: string): Node {
    return parser.parse(markdown)
  }
  function withoutEmptyParagraphs(doc: Node): Node {
    if (doc.type === editorTypes(schema).nodes.hard_break) return doc.mark([])
    if (
      doc.type === editorTypes(schema).nodes.paragraph ||
      doc.type === editorTypes(schema).nodes.heading
    ) {
      const content: Node[] = []
      let line: Node[] = []
      const flushLine = () => {
        const fragment = Fragment.fromArray(line)
        let from = 0,
          to = fragment.size
        for (const child of line) {
          if (!child.isText || child.marks.some((mark) => mark.type.spec.code)) break
          const size = child.text?.match(/^[ \t]*/)?.[0].length ?? 0
          from += size
          if (size !== child.nodeSize) break
        }
        for (let index = line.length - 1; index >= 0; index--) {
          const child = line[index]
          if (!child?.isText || child.marks.some((mark) => mark.type.spec.code)) break
          const size = child.text?.match(/[ \t]*$/)?.[0].length ?? 0
          to -= size
          if (size !== child.nodeSize) break
        }
        fragment.cut(from, Math.max(from, to)).forEach((child) => {
          content.push(child)
        })
        line = []
      }
      doc.forEach((child, _offset, index) => {
        if (child.type === editorTypes(schema).nodes.hard_break) {
          flushLine()
          content.push(child.mark([]))
        } else if (
          child.isText &&
          !child.marks.some((mark) => mark.type.spec.code) &&
          child.marks.some((mark) => ["strong", "em", "strike"].includes(mark.type.name))
        ) {
          const text = child.text ?? ""
          const leading = text.match(/^[ \t]*/)?.[0] ?? ""
          const trailing = text.slice(leading.length).match(/[ \t]*$/)?.[0] ?? ""
          const inner = text.slice(leading.length, text.length - trailing.length)
          const previous = doc.maybeChild(index - 1)
          const next = doc.maybeChild(index + 1)
          const leadingMarks = child.marks.filter(
            (mark) =>
              !["strong", "em", "strike"].includes(mark.type.name) ||
              (mark.isInSet(previous?.marks ?? []) && (inner || mark.isInSet(next?.marks ?? []))),
          )
          const trailingMarks = child.marks.filter(
            (mark) =>
              !["strong", "em", "strike"].includes(mark.type.name) ||
              mark.isInSet(next?.marks ?? []),
          )
          if (leading) line.push(schema.text(leading, leadingMarks))
          if (inner) line.push(schema.text(inner, child.marks))
          if (trailing) line.push(schema.text(trailing, trailingMarks))
        } else line.push(child)
      })
      flushLine()
      return doc.copy(Fragment.fromArray(content))
    }
    if (doc.isLeaf || doc.isTextblock) return doc
    const blocks: Node[] = []
    const normalize =
      doc.type === editorTypes(schema).nodes.doc ||
      doc.type === editorTypes(schema).nodes.blockquote ||
      doc.type === editorTypes(schema).nodes.list_item
    doc.forEach((node, _offset, index) => {
      node = withoutEmptyParagraphs(node)
      if (
        !normalize ||
        node.type !== editorTypes(schema).nodes.paragraph ||
        node.childCount ||
        (doc.type === editorTypes(schema).nodes.list_item && index === 0)
      )
        blocks.push(node)
    })
    if (!blocks.length) blocks.push(editorTypes(schema).nodes.paragraph.create())
    return doc.copy(Fragment.fromArray(blocks))
  }
  function serialize(doc: Node): string {
    if (doc.type !== editorTypes(schema).nodes.doc) {
      throw new MarkdownConversionError("serialize", [
        { feature: "schema", message: "vlab-editor 스키마의 문서가 필요합니다." },
      ])
    }
    const issues: MarkdownIssue[] = []
    doc.descendants((node) => {
      if (
        node.type === editorTypes(schema).nodes.heading &&
        (!Number.isInteger(node.attrs.level) || node.attrs.level < 1 || node.attrs.level > 6)
      ) {
        issues.push({ feature: `h${node.attrs.level}`, message: "제목은 H1~H6만 지원합니다." })
      }
    })
    if (issues.length) throw new MarkdownConversionError("serialize", issues)
    let markdown: string
    let restored: Node
    try {
      doc.check()
      markdown = serializer.serialize(withoutEmptyParagraphs(doc), { tightLists: true })
      restored = parse(markdown)
    } catch (cause) {
      throw new MarkdownConversionError(
        "serialize",
        [
          {
            feature: "document",
            message: "이 문서를 현재 마크다운 형식으로 손실 없이 변환할 수 없습니다.",
          },
        ],
        { cause },
      )
    }
    if (!withoutEmptyParagraphs(doc).eq(withoutEmptyParagraphs(restored))) {
      throw new MarkdownConversionError("serialize", [
        {
          feature: "roundtrip",
          message: "일부 내용·서식을 마크다운으로 표현할 수 없어 변환을 중단했습니다.",
        },
      ])
    }
    return markdown
  }
  return { parse, serialize }
}
const defaultCodec = createMarkdownCodec()
export function parseMarkdown(markdown: string): Node {
  return defaultCodec.parse(markdown)
}
export function serializeMarkdown(doc: Node): string {
  return defaultCodec.serialize(doc)
}
