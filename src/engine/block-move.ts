import { closeHistory } from "prosemirror-history"
import { Fragment } from "prosemirror-model"
import type { Command } from "prosemirror-state"
import { blockRange, selectBlockRange } from "./block-selection.js"
import { blockRemovalRange, isList, joinAdjacentLists } from "./block-tree.js"
import { getPendingImageUploads } from "./image-upload.js"
export interface MoveBlocksOptions {
  replaceEmpty?: boolean
}
export function moveBlocks(
  from: number,
  to: number,
  destination: number,
  options: MoveBlocksOptions = {},
): Command {
  return (state, dispatch) => {
    const { doc } = state
    if (
      ![from, to, destination].every(Number.isInteger) ||
      from < 0 ||
      to > doc.content.size ||
      from >= to ||
      destination < 0 ||
      destination > doc.content.size ||
      (destination >= from && destination <= to)
    )
      return false
    const $from = doc.resolve(from)
    const $to = doc.resolve(to)
    const $destination = doc.resolve(destination)
    if (!$from.sameParent($to) || $from.parent.inlineContent || $destination.parent.inlineContent)
      return false
    if (getPendingImageUploads(state).some(({ position }) => position > from && position < to))
      return false
    const content = doc.slice(from, to).content
    if (!content.childCount) return false
    let supported = true
    content.forEach((node) => {
      if (!node.isBlock || ["row", "cell", "header_cell"].includes(node.type.spec.tableRole))
        supported = false
    })
    if (!supported) return false
    const removal = blockRemovalRange(doc, from, to)
    if (destination >= removal.from && destination <= removal.to) return false
    const tr = closeHistory(state.tr).deleteRange(removal.from, removal.to)
    const target = tr.mapping.map(destination)
    const $target = tr.doc.resolve(target)
    const empty =
      options.replaceEmpty &&
      $target.nodeAfter?.type.name === "paragraph" &&
      $target.nodeAfter.content.size === 0
        ? $target.nodeAfter
        : null
    const endIndex = $target.index() + (empty ? 1 : 0)
    let insert = content
    let offset = 0
    if (!$target.parent.canReplace($target.index(), endIndex, insert)) {
      if (!isList($from.parent)) return false
      const attrs = { ...$from.parent.attrs }
      if ($from.parent.type.name === "ordered_list") attrs.order += $from.index()
      insert = Fragment.from($from.parent.type.create(attrs, content))
      offset = 1
      if (!$target.parent.canReplace($target.index(), endIndex, insert)) return false
    }
    tr.replaceWith(target, target + (empty?.nodeSize ?? 0), insert)
    const first = target + offset
    const last = first + content.size - (content.lastChild?.nodeSize ?? 0)
    const current = blockRange(state.selection)
    const backward = current?.from === from && current.to === to && current.anchor > current.head
    tr.setSelection(selectBlockRange(tr.doc, backward ? last : first, backward ? first : last))
    joinAdjacentLists(tr)
    dispatch?.(
      tr.setMeta("uiEvent", "drop").setMeta("vlab-editor-block-move", true).scrollIntoView(),
    )
    return true
  }
}
export function moveBlock(from: number, to: number): Command {
  return (state, dispatch, view) => {
    if (!Number.isInteger(from) || from < 0 || from >= state.doc.content.size) return false
    const node = state.doc.nodeAt(from)
    if (!node?.isBlock) return false
    return moveBlocks(from, from + node.nodeSize, to)(state, dispatch, view)
  }
}
