import { closeHistory } from "prosemirror-history"
import type { Mark, Node as ProseMirrorNode, Schema } from "prosemirror-model"
import {
  type Command,
  type EditorState,
  NodeSelection,
  Selection,
  TextSelection,
} from "prosemirror-state"
import { editorSchema, editorTypes } from "./schema.js"
import { normalizeImageUrl, normalizeLinkUrl } from "./urls.js"
export interface LinkAttributes {
  href: string
  title?: string | null
}
export interface SetLinkOptions extends LinkAttributes {
  text?: string
}
export interface LinkRange extends LinkAttributes {
  from: number
  to: number
  title: string | null
}
export interface ImageAttributes {
  src: string
  alt?: string
  title?: string | null
}
export interface ImageSelection extends ImageAttributes {
  from: number
  to: number
  alt: string
  title: string | null
}
function linkOf(node: ProseMirrorNode | null): Mark | undefined {
  return node ? editorTypes(node.type.schema).marks.link.isInSet(node.marks) : undefined
}
export function getLink(state: EditorState): LinkRange | null {
  const { $from, $to } = state.selection
  if (!$from.sameParent($to) || !$from.parent.inlineContent) return null
  const children: {
    node: ProseMirrorNode
    offset: number
  }[] = []
  $from.parent.forEach((node, offset) => {
    children.push({ node, offset })
  })
  let index = children.findIndex(
    ({ node, offset }) =>
      offset <= $from.parentOffset && offset + node.nodeSize > $from.parentOffset,
  )
  if (index < 0) index = children.length - 1
  let mark = linkOf(children[index]?.node ?? null)
  if (
    !mark &&
    state.selection.empty &&
    index > 0 &&
    children[index]?.offset === $from.parentOffset
  ) {
    index--
    mark = linkOf(children[index]?.node ?? null)
  }
  if (!mark) return null
  let first = index
  let last = index
  while (first > 0 && linkOf(children[first - 1]?.node ?? null)?.eq(mark)) first--
  while (last + 1 < children.length && linkOf(children[last + 1]?.node ?? null)?.eq(mark)) last++
  const begin = children[first]
  const finish = children[last]
  if (!begin || !finish) return null
  const from = $from.start() + begin.offset
  const to = $from.start() + finish.offset + finish.node.nodeSize
  if (state.selection.to > to) return null
  return { from, to, href: mark.attrs.href, title: mark.attrs.title }
}
export function canSetLink(state: EditorState): boolean {
  const { selection, doc } = state
  if (selection.empty)
    return selection.$from.parent.type.allowsMarkType(editorTypes(state.schema).marks.link)
  let allowed = false
  doc.nodesBetween(selection.from, selection.to, (node, _position, parent) => {
    if (node.isInline && parent?.type.allowsMarkType(editorTypes(state.schema).marks.link))
      allowed = true
  })
  return allowed
}
export function setLink({ href: source, title = null, text }: SetLinkOptions): Command {
  return (state, dispatch) => {
    const href = normalizeLinkUrl(source)
    if (!href || (title !== null && typeof title !== "string") || text === "" || !canSetLink(state))
      return false
    if (
      text !== undefined &&
      (!state.selection.$from.sameParent(state.selection.$to) ||
        !state.selection.$from.parent.inlineContent)
    )
      return false
    const current = state.selection.empty ? getLink(state) : null
    const from = current?.from ?? state.selection.from
    const to = current?.to ?? state.selection.to
    const mark = editorTypes(state.schema).marks.link.create({ href, title })
    const tr = state.tr
    if (text !== undefined || from === to) {
      const label = text ?? href
      const inherited =
        from < to
          ? (state.doc.resolve(from).nodeAfter?.marks ?? state.doc.resolve(from).marks())
          : (state.storedMarks ?? state.doc.resolve(from).marks())
      const marks = mark.addToSet(editorTypes(state.schema).marks.link.removeFromSet(inherited))
      tr.replaceWith(from, to, state.schema.text(label, marks))
      tr.setSelection(TextSelection.create(tr.doc, from + label.length))
      tr.setStoredMarks(editorTypes(state.schema).marks.link.removeFromSet(marks))
    } else {
      tr.addMark(from, to, mark)
      tr.removeStoredMark(editorTypes(state.schema).marks.link)
    }
    dispatch?.(closeHistory(tr).scrollIntoView())
    return true
  }
}
export const removeLink: Command = (state, dispatch) => {
  const current = state.selection.empty ? getLink(state) : null
  const from = current?.from ?? state.selection.from
  const to = current?.to ?? state.selection.to
  if (!state.doc.rangeHasMark(from, to, editorTypes(state.schema).marks.link)) return false
  dispatch?.(
    closeHistory(state.tr)
      .removeMark(from, to, editorTypes(state.schema).marks.link)
      .removeStoredMark(editorTypes(state.schema).marks.link)
      .scrollIntoView(),
  )
  return true
}
export function imageNode(
  attributes: ImageAttributes,
  schema: Schema = editorSchema,
): ProseMirrorNode | null {
  const src = normalizeImageUrl(attributes.src)
  const alt = attributes.alt ?? ""
  const title = attributes.title ?? null
  return src && typeof alt === "string" && (title === null || typeof title === "string")
    ? editorTypes(schema).nodes.image.create({ src, alt, title })
    : null
}
export function canInsertImage(state: EditorState): boolean {
  if (state.selection.$from.parent.type.spec.code) return false
  const node = editorTypes(state.schema).nodes.image.create({ src: "/image" })
  return state.tr.replaceSelectionWith(node).docChanged
}
export function insertImage(attributes: ImageAttributes): Command {
  return (state, dispatch) => {
    const node = imageNode(attributes, state.schema)
    if (!node || !canInsertImage(state)) return false
    const tr = state.tr.replaceSelectionWith(node)
    tr.setSelection(Selection.near(tr.doc.resolve(tr.selection.to), 1))
    dispatch?.(closeHistory(tr).scrollIntoView())
    return true
  }
}
export function getSelectedImage(state: EditorState): ImageSelection | null {
  const { selection } = state
  if (
    !(selection instanceof NodeSelection) ||
    selection.node.type !== editorTypes(state.schema).nodes.image
  )
    return null
  return { from: selection.from, to: selection.to, ...selection.node.attrs } as ImageSelection
}
export function updateImage(attributes: ImageAttributes): Command {
  return (state, dispatch) => {
    const current = getSelectedImage(state)
    const node = imageNode(attributes, state.schema)
    if (!current || !node) return false
    const tr = state.tr.setNodeMarkup(current.from, undefined, node.attrs)
    tr.setSelection(NodeSelection.create(tr.doc, current.from))
    dispatch?.(closeHistory(tr).scrollIntoView())
    return true
  }
}
