import { type Node as ProseMirrorNode, Slice } from "prosemirror-model"
import {
  NodeSelection,
  Selection,
  type SelectionBookmark,
  type Transaction,
} from "prosemirror-state"
import type { Mappable } from "prosemirror-transform"
import { blockAt, blockRemovalRange, normalizeBlockRange } from "./block-tree.js"
import { editorSchema } from "./schema.js"

class BlockSelectionType extends Selection {
  readonly anchorBlock: number
  readonly headBlock: number
  private constructor(doc: ProseMirrorNode, anchor: number, head: number) {
    const range = normalizeBlockRange(doc, anchor, head)
    anchor = range.anchor
    head = range.head
    const first = blockAt(doc, anchor)
    const last = blockAt(doc, head)
    const forward = anchor <= head
    super(
      doc.resolve(forward ? anchor : anchor + first.node.nodeSize),
      doc.resolve(forward ? head + last.node.nodeSize : head),
    )
    this.anchorBlock = anchor
    this.headBlock = head
  }
  static create(doc: ProseMirrorNode, anchor: number, head = anchor): BlockSelection {
    return new BlockSelectionType(doc, anchor, head)
  }
  map(doc: ProseMirrorNode, mapping: Mappable): Selection {
    return this.getBookmark().map(mapping).resolve(doc)
  }
  override content(): Slice {
    return this.$from.doc.slice(this.from, this.to)
  }
  override replace(tr: Transaction, content = Slice.empty) {
    const removal = blockRemovalRange(tr.doc, this.from, this.to)
    if (!content.size && (removal.from !== this.from || removal.to !== this.to)) {
      const mapFrom = tr.steps.length
      tr.deleteRange(removal.from, removal.to)
      tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.slice(mapFrom).map(removal.from))))
    } else super.replace(tr, content)
  }
  eq(other: Selection): boolean {
    return (
      other instanceof BlockSelection &&
      other.anchorBlock === this.anchorBlock &&
      other.headBlock === this.headBlock
    )
  }
  toJSON() {
    return { type: "vlab-editor-block", anchor: this.anchorBlock, head: this.headBlock }
  }
  static override fromJSON(doc: ProseMirrorNode, json: unknown): BlockSelection {
    if (!json || typeof json !== "object") throw new RangeError("Invalid block selection JSON.")
    const value = json as {
      anchor?: unknown
      head?: unknown
    }
    if (typeof value.anchor !== "number" || typeof value.head !== "number")
      throw new RangeError("Invalid block selection JSON.")
    return BlockSelection.create(doc, value.anchor, value.head)
  }
  override getBookmark(): SelectionBookmark {
    return new BlockBookmark(this.anchorBlock, this.headBlock)
  }
}
BlockSelectionType.prototype.visible = false
function registeredSelection(): typeof BlockSelectionType {
  const doc = editorSchema.node("doc", null, [editorSchema.node("paragraph")])
  try {
    const registered = Selection.fromJSON(doc, { type: "vlab-editor-block", anchor: 0, head: 0 })
    return registered.constructor as typeof BlockSelectionType
  } catch (error) {
    if (!(error instanceof RangeError) || !error.message.startsWith("No selection type "))
      throw error
    Selection.jsonID("vlab-editor-block", BlockSelectionType)
    return BlockSelectionType
  }
}
export const BlockSelection = registeredSelection()
export type BlockSelection = BlockSelectionType
class BlockBookmark implements SelectionBookmark {
  constructor(
    private anchor: number,
    private head: number,
    private deleted = false,
  ) {}
  map(mapping: Mappable): BlockBookmark {
    const anchor = mapping.mapResult(this.anchor, 1)
    const head = mapping.mapResult(this.head, 1)
    return new BlockBookmark(anchor.pos, head.pos, this.deleted || anchor.deleted || head.deleted)
  }
  resolve(doc: ProseMirrorNode): Selection {
    if (!this.deleted) {
      try {
        return BlockSelection.create(doc, this.anchor, this.head)
      } catch {}
    }
    return Selection.near(doc.resolve(Math.max(0, Math.min(this.head, doc.content.size))))
  }
}
export function blockRange(selection: Selection) {
  if (selection instanceof BlockSelection)
    return {
      from: selection.from,
      to: selection.to,
      anchor: selection.anchorBlock,
      head: selection.headBlock,
    }
  if (selection instanceof NodeSelection && selection.node.isBlock)
    return {
      from: selection.from,
      to: selection.to,
      anchor: selection.from,
      head: selection.from,
    }
  return null
}
export function selectBlockRange(doc: ProseMirrorNode, anchor: number, head = anchor): Selection {
  const range = normalizeBlockRange(doc, anchor, head)
  const { $position, node } = blockAt(doc, range.anchor)
  if (range.anchor === range.head && $position.depth === 0)
    return NodeSelection.isSelectable(node)
      ? NodeSelection.create(doc, range.anchor)
      : Selection.near($position)
  return BlockSelection.create(doc, range.anchor, range.head)
}
