import type { Node } from "prosemirror-model"
import { TextSelection } from "prosemirror-state"
import type { Editor } from "./editor.js"
export interface TableOfContentsEntry {
  title: string
  level: number
  position: number
  number: string
  children: TableOfContentsEntry[]
}
export function getTableOfContents(doc: Node): TableOfContentsEntry[] {
  const roots: TableOfContentsEntry[] = []
  const parents: TableOfContentsEntry[] = []
  doc.descendants((node, position) => {
    if (node.type.name !== "heading") return !node.isTextblock
    const level = Number(node.attrs.level)
    while (parents.length && (parents[parents.length - 1]?.level ?? 0) >= level) parents.pop()
    const parent = parents[parents.length - 1]
    const siblings = parent?.children ?? roots
    const number = parent ? `${parent.number}.${siblings.length + 1}` : `${siblings.length + 1}`
    const entry: TableOfContentsEntry = {
      title:
        node.textBetween(0, node.content.size, " ", " ").replace(/\s+/g, " ").trim() || "제목 없음",
      level,
      position,
      number,
      children: [],
    }
    siblings.push(entry)
    parents.push(entry)
    return false
  })
  return roots
}
export function navigateToHeading(editor: Editor, position: number): boolean {
  const { view, state } = editor
  if (
    !view ||
    view.isDestroyed ||
    !Number.isInteger(position) ||
    position < 0 ||
    position >= state.doc.content.size ||
    state.doc.nodeAt(position)?.type.name !== "heading"
  )
    return false
  editor.dispatch(
    state.tr
      .setSelection(TextSelection.create(state.doc, position + 1))
      .setMeta("addToHistory", false)
      .scrollIntoView(),
  )
  view.focus()
  const target = view.nodeDOM(position)
  if (target instanceof Element) target.scrollIntoView?.({ block: "start", inline: "nearest" })
  return true
}
