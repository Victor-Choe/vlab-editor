import { deleteSelection } from "prosemirror-commands"
import { closeHistory } from "prosemirror-history"
import { Fragment, type Node as ProseMirrorNode, Slice } from "prosemirror-model"
import {
  type EditorState,
  NodeSelection,
  Plugin,
  type PluginView,
  Selection,
} from "prosemirror-state"
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view"
import { moveBlocks } from "./block-move.js"
import { blockRange, selectBlockRange } from "./block-selection.js"
import { blockPosition, isList, isListItem } from "./block-tree.js"
import type { EditorExtension } from "./extensions.js"
import { getPendingImageUploads } from "./image-upload.js"
export interface BlockDragOptions {
  createHandle?: () => HTMLButtonElement
  handleClassName?: string
  indicatorClassName?: string
  canDrag?: (node: ProseMirrorNode, position: number, state: EditorState) => boolean
}
interface Block {
  node: ProseMirrorNode
  from: number
  index: number
  element: HTMLElement
  rect: DOMRect
  hitRect: DOMRect
  parent: ProseMirrorNode
  depth: number
}
interface DropTarget {
  position: number
  block: Block
  y: number
  replaceEmpty?: boolean
  child?: boolean
}
const dragSourceType = "application/x-vlab-editor-block-source"
const viewIds = new WeakMap<EditorView, string>()
const controllers = new WeakMap<EditorView, BlockDragView>()
let nextViewId = 0
export function blockDragAndDrop(options: BlockDragOptions = {}): EditorExtension {
  return {
    name: "block-drag-and-drop",
    plugins: () => [
      new Plugin({
        props: {
          handleKeyDown: (view, event) => controllers.get(view)?.handleKeyDown(event) ?? false,
          decorations: (state) => {
            const range = blockRange(state.selection)
            if (!range) return null
            const decorations: Decoration[] = []
            state.doc.nodesBetween(range.from, range.to, (node, from) => {
              if (from >= range.from && from + node.nodeSize <= range.to && node.isBlock) {
                decorations.push(
                  Decoration.node(from, from + node.nodeSize, {
                    class: "vlab-editor-block-selected",
                  }),
                )
                return false
              }
            })
            return DecorationSet.create(state.doc, decorations)
          },
          transformCopied: (slice, view) => {
            const range = blockRange(view.state.selection)
            if (!range) return slice
            const $from = view.state.doc.resolve(range.from)
            if (!isList($from.parent)) return slice
            const attrs = { ...$from.parent.attrs }
            if ($from.parent.type.name === "ordered_list") attrs.order += $from.index()
            return new Slice(
              Fragment.from(
                $from.parent.type.create(attrs, view.state.doc.slice(range.from, range.to).content),
              ),
              0,
              0,
            )
          },
        },
        appendTransaction: (transactions, _previous, state) =>
          transactions.some(
            (tr) => tr.getMeta("vlab-editor-block-move") || tr.getMeta("vlab-editor-block-delete"),
          )
            ? closeHistory(state.tr)
            : null,
        view: (view) => new BlockDragView(view, options),
      }),
    ],
  }
}
class BlockDragView implements PluginView {
  private sourceId: string
  private host: HTMLElement
  private ownerDocument: Document
  private handle: HTMLButtonElement
  private indicator: HTMLDivElement
  private status: HTMLDivElement
  private hovered: number | null = null
  private active: {
    from: number
    to: number
    doc: ProseMirrorNode
    dragging: EditorView["dragging"]
  } | null = null
  private margin: {
    anchor: number
    pointerId: number
    y: number
    doc: ProseMirrorNode
  } | null = null
  private frame: number | null = null
  private scrollFrame: number | null = null
  private destroyed = false
  constructor(
    private view: EditorView,
    private options: BlockDragOptions,
  ) {
    const host = view.dom.parentElement
    if (!host) throw new Error("vlab-editor: block dragging needs a mounted content container.")
    this.host = host
    this.sourceId = viewIds.get(view) ?? `vlab-editor-block-${++nextViewId}`
    viewIds.set(view, this.sourceId)
    this.ownerDocument = view.dom.ownerDocument
    this.handle = options.createHandle?.() ?? this.ownerDocument.createElement("button")
    this.handle.type = "button"
    this.handle.draggable = true
    this.handle.contentEditable = "false"
    this.handle.classList.add("vlab-editor-block-handle")
    if (options.handleClassName)
      this.handle.classList.add(...options.handleClassName.split(/\s+/).filter(Boolean))
    if (!options.createHandle) this.handle.textContent = "⠿"
    if (!this.handle.title)
      this.handle.title = "드래그해서 이동 · Shift+클릭으로 범위 선택 · Delete/Backspace로 삭제"
    this.handle.hidden = true
    this.indicator = this.ownerDocument.createElement("div")
    this.indicator.className =
      `vlab-editor-block-drop-indicator ${options.indicatorClassName ?? ""}`.trim()
    this.indicator.setAttribute("aria-hidden", "true")
    this.indicator.hidden = true
    this.status = this.ownerDocument.createElement("div")
    this.status.className = "vlab-editor-block-announcement"
    this.status.setAttribute("role", "status")
    this.status.setAttribute("aria-live", "polite")
    this.host.append(this.handle, this.indicator, this.status)
    this.host.addEventListener("pointerdown", this.pointerDown, true)
    this.host.addEventListener("pointermove", this.pointerMove)
    this.host.addEventListener("pointerleave", this.pointerLeave)
    this.host.addEventListener("focusin", this.focusIn)
    this.host.addEventListener("focusout", this.focusOut)
    this.host.addEventListener("dragover", this.dragOver, true)
    this.host.addEventListener("drop", this.drop, true)
    this.handle.addEventListener("dragstart", this.dragStart)
    this.handle.addEventListener("keydown", this.keyDown)
    this.handle.addEventListener("click", this.click)
    this.ownerDocument.addEventListener("drop", this.outsideDrop, true)
    this.ownerDocument.addEventListener("dragend", this.dragEnd, true)
    this.ownerDocument.addEventListener("keydown", this.escape, true)
    this.ownerDocument.addEventListener("scroll", this.schedulePosition, true)
    this.ownerDocument.defaultView?.addEventListener("resize", this.schedulePosition)
    controllers.set(view, this)
  }
  private blocks(): Block[] {
    const blocks: Block[] = []
    this.view.state.doc.descendants((node, from, parent, index) => {
      if (!parent) return false
      const element = this.view.nodeDOM(from)
      const eligible =
        parent.type === this.view.state.schema.topNodeType ||
        isList(parent) ||
        (isListItem(parent) && !(index === 0 && node.type.name === "paragraph"))
      if (eligible && element?.nodeType === 1) {
        const dom = element as HTMLElement
        const rect = dom.getBoundingClientRect()
        const paragraph = isListItem(node)
          ? (this.view.nodeDOM(from + 1) as HTMLElement | null)
          : null
        const line = paragraph?.getBoundingClientRect()
        blocks.push({
          node,
          from,
          index,
          parent,
          depth: this.view.state.doc.resolve(from).depth,
          element: dom,
          rect,
          hitRect: line?.height && line.width ? line : rect,
        })
      }
      return isList(node) || isListItem(node)
    })
    return blocks
  }
  private canDrag(block: Block): boolean {
    return (
      this.canSelect(block) &&
      !getPendingImageUploads(this.view.state).some(
        ({ position }) => position > block.from && position < block.from + block.node.nodeSize,
      ) &&
      this.options.canDrag?.(block.node, block.from, this.view.state) !== false
    )
  }
  private canSelect(block: Block): boolean {
    return (
      this.view.editable &&
      !this.view.composing &&
      block.node.isBlock &&
      NodeSelection.isSelectable(block.node)
    )
  }
  private rangeBlocks(from: number, to: number): Block[] {
    const parent = this.view.state.doc.resolve(from).parent
    return this.blocks().filter(
      (block) => block.parent === parent && block.from >= from && block.from < to,
    )
  }
  private choose(anchor: number, head: number, scroll = false): boolean {
    const selection = selectBlockRange(this.view.state.doc, anchor, head)
    if (!this.rangeBlocks(selection.from, selection.to).every((block) => this.canSelect(block)))
      return false
    if (!selection.eq(this.view.state.selection)) {
      const tr = this.view.state.tr.setSelection(selection)
      this.view.dispatch(scroll ? tr.scrollIntoView() : tr)
    }
    return true
  }
  private blockAtY(y: number): Block | undefined {
    const all = this.blocks()
    const populated = new Set(
      all
        .filter((block) => block.rect.width > 0 && block.rect.height > 0)
        .map((block) => block.parent),
    )
    const blocks = all
      .filter(
        (block) =>
          block.rect.width > 0 &&
          block.rect.height > 0 &&
          (!isList(block.node) || !populated.has(block.node)),
      )
      .sort((left, right) => right.depth - left.depth)
    return (
      blocks.find((block) => y >= block.rect.top && y <= block.rect.bottom) ??
      blocks.reduce<Block | undefined>((nearest, block) => {
        const distance = (item: Block) => Math.max(item.rect.top - y, y - item.rect.bottom, 0)
        return !nearest || distance(block) < distance(nearest) ? block : nearest
      }, undefined)
    )
  }
  private pointerDown = (event: PointerEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.pointerType === "touch" ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.isPrimary === false ||
      this.active ||
      !this.view.editable ||
      this.view.composing ||
      this.handle.contains(event.target as globalThis.Node)
    )
      return
    const target = event.target as HTMLElement
    if (target.closest("button, input, textarea, select, a, [contenteditable=false]")) return
    const block = this.blockAtY(event.clientY)
    if (!block || !this.canSelect(block)) return
    const hostRect = this.host.getBoundingClientRect()
    const right = this.host.clientWidth
      ? hostRect.left + this.host.clientLeft + this.host.clientWidth
      : hostRect.right
    const bottom = this.host.clientHeight
      ? hostRect.top + this.host.clientTop + this.host.clientHeight
      : hostRect.bottom
    if (
      event.clientX < hostRect.left + this.host.clientLeft ||
      event.clientX >= right ||
      event.clientY < hostRect.top + this.host.clientTop ||
      event.clientY >= bottom
    )
      return
    const margin =
      (target === this.view.dom ||
        target === this.host ||
        target.tagName === "LI" ||
        target.tagName === "UL" ||
        target.tagName === "OL" ||
        target.hasAttribute("data-task-content")) &&
      (event.clientX < block.hitRect.left || event.clientX > block.hitRect.right)
    const range = blockRange(this.view.state.selection)
    if (!margin && (!event.shiftKey || !range)) {
      if (
        !event.shiftKey &&
        target !== this.view.dom &&
        this.view.dom.contains(target) &&
        !target.closest("img, video, audio, iframe")
      ) {
        const point = this.view.posAtCoords({ left: event.clientX, top: event.clientY })
        if (point) {
          const $point = this.view.state.doc.resolve(point.pos)
          const selection = Selection.findFrom($point, 1, true) ?? Selection.near($point)
          this.view.dispatch(this.view.state.tr.setSelection(selection).setMeta("pointer", true))
        }
      }
      return
    }
    const anchor = event.shiftKey && range ? range.anchor : block.from
    if (!this.choose(anchor, block.from)) return
    event.preventDefault()
    event.stopPropagation()
    this.view.focus()
    if (!margin) {
      this.announceSelection()
      return
    }
    this.finishMargin()
    this.margin = {
      anchor,
      pointerId: event.pointerId,
      y: event.clientY,
      doc: this.view.state.doc,
    }
    this.host.dataset.blockSelecting = "true"
    this.ownerDocument.addEventListener("pointermove", this.marginMove, true)
    this.ownerDocument.addEventListener("pointerup", this.marginUp, true)
    this.ownerDocument.addEventListener("pointercancel", this.marginUp, true)
    this.ownerDocument.defaultView?.addEventListener("blur", this.finishMargin)
  }
  private marginMove = (event: PointerEvent) => {
    if (!this.margin || event.pointerId !== this.margin.pointerId) return
    event.preventDefault()
    this.margin.y = event.clientY
    const block = this.blockAtY(event.clientY)
    if (block) this.choose(this.margin.anchor, block.from)
    this.scrollMargin()
  }
  private marginUp = (event: PointerEvent) => {
    if (!this.margin || event.pointerId !== this.margin.pointerId) return
    this.finishMargin()
    this.view.focus()
    this.announceSelection()
  }
  private finishMargin = () => {
    this.margin = null
    delete this.host.dataset.blockSelecting
    if (this.scrollFrame !== null)
      this.ownerDocument.defaultView?.cancelAnimationFrame(this.scrollFrame)
    this.scrollFrame = null
    this.ownerDocument.removeEventListener("pointermove", this.marginMove, true)
    this.ownerDocument.removeEventListener("pointerup", this.marginUp, true)
    this.ownerDocument.removeEventListener("pointercancel", this.marginUp, true)
    this.ownerDocument.defaultView?.removeEventListener("blur", this.finishMargin)
  }
  private scrollMargin = () => {
    const window = this.ownerDocument.defaultView
    if (!window || !this.margin || this.scrollFrame !== null) return
    this.scrollFrame = window.requestAnimationFrame(() => {
      this.scrollFrame = null
      if (!this.margin) return
      let scroller: HTMLElement | null = this.host
      while (scroller) {
        if (
          scroller.scrollHeight > scroller.clientHeight &&
          /auto|scroll/.test(window.getComputedStyle(scroller).overflowY)
        )
          break
        scroller = scroller.parentElement
      }
      scroller ??= this.ownerDocument.scrollingElement as HTMLElement | null
      if (!scroller) return
      const root = scroller === this.ownerDocument.scrollingElement
      const rect = scroller.getBoundingClientRect()
      const top = root ? 0 : Math.max(0, rect.top + scroller.clientTop)
      const bottom = root
        ? window.innerHeight
        : Math.min(window.innerHeight, rect.top + scroller.clientTop + scroller.clientHeight)
      const y = this.margin.y
      const speed =
        y < top + 32
          ? -Math.min(20, Math.ceil((top + 32 - y) / 2))
          : y > bottom - 32
            ? Math.min(20, Math.ceil((y - bottom + 32) / 2))
            : 0
      if (!speed) return
      const previous = scroller.scrollTop
      scroller.scrollTop = Math.max(
        0,
        Math.min(scroller.scrollHeight - scroller.clientHeight, previous + speed),
      )
      if (scroller.scrollTop === previous) return
      const block = this.blockAtY(y)
      if (block) this.choose(this.margin.anchor, block.from)
      this.scrollMargin()
    })
  }
  private announceSelection() {
    const range = blockRange(this.view.state.selection)
    if (range)
      this.status.textContent = `${this.rangeBlocks(range.from, range.to).length}개 블록을 선택했습니다.`
  }
  private position(element: HTMLElement, left: number, top: number) {
    const parent = (element.offsetParent as HTMLElement | null) ?? this.host
    const rect = parent.getBoundingClientRect()
    element.style.left = `${left - rect.left + parent.scrollLeft - parent.clientLeft}px`
    element.style.top = `${top - rect.top + parent.scrollTop - parent.clientTop}px`
  }
  private showHandle(block: Block | undefined) {
    if (!block || !this.canDrag(block)) {
      this.hovered = null
      this.handle.hidden = true
      return
    }
    this.hovered = block.from
    this.handle.hidden = false
    this.handle.setAttribute("aria-label", `${block.index + 1}번째 블록 이동`)
    this.handle.dataset.blockIndex = String(block.index)
    this.handle.dataset.blockPosition = String(block.from)
    this.handle.dataset.blockDepth = String(block.depth)
    const list = isListItem(block.node) ? block.element.parentElement : null
    const edge = list?.getBoundingClientRect().left ?? block.rect.left
    const left = Math.max(
      this.host.getBoundingClientRect().left + 2,
      edge - this.handle.offsetWidth - 4,
    )
    const line = block.node.isTextblock
      ? block.element
      : (block.element.querySelector<HTMLElement>("p") ?? block.element)
    const rect = line.getBoundingClientRect()
    const style = this.ownerDocument.defaultView?.getComputedStyle(line)
    const padding = Number.parseFloat(style?.paddingTop ?? "") || 0
    const lineHeight = Number.parseFloat(style?.lineHeight ?? "") || 28
    const top =
      rect.top +
      padding +
      Math.min(Math.max(rect.height - padding, 0), lineHeight) / 2 -
      this.handle.offsetHeight / 2
    this.position(this.handle, left, top)
  }
  private selectedBlock(): Block | undefined {
    const { selection } = this.view.state
    const from = blockRange(selection)?.from ?? blockPosition(selection.$from)
    return (
      this.blocks().find((block) => block.from === from) ??
      this.blocks().find(
        (block) =>
          block.from === (selection.$from.depth ? selection.$from.before(1) : selection.from),
      )
    )
  }
  private pointerMove = (event: PointerEvent) => {
    if (
      this.active ||
      this.margin ||
      event.buttons ||
      this.handle.contains(event.target as globalThis.Node)
    )
      return
    const rect = this.view.dom.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right) return
    this.showHandle(this.blockAtY(event.clientY))
  }
  private pointerLeave = () => {
    if (!this.active && this.ownerDocument.activeElement !== this.handle) {
      this.handle.hidden = true
      this.hovered = null
    }
  }
  private focusIn = (event: FocusEvent) => {
    if (!this.active && event.target !== this.handle) this.showHandle(this.selectedBlock())
  }
  private focusOut = (event: FocusEvent) => {
    if (!this.host.contains(event.relatedTarget as globalThis.Node | null)) this.pointerLeave()
  }
  private click = (event: MouseEvent) => {
    if (this.hovered === null || this.active || !this.view.editable) return
    const range = blockRange(this.view.state.selection)
    const selected = range && this.hovered >= range.from && this.hovered < range.to
    if (event.shiftKey && range) this.choose(range.anchor, this.hovered)
    else if (!selected) this.choose(this.hovered, this.hovered)
    this.handle.focus()
    this.announceSelection()
  }
  private dragStart = (event: DragEvent) => {
    const block = this.blocks().find((item) => item.from === this.hovered)
    if (!block || !this.canDrag(block) || !event.dataTransfer) {
      event.preventDefault()
      return
    }
    const current = blockRange(this.view.state.selection)
    const selected = current && block.from >= current.from && block.from < current.to
    if (!selected) this.choose(block.from, block.from)
    const selection = this.view.state.selection
    if (!this.rangeBlocks(selection.from, selection.to).every((item) => this.canDrag(item))) {
      event.preventDefault()
      return
    }
    const { dom, text, slice } = this.view.serializeForClipboard(selection.content())
    event.dataTransfer.clearData()
    event.dataTransfer.setData("text/html", dom.innerHTML)
    event.dataTransfer.setData("text/plain", text)
    event.dataTransfer.setData(dragSourceType, this.sourceId)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setDragImage(block.element, 0, 0)
    this.view.dragging = { slice, move: true }
    this.active = {
      from: selection.from,
      to: selection.to,
      doc: this.view.state.doc,
      dragging: this.view.dragging,
    }
    this.handle.dataset.dragging = "true"
  }
  private target(x: number, y: number): DropTarget | null {
    let block = this.blockAtY(y)
    const active = this.active
    if (!block || !active || (block.from >= active.from && block.from < active.to)) return null
    const source = this.view.state.doc.nodeAt(active.from)
    if (
      isListItem(block.node) &&
      source &&
      !isListItem(source) &&
      x >= block.hitRect.left &&
      y >= block.hitRect.top + Math.min(block.hitRect.height, 28) / 2
    ) {
      const position = block.from + 1 + (block.node.firstChild?.nodeSize ?? 0)
      if (moveBlocks(active.from, active.to, position, { replaceEmpty: true })(this.view.state))
        return { position, block, y: block.hitRect.bottom + 2, replaceEmpty: true, child: true }
    }
    if (block.node.type.name === "paragraph" && block.node.content.size === 0) {
      if (moveBlocks(active.from, active.to, block.from, { replaceEmpty: true })(this.view.state))
        return { position: block.from, block, y: block.rect.top, replaceEmpty: true }
    }
    while (block) {
      const before: boolean = y < block.hitRect.top + Math.min(block.hitRect.height, 28) / 2
      const position: number = before ? block.from : block.from + block.node.nodeSize
      if (moveBlocks(active.from, active.to, position)(this.view.state))
        return { position, block, y: before ? block.hitRect.top : block.rect.bottom }
      const parentPosition: number | null = block.depth
        ? this.view.state.doc.resolve(block.from).before()
        : null
      block = this.blocks().find((item) => item.from === parentPosition)
    }
    return null
  }
  private dragOver = (event: DragEvent) => {
    if (!this.active || !this.view.editable) return
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
    const target = this.target(event.clientX, event.clientY)
    if (
      !target ||
      !moveBlocks(this.active.from, this.active.to, target.position, {
        replaceEmpty: target.replaceEmpty === true,
      })(this.view.state)
    ) {
      this.indicator.hidden = true
      return
    }
    this.indicator.hidden = false
    const rect = target.child ? target.block.hitRect : target.block.rect
    this.indicator.style.width = `${rect.width}px`
    this.indicator.dataset.dropKind = target.child ? "child" : "between"
    this.position(this.indicator, rect.left, target.y)
  }
  private drop = (event: DragEvent) => {
    const active = this.active
    if (!active && event.dataTransfer?.getData(dragSourceType) !== this.sourceId) return
    event.preventDefault()
    event.stopPropagation()
    if (!active) return
    const target = this.target(event.clientX, event.clientY)
    this.finish()
    if (
      !target ||
      this.view.state.doc !== active.doc ||
      !this.rangeBlocks(active.from, active.to).every((block) => this.canDrag(block))
    )
      return
    if (
      moveBlocks(active.from, active.to, target.position, {
        replaceEmpty: target.replaceEmpty === true,
      })(this.view.state, this.view.dispatch, this.view)
    ) {
      this.announce()
      this.view.focus()
      this.showHandle(this.selectedBlock())
    }
  }
  handleKeyDown(event: KeyboardEvent): boolean {
    if (
      !this.view.editable ||
      this.view.composing ||
      event.isComposing ||
      event.keyCode === 229 ||
      this.active ||
      this.margin
    )
      return false
    const range = blockRange(this.view.state.selection)
    const onHandle = this.handle.contains(event.target as globalThis.Node)
    if (
      onHandle &&
      range &&
      (this.hovered === null || this.hovered < range.from || this.hovered >= range.to)
    )
      return false
    if (event.ctrlKey || event.metaKey) return false
    if (event.key === "Escape") {
      if (range) this.enterBlock(range.head)
      else {
        const position = blockPosition(this.view.state.selection.$head)
        const block = this.blocks().find((item) => item.from === position) ?? this.selectedBlock()
        if (!block || !this.canSelect(block)) return false
        this.choose(block.from, block.from, true)
        this.view.focus()
        this.announceSelection()
      }
      return true
    }
    if ((event.key === "Backspace" || event.key === "Delete") && !event.altKey && !event.shiftKey) {
      if (!range) return false
      const count = this.rangeBlocks(range.from, range.to).length
      deleteSelection(this.view.state, (tr) => {
        this.view.dispatch(closeHistory(tr).setMeta("vlab-editor-block-delete", true))
      })
      this.view.focus()
      this.status.textContent = `${count}개 블록을 삭제했습니다.`
      return true
    }
    if (range && !event.altKey && ["Enter", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      this.enterBlock(
        event.key === "ArrowLeft" ? range.from : range.head,
        event.key === "ArrowRight",
      )
      return true
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return false
    const position = onHandle ? this.hovered : blockPosition(this.view.state.selection.$from)
    const sourceBlock = this.blocks().find((block) => block.from === (range?.from ?? position))
    if (!sourceBlock) return false
    const blocks = this.blocks().filter((block) => block.parent === sourceBlock.parent)
    const direction = event.key === "ArrowUp" ? -1 : 1
    if (range && !event.altKey) {
      const index = blocks.findIndex((block) => block.from === range.head)
      const target = blocks[index + direction]
      if (target && this.canSelect(target)) {
        this.choose(event.shiftKey ? range.anchor : target.from, target.from, true)
        this.announceSelection()
      }
      return true
    }
    if (!event.altKey) return false
    const first = range?.from ?? position
    const source = blocks.find((block) => block.from === first)
    if (!source) return false
    const end = range?.to ?? source.from + source.node.nodeSize
    if (!this.rangeBlocks(source.from, end).every((block) => this.canDrag(block))) return false
    const index = blocks.findIndex((block) =>
      direction < 0 ? block.from === source.from : block.from + block.node.nodeSize === end,
    )
    const target = blocks[index + direction]
    if (!target) return true
    const to = direction < 0 ? target.from : target.from + target.node.nodeSize
    if (moveBlocks(source.from, end, to)(this.view.state, this.view.dispatch, this.view)) {
      this.showHandle(this.selectedBlock())
      this.announce()
      if (onHandle) this.handle.focus()
    }
    return true
  }
  private enterBlock(position: number, end = false) {
    const node = this.view.state.doc.nodeAt(position)
    if (!node) return
    const at = position + (end ? node.nodeSize - 1 : 1)
    const $position = this.view.state.doc.resolve(at)
    const selection = Selection.findFrom($position, end ? -1 : 1, true) ?? Selection.near($position)
    this.view.dispatch(this.view.state.tr.setSelection(selection).scrollIntoView())
    this.view.focus()
  }
  private keyDown = (event: KeyboardEvent) => {
    let handled = this.handleKeyDown(event)
    if (
      !handled &&
      (event.ctrlKey ||
        event.metaKey ||
        (event.key === "Tab" && blockRange(this.view.state.selection))) &&
      !event.altKey &&
      this.view.editable
    ) {
      this.view.focus()
      handled = this.view.someProp("handleKeyDown", (handler) => handler(this.view, event)) === true
    }
    if (handled) {
      event.preventDefault()
      event.stopPropagation()
    }
  }
  private announce() {
    const block = this.selectedBlock()
    if (block) this.status.textContent = `블록을 ${block.index + 1}번째 위치로 이동했습니다.`
  }
  private finish() {
    if (this.active && this.view.dragging === this.active.dragging) this.view.dragging = null
    this.active = null
    delete this.handle.dataset.dragging
    this.indicator.hidden = true
  }
  private dragEnd = () => this.finish()
  private outsideDrop = (event: DragEvent) => {
    if (!this.host.contains(event.target as globalThis.Node | null)) this.finish()
  }
  private escape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return
    if (this.active || this.margin) {
      this.finish()
      this.finishMargin()
      event.preventDefault()
      event.stopPropagation()
    }
  }
  private schedulePosition = () => {
    const window = this.ownerDocument.defaultView
    if (!window || this.frame !== null) return
    this.frame = window.requestAnimationFrame(() => {
      this.frame = null
      if (this.destroyed) return
      this.indicator.hidden = true
      if (this.margin) {
        const block = this.blockAtY(this.margin.y)
        if (block) this.choose(this.margin.anchor, block.from)
      }
      if (this.hovered !== null)
        this.showHandle(this.blocks().find((block) => block.from === this.hovered))
    })
  }
  update(view: EditorView, previous: EditorState) {
    this.view = view
    if (this.active && (previous.doc !== view.state.doc || !view.editable)) this.finish()
    if (this.margin && (previous.doc !== view.state.doc || !view.editable)) this.finishMargin()
    if (this.hovered !== null || this.host.contains(this.ownerDocument.activeElement))
      this.showHandle(this.selectedBlock())
  }
  destroy() {
    this.destroyed = true
    this.finish()
    this.finishMargin()
    controllers.delete(this.view)
    if (this.frame !== null) this.ownerDocument.defaultView?.cancelAnimationFrame(this.frame)
    this.host.removeEventListener("pointerdown", this.pointerDown, true)
    this.host.removeEventListener("pointermove", this.pointerMove)
    this.host.removeEventListener("pointerleave", this.pointerLeave)
    this.host.removeEventListener("focusin", this.focusIn)
    this.host.removeEventListener("focusout", this.focusOut)
    this.host.removeEventListener("dragover", this.dragOver, true)
    this.host.removeEventListener("drop", this.drop, true)
    this.handle.removeEventListener("dragstart", this.dragStart)
    this.handle.removeEventListener("keydown", this.keyDown)
    this.handle.removeEventListener("click", this.click)
    this.ownerDocument.removeEventListener("drop", this.outsideDrop, true)
    this.ownerDocument.removeEventListener("dragend", this.dragEnd, true)
    this.ownerDocument.removeEventListener("keydown", this.escape, true)
    this.ownerDocument.removeEventListener("scroll", this.schedulePosition, true)
    this.ownerDocument.defaultView?.removeEventListener("resize", this.schedulePosition)
    this.handle.remove()
    this.indicator.remove()
    this.status.remove()
  }
}
