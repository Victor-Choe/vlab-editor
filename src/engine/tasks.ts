import { closeHistory } from "prosemirror-history"
import { splitListItem, wrapInList } from "prosemirror-schema-list"
import { type Command, TextSelection } from "prosemirror-state"
import type { EditorView, NodeViewConstructor } from "prosemirror-view"
import { editorTypes } from "./schema.js"
import { withContentSelection } from "./selection.js"
export function syncTaskItemEditability(view: EditorView): void {
  for (const checkbox of view.dom.querySelectorAll<HTMLInputElement>(
    "li[data-checked] > input[type=checkbox]",
  ))
    checkbox.disabled = !view.editable
}
export const taskList: Command = (state, dispatch, view) => {
  state = withContentSelection(state)
  const itemType = editorTypes(state.schema).nodes.list_item
  let transaction = state.tr
  let inList = false
  for (let depth = state.selection.$from.depth; depth > 0; depth--)
    if (state.selection.$from.node(depth).type === itemType) inList = true
  if (!inList) {
    const applied = wrapInList(editorTypes(state.schema).nodes.bullet_list)(
      state,
      (tr) => {
        transaction = tr
      },
      view,
    )
    if (!applied) return false
  }
  const items: {
    pos: number
    checked: boolean | null
  }[] = []
  const { from, to, $from } = transaction.selection
  if (from === to) {
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type === itemType) {
        items.push({ pos: $from.before(depth), checked: $from.node(depth).attrs.checked })
        break
      }
    }
  } else {
    const seen = new Set<number>()
    transaction.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return
      const $pos = transaction.doc.resolve(pos)
      for (let depth = $pos.depth; depth > 0; depth--) {
        if ($pos.node(depth).type !== itemType) continue
        const itemPos = $pos.before(depth)
        if (!seen.has(itemPos)) {
          items.push({ pos: itemPos, checked: $pos.node(depth).attrs.checked })
          seen.add(itemPos)
        }
        break
      }
      return false
    })
  }
  if (!items.length) return false
  const remove = items.every((item) => item.checked !== null)
  for (const item of items)
    transaction.setNodeMarkup(item.pos, undefined, {
      checked: remove ? null : (item.checked ?? false),
    })
  dispatch?.(closeHistory(transaction).scrollIntoView())
  return true
}
export const splitEditorListItem: Command = (state, dispatch, view) => {
  const { $from } = state.selection
  const checked = $from.depth >= 2 ? $from.node(-1).attrs.checked : null
  return splitListItem(editorTypes(state.schema).nodes.list_item, {
    checked: checked == null ? null : false,
  })(state, dispatch, view)
}
export const insertListParagraph: Command = (state, dispatch) => {
  state = withContentSelection(state)
  const { $from } = state.selection
  const { list_item, paragraph } = editorTypes(state.schema).nodes
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type !== list_item) continue
    const position = $from.depth > depth ? $from.after(depth + 1) : $from.end(depth)
    const $position = state.doc.resolve(position)
    if (!$position.parent.canReplaceWith($position.index(), $position.index(), paragraph))
      return false
    if (dispatch) {
      const tr = closeHistory(state.tr).insert(position, paragraph.create())
      tr.setSelection(TextSelection.create(tr.doc, position + 1))
      dispatch(tr.scrollIntoView())
    }
    return true
  }
  return false
}
export const taskItemView: NodeViewConstructor = (node, view, getPos) => {
  const dom = document.createElement("li")
  let current = node
  const task = node.attrs.checked !== null
  const contentDOM = task ? document.createElement("div") : dom
  let checkbox: HTMLInputElement | undefined
  if (task) {
    checkbox = document.createElement("input")
    checkbox.type = "checkbox"
    checkbox.contentEditable = "false"
    checkbox.setAttribute("aria-label", "완료 상태")
    contentDOM.dataset.taskContent = ""
    dom.append(checkbox, contentDOM)
  }
  const render = () => {
    if (checkbox) {
      checkbox.checked = current.attrs.checked
      checkbox.disabled = !view.editable
      dom.dataset.checked = String(current.attrs.checked)
    }
  }
  const change = () => {
    if (!view.editable) {
      render()
      return
    }
    const pos = getPos()
    if (pos !== undefined && view.editable)
      view.dispatch(
        closeHistory(
          view.state.tr.setNodeMarkup(pos, undefined, {
            ...current.attrs,
            checked: checkbox?.checked,
          }),
        ),
      )
  }
  checkbox?.addEventListener("change", change)
  render()
  return {
    dom,
    contentDOM,
    update(next) {
      if (next.type !== current.type || (next.attrs.checked !== null) !== task) return false
      current = next
      render()
      return true
    },
    stopEvent: (event) => event.target === checkbox,
    ignoreMutation: (mutation) =>
      mutation.type !== "selection" && !contentDOM.contains(mutation.target),
    destroy: () => checkbox?.removeEventListener("change", change),
  }
}
