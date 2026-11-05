import { closeHistory } from "prosemirror-history"
import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules"
import { Fragment, type MarkType, type Schema, Slice } from "prosemirror-model"
import { Plugin, TextSelection } from "prosemirror-state"
import { insertHorizontalRule } from "./commands.js"
import {
  createMarkdownCodec,
  type MarkdownCodec,
  MarkdownConversionError,
  parseMarkdown,
} from "./markdown.js"
import { editorSchema, editorTypes } from "./schema.js"
export interface MarkdownBehaviorOptions {
  markdownShortcuts?: boolean
  markdownPaste?: boolean
}
function escaped(text: string, index: number): boolean {
  let slashes = 0
  while (index > 0 && text[--index] === "\\") slashes++
  return slashes % 2 === 1
}
function hasOpenCode(text: string): boolean {
  let width = 0
  for (const match of text.matchAll(/`+/g)) {
    if (!width && !escaped(text, match.index)) width = match[0].length
    else if (width === match[0].length) width = 0
  }
  return width !== 0
}
function isEmphasisPair(
  source: string,
  inner: string,
  prefix: string,
  suffix: string,
  marks: MarkType[],
  parse: (source: string) => import("prosemirror-model").Node,
): boolean {
  try {
    const doc = parse(prefix + source + suffix)
    const block = doc.firstChild
    if (!block || doc.childCount !== 1 || block.textContent !== prefix + inner + suffix)
      return false
    let offset = 0
    let valid = true
    block.forEach((node) => {
      if (offset < prefix.length + inner.length && offset + node.nodeSize > prefix.length) {
        if (!node.isText || marks.some((mark) => !mark.isInSet(node.marks))) valid = false
      }
      offset += node.nodeSize
    })
    return valid
  } catch (error) {
    if (error instanceof MarkdownConversionError) return false
    throw error
  }
}
export function markdownInputRules(
  schema: Schema = editorSchema,
  codec: MarkdownCodec = createMarkdownCodec(schema),
): Plugin {
  const inlineCode = new InputRule(
    /[\s\S]*`$/,
    (state, match, start, end) => {
      if (end !== state.selection.to || start > state.selection.from) return null
      const text = match[0]
      let closing = text.length - 1
      while (closing > 0 && text[closing - 1] === "`") closing--
      const width = text.length - closing
      for (let index = closing - 1; index >= 0; ) {
        if (text[index] !== "`") {
          index--
          continue
        }
        const runEnd = index + 1
        while (index >= 0 && text[index] === "`") index--
        const opening = index + 1
        if (runEnd - opening !== width || escaped(text, opening)) continue
        if (opening === 0 && start !== state.selection.$from.start()) continue
        if ((text.slice(0, opening).match(/`+/g) ?? []).some((run) => run.length > width)) continue
        const block = codec.parse(`x ${text.slice(opening)} x`).firstChild
        if (block?.childCount !== 3) continue
        const code = block.child(1)
        if (!code.isText || !editorTypes(schema).marks.code.isInSet(code.marks)) continue
        const marks = editorTypes(schema)
          .marks.code.create()
          .addToSet(state.doc.resolve(start + opening + width).marks())
        const formatted = code.mark(marks)
        const tr = state.tr.replaceWith(start + opening, end, formatted)
        tr.setSelection(TextSelection.create(tr.doc, start + opening + formatted.nodeSize))
        tr.setStoredMarks(state.storedMarks ?? state.selection.$from.marks())
        return closeHistory(tr)
      }
      return null
    },
    { inCodeMark: false },
  )
  const emphasis = new InputRule(
    /[\s\S]*[*_~]$/,
    (state, match, start, end) => {
      if (end !== state.selection.to || start > state.selection.from) return null
      const text = match[0]
      const marker = text.at(-1)
      let closing = text.length - 1
      while (closing > 0 && text[closing - 1] === marker) closing--
      const width = text.length - closing
      if (width > 3 || (marker === "~" && width !== 2) || escaped(text, closing)) return null
      const marks =
        marker === "~"
          ? [editorTypes(schema).marks.strike]
          : width === 3
            ? [editorTypes(schema).marks.strong, editorTypes(schema).marks.em]
            : [width === 2 ? editorTypes(schema).marks.strong : editorTypes(schema).marks.em]
      for (let index = closing - 1; index >= 0; ) {
        if (text[index] !== marker) {
          index--
          continue
        }
        const runEnd = index + 1
        while (index >= 0 && text[index] === marker) index--
        const opening = index + 1
        if (hasOpenCode(text.slice(0, opening))) continue
        if (opening === 0 && start !== state.selection.$from.start()) continue
        if (runEnd - opening !== width || escaped(text, opening)) continue
        const inner = text.slice(runEnd, closing)
        if (!inner.trim()) continue
        if (/[*_~]/.test(inner)) continue
        const before = Array.from(text.slice(0, opening)).at(-1) ?? ""
        const $end = state.doc.resolve(end)
        const following = $end.parent.textBetween(
          $end.parentOffset,
          Math.min($end.parentOffset + 2, $end.parent.content.size),
        )
        const after = Array.from(following)[0] ?? ""
        const prefix = `x ${/\s/.test(before) ? " " : before === "\\" ? "!" : before}`
        const suffix = `${/\s/.test(after) ? " " : after} x`
        if (!isEmphasisPair(text.slice(opening), inner, prefix, suffix, marks, codec.parse))
          continue
        const inserted = text.slice(state.selection.from - start)
        const tr = state.tr
        if (inserted) tr.insertText(inserted, state.selection.from, end)
        const from = start + opening
        const to = start + closing
        tr.delete(to, to + width).delete(from, from + width)
        const contentEnd = to - width
        for (const mark of marks) tr.addMark(from, contentEnd, mark.create())
        tr.setSelection(TextSelection.create(tr.doc, contentEnd))
        tr.setStoredMarks(state.storedMarks ?? state.selection.$from.marks())
        return closeHistory(tr)
      }
      return null
    },
    { inCodeMark: false },
  )
  const heading = textblockTypeInputRule(
    /^(#{1,6}) $/,
    editorTypes(schema).nodes.heading,
    (match) => ({
      level: match[1]?.length ?? 1,
    }),
  )
  const quote = wrappingInputRule(/^> $/, editorTypes(schema).nodes.blockquote)
  const bullet = wrappingInputRule(/^[-+*] $/, editorTypes(schema).nodes.bullet_list)
  const ordered = wrappingInputRule(
    /^(\d{1,9})[.)] $/,
    editorTypes(schema).nodes.ordered_list,
    (match) => ({ order: Number(match[1]) }),
    (match, node) => node.attrs.order + node.childCount === Number(match[1]),
  )
  const codeBlock = textblockTypeInputRule(/^(?:```|~~~)$/, editorTypes(schema).nodes.code_block)
  const rule = new InputRule(/^(?:---|___|\*\*\*) $/, (state, _match, start, end) => {
    return closeHistory(insertHorizontalRule(state.tr.delete(start, end)))
  })
  const task = new InputRule(/^\[([ xX])\] $/, (state, match, start, end) => {
    const { $from } = state.selection
    if ($from.depth < 2 || $from.node(-1).type !== editorTypes(schema).nodes.list_item) return null
    return closeHistory(
      state.tr.delete(start, end).setNodeMarkup($from.before($from.depth - 1), undefined, {
        ...$from.node(-1).attrs,
        checked: match[1] !== " ",
      }),
    )
  })
  return inputRules({
    rules: [heading, quote, bullet, ordered, codeBlock, rule, task, inlineCode, emphasis],
  })
}
export function markdownPastePlugin(
  onError?: (error: MarkdownConversionError) => void,
  parse: MarkdownCodec["parse"] = parseMarkdown,
): Plugin {
  return new Plugin({
    props: {
      clipboardTextParser(text, $context, plain) {
        const source = text.replace(/\r\n?/g, "\n")
        if ($context.parent.type.spec.code) {
          return new Slice(
            Fragment.from(source ? $context.doc.type.schema.text(source) : null),
            0,
            0,
          )
        }
        if (!plain && !$context.marks().some((mark) => mark.type.spec.code)) {
          try {
            return Slice.maxOpen(parse(source).content)
          } catch (error) {
            if (!(error instanceof MarkdownConversionError)) throw error
            onError?.(error)
          }
        }
        const paragraph = $context.doc.type.schema.nodes.paragraph
        if (!paragraph) return Slice.empty
        const blocks = source
          .split(/\n{2,}/)
          .map((block) =>
            paragraph.create(
              null,
              block ? $context.doc.type.schema.text(block, $context.marks()) : undefined,
            ),
          )
        return Slice.maxOpen(Fragment.fromArray(blocks))
      },
    },
    filterTransaction(transaction) {
      if (transaction.getMeta("uiEvent") === "paste") closeHistory(transaction)
      return true
    },
    appendTransaction(transactions, _oldState, state) {
      return transactions.some((transaction) => transaction.getMeta("uiEvent") === "paste")
        ? closeHistory(state.tr)
        : null
    },
  })
}
