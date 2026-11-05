import type { Node as ProseMirrorNode, ResolvedPos } from "prosemirror-model"
import type { Transaction } from "prosemirror-state"
import { canJoin } from "prosemirror-transform"
export function isList(node: ProseMirrorNode): boolean {
  return node.type.name === "bullet_list" || node.type.name === "ordered_list"
}
export function isListItem(node: ProseMirrorNode): boolean {
  return node.type.name === "list_item"
}
export function blockAt(doc: ProseMirrorNode, position: number) {
  if (!Number.isInteger(position) || position < 0 || position >= doc.content.size)
    throw new RangeError("vlab-editor: a block selection needs block boundary positions.")
  const $position = doc.resolve(position)
  const node = $position.nodeAfter
  if (!node?.isBlock || ["row", "cell", "header_cell"].includes(node.type.spec.tableRole))
    throw new RangeError("vlab-editor: a block selection needs block boundary positions.")
  return { $position, node }
}
export function normalizeBlockRange(doc: ProseMirrorNode, anchor: number, head: number) {
  let first = blockAt(doc, anchor)
  let last = blockAt(doc, head)
  if (!first.$position.sameParent(last.$position)) {
    const depth = Math.min(
      first.$position.depth,
      last.$position.depth,
      first.$position.sharedDepth(last.$position.pos),
    )
    if (first.$position.depth > depth) anchor = first.$position.before(depth + 1)
    if (last.$position.depth > depth) head = last.$position.before(depth + 1)
    first = blockAt(doc, anchor)
    last = blockAt(doc, head)
  }
  return {
    anchor,
    head,
    from: Math.min(anchor, head),
    to: anchor <= head ? head + last.node.nodeSize : anchor + first.node.nodeSize,
  }
}
export function blockRemovalRange(doc: ProseMirrorNode, from: number, to: number) {
  const $from = doc.resolve(from)
  const $to = doc.resolve(to)
  if (
    $from.sameParent($to) &&
    isList($from.parent) &&
    $from.index() === 0 &&
    $to.index() === $from.parent.childCount
  )
    return { from: $from.before(), to: $from.after() }
  return { from, to }
}
export function blockPosition($position: ResolvedPos): number {
  for (let depth = $position.depth; depth > 0; depth--) {
    const node = $position.node(depth)
    const parent = $position.node(depth - 1)
    if (isListItem(node) || (isListItem(parent) && $position.index(depth - 1) > 0) || depth === 1)
      return $position.before(depth)
  }
  return $position.pos
}
export function joinAdjacentLists(tr: Transaction): void {
  const joins: number[] = []
  tr.doc.descendants((node, pos, parent, index) => {
    if (isList(node) && index > 0 && parent?.child(index - 1).type === node.type) joins.push(pos)
  })
  for (const position of joins.sort((left, right) => right - left))
    if (canJoin(tr.doc, position)) tr.join(position)
}
