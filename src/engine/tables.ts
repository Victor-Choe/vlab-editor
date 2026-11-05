import { closeHistory } from "prosemirror-history"
import type { Node } from "prosemirror-model"
import { type Command, Plugin, Selection } from "prosemirror-state"
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  selectedRect,
} from "prosemirror-tables"
import { editorTypes } from "./schema.js"
export function insertTable({
  rows = 3,
  columns = 3,
}: {
  rows?: number
  columns?: number
} = {}): Command {
  return (state, dispatch) => {
    if (
      !Number.isInteger(rows) ||
      !Number.isInteger(columns) ||
      rows < 2 ||
      columns < 1 ||
      rows > 100 ||
      columns > 100 ||
      state.selection.$from.parent.type.spec.code
    )
      return false
    for (let depth = state.selection.$from.depth; depth > 0; depth--)
      if (state.selection.$from.node(depth).type.spec.tableRole) return false
    const { table, table_row, table_header, table_cell, paragraph } = editorTypes(
      state.schema,
    ).nodes
    const content: Node[] = []
    for (let row = 0; row < rows; row++) {
      const cells: Node[] = []
      for (let column = 0; column < columns; column++)
        cells.push((row ? table_cell : table_header).create(null, paragraph.create()))
      content.push(table_row.create(null, cells))
    }
    const tr = state.tr.replaceSelectionWith(table.create(null, content))
    let start: number | undefined
    tr.doc.nodesBetween(
      Math.max(0, tr.selection.from - tr.doc.content.size),
      tr.selection.to,
      (node, pos) => {
        if (node.type === table) {
          start = pos
          return false
        }
      },
    )
    if (start !== undefined) tr.setSelection(Selection.near(tr.doc.resolve(start + 3)))
    dispatch?.(closeHistory(tr).scrollIntoView())
    return tr.docChanged
  }
}
function isolated(command: Command): Command {
  return (state, dispatch, view) =>
    command(state, dispatch ? (tr) => dispatch(closeHistory(tr)) : undefined, view)
}
export const exitTable: Command = (state, dispatch) => {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.spec.tableRole !== "table") continue
    const pos = $from.after(depth)
    const $pos = state.doc.resolve(pos)
    const paragraph = editorTypes(state.schema).nodes.paragraph
    if (!$pos.parent.canReplaceWith($pos.index(), $pos.index(), paragraph)) return false
    const tr = state.tr
    if ($pos.nodeAfter?.type !== paragraph) tr.insert(pos, paragraph.create())
    tr.setSelection(Selection.near(tr.doc.resolve(pos + 1)))
    dispatch?.(closeHistory(tr).scrollIntoView())
    return true
  }
  return false
}
export const tableCommands = {
  insertTable: insertTable(),
  addRowBefore: isolated(addRowBefore),
  addRowAfter: isolated(addRowAfter),
  deleteRow: isolated(deleteRow),
  addColumnBefore: isolated(addColumnBefore),
  addColumnAfter: isolated(addColumnAfter),
  deleteColumn: isolated(deleteColumn),
  deleteTable: isolated(deleteTable),
  exitTable,
}
export function setTableAlignment(align: "left" | "center" | "right" | null): Command {
  return (state, dispatch) => {
    if (![null, "left", "center", "right"].includes(align)) return false
    let rect: ReturnType<typeof selectedRect>
    try {
      rect = selectedRect(state)
    } catch {
      return false
    }
    const tr = state.tr
    rect.table.forEach((row, rowOffset) => {
      row.forEach((cell, cellOffset, column) => {
        if (column >= rect.left && column < rect.right)
          tr.setNodeMarkup(rect.tableStart + rowOffset + 1 + cellOffset, undefined, {
            ...cell.attrs,
            align,
          })
      })
    })
    dispatch?.(closeHistory(tr))
    return true
  }
}
export function gfmTablePlugin(): Plugin {
  return new Plugin({
    appendTransaction(transactions, _previous, state) {
      if (!transactions.some((tr) => tr.docChanged)) return null
      const tr = state.tr
      state.doc.descendants((table, pos) => {
        if (table.type !== editorTypes(state.schema).nodes.table) return
        table.forEach((row, rowOffset, rowIndex) => {
          row.forEach((cell, cellOffset, column) => {
            const type =
              rowIndex === 0
                ? editorTypes(state.schema).nodes.table_header
                : editorTypes(state.schema).nodes.table_cell
            const align = table.firstChild?.maybeChild(column)?.attrs.align ?? null
            if (cell.type !== type || cell.attrs.align !== align)
              tr.setNodeMarkup(pos + 2 + rowOffset + cellOffset, type, { ...cell.attrs, align })
          })
        })
        return false
      })
      return tr.docChanged ? tr : null
    },
  })
}
