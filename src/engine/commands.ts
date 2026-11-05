import { setBlockType, toggleMark, wrapIn } from "prosemirror-commands"
import { closeHistory, redo, undo } from "prosemirror-history"
import { liftListItem, sinkListItem, wrapInList } from "prosemirror-schema-list"
import { type Command, type EditorState, Selection, type Transaction } from "prosemirror-state"
import { liftTarget } from "prosemirror-transform"
import { removeLink } from "./media.js"
import { type editorSchema, editorTypes, type HeadingLevel } from "./schema.js"
import { contentSelection, withContentSelection } from "./selection.js"
import { tableCommands } from "./tables.js"
import { insertListParagraph, taskList } from "./tasks.js"

function selectedList(state: EditorState) {
  const { $from, to } = contentSelection(state)
  for (let depth = $from.sharedDepth(to); depth > 0; depth--) {
    const node = $from.node(depth)
    if (
      node.type === editorTypes(state.schema).nodes.bullet_list ||
      node.type === editorTypes(state.schema).nodes.ordered_list
    )
      return { node, pos: $from.before(depth) }
  }
  return null
}
function toggleList(name: "bullet_list" | "ordered_list"): Command {
  return (state, dispatch, view) => {
    state = withContentSelection(state)
    const type = editorTypes(state.schema).nodes[name]
    const list = selectedList(state)
    if (!list) return wrapInList(type)(state, dispatch, view)
    if (list.node.type === type)
      return liftListItem(editorTypes(state.schema).nodes.list_item)(state, dispatch, view)
    dispatch?.(state.tr.setNodeMarkup(list.pos, type).scrollIntoView())
    return true
  }
}
const blockquote: Command = (state, dispatch, view) => {
  state = withContentSelection(state)
  const { $from, $to } = state.selection
  const range = $from.blockRange(
    $to,
    (node) => node.type === editorTypes(state.schema).nodes.blockquote,
  )
  if (!range) return wrapIn(editorTypes(state.schema).nodes.blockquote)(state, dispatch, view)
  const target = liftTarget(range)
  if (target === null) return false
  dispatch?.(state.tr.lift(range, target).scrollIntoView())
  return true
}
export function insertHorizontalRule(transaction: Transaction): Transaction {
  transaction.replaceSelectionWith(
    editorTypes(transaction.doc.type.schema).nodes.horizontal_rule.create(),
  )
  const position = transaction.selection.to
  const $position = transaction.doc.resolve(position)
  if (
    !$position.nodeAfter &&
    $position.parent.canReplaceWith(
      $position.index(),
      $position.index(),
      editorTypes(transaction.doc.type.schema).nodes.paragraph,
    )
  ) {
    transaction.insert(position, editorTypes(transaction.doc.type.schema).nodes.paragraph.create())
  }
  transaction.setSelection(Selection.near(transaction.doc.resolve(position), 1))
  return transaction.scrollIntoView()
}
const horizontalRule: Command = (state, dispatch) => {
  if (state.selection.$from.parent.type.spec.code) return false
  const transaction = insertHorizontalRule(state.tr)
  if (!transaction.docChanged) return false
  dispatch?.(transaction)
  return true
}
const codeBlock: Command = (state, dispatch, view) => {
  state = withContentSelection(state)
  return setBlockType(
    state.selection.$from.parent.type === editorTypes(state.schema).nodes.code_block
      ? editorTypes(state.schema).nodes.paragraph
      : editorTypes(state.schema).nodes.code_block,
  )(state, dispatch, view)
}
export function setCodeBlockLanguage(language: string, position?: number): Command {
  return (state, dispatch) => {
    if (typeof language !== "string" || (language !== "" && !/^[\w#+.-]+$/.test(language)))
      return false
    const { $from, $to } = state.selection
    if (
      position !== undefined &&
      (!Number.isInteger(position) || position < 0 || position >= state.doc.content.size)
    )
      return false
    if (
      position === undefined &&
      (!$from.sameParent($to) || $from.parent.type !== editorTypes(state.schema).nodes.code_block)
    )
      return false
    const node = position === undefined ? $from.parent : state.doc.nodeAt(position)
    if (node?.type !== editorTypes(state.schema).nodes.code_block) return false
    const suffix = node.attrs.params.trim().replace(/^\S+/, "")
    const params = language ? `${language}${suffix}` : ""
    if (params === node.attrs.params) return false
    dispatch?.(
      closeHistory(
        state.tr.setNodeMarkup(position ?? $from.before(), undefined, { ...node.attrs, params }),
      ),
    )
    return true
  }
}
export const insertHardBreak: Command = (state, dispatch) => {
  const { $from } = state.selection
  if (!$from.parent.inlineContent || $from.parent.type.spec.code) return false
  const tr = state.tr
    .replaceSelectionWith(editorTypes(state.schema).nodes.hard_break.create())
    .scrollIntoView()
  if (!tr.docChanged) return false
  dispatch?.(tr)
  return true
}
function bySchema(create: (schema: typeof editorSchema) => Command): Command {
  return (state, dispatch, view) => create(editorTypes(state.schema))(state, dispatch, view)
}
export const commands = {
  paragraph: bySchema((schema) => setBlockType(schema.nodes.paragraph)),
  heading1: bySchema((schema) => setBlockType(schema.nodes.heading, { level: 1 })),
  heading2: bySchema((schema) => setBlockType(schema.nodes.heading, { level: 2 })),
  heading3: bySchema((schema) => setBlockType(schema.nodes.heading, { level: 3 })),
  heading4: bySchema((schema) => setBlockType(schema.nodes.heading, { level: 4 })),
  heading5: bySchema((schema) => setBlockType(schema.nodes.heading, { level: 5 })),
  heading6: bySchema((schema) => setBlockType(schema.nodes.heading, { level: 6 })),
  bold: bySchema((schema) => toggleMark(schema.marks.strong)),
  italic: bySchema((schema) => toggleMark(schema.marks.em)),
  strike: bySchema((schema) => toggleMark(schema.marks.strike)),
  inlineCode: bySchema((schema) => toggleMark(schema.marks.code)),
  codeBlock,
  bulletList: toggleList("bullet_list"),
  orderedList: toggleList("ordered_list"),
  taskList,
  indentList: bySchema(
    (schema) => (state, dispatch, view) =>
      sinkListItem(schema.nodes.list_item)(withContentSelection(state), dispatch, view),
  ),
  outdentList: bySchema(
    (schema) => (state, dispatch, view) =>
      liftListItem(schema.nodes.list_item)(withContentSelection(state), dispatch, view),
  ),
  insertListParagraph,
  blockquote,
  horizontalRule,
  removeLink,
  ...tableCommands,
  undo,
  redo,
}
export type EditorCommand = keyof typeof commands | Command
export function isCommandActive(
  name: keyof typeof commands,
  state: EditorState,
): boolean | undefined {
  if (name in tableCommands) return undefined
  if (
    name === "undo" ||
    name === "redo" ||
    name === "horizontalRule" ||
    name === "indentList" ||
    name === "outdentList" ||
    name === "removeLink" ||
    name === "insertListParagraph"
  )
    return undefined
  const { doc, selection, storedMarks } = state
  if (name === "bold" || name === "italic" || name === "inlineCode" || name === "strike") {
    const mark = editorTypes(state.schema).marks[
      name === "bold" ? "strong" : name === "italic" ? "em" : name === "strike" ? "strike" : "code"
    ]
    return selection.empty
      ? Boolean(mark.isInSet(storedMarks ?? selection.$from.marks()))
      : doc.rangeHasMark(selection.from, selection.to, mark)
  }
  if (name === "taskList") {
    for (let depth = contentSelection(state).$from.depth; depth > 0; depth--) {
      const node = contentSelection(state).$from.node(depth)
      if (node.type === editorTypes(state.schema).nodes.list_item)
        return node.attrs.checked !== null
    }
    return false
  }
  if (name === "bulletList" || name === "orderedList")
    return (
      selectedList(state)?.node.type ===
      editorTypes(state.schema).nodes[name === "bulletList" ? "bullet_list" : "ordered_list"]
    )
  if (name === "blockquote") {
    const selection = contentSelection(state)
    return Boolean(
      selection.$from.blockRange(
        selection.$to,
        (node) => node.type === editorTypes(state.schema).nodes.blockquote,
      ),
    )
  }
  const parent = contentSelection(state).$from.parent
  if (name === "paragraph") return parent.type === editorTypes(state.schema).nodes.paragraph
  if (name === "codeBlock") return parent.type === editorTypes(state.schema).nodes.code_block
  return (
    parent.type === editorTypes(state.schema).nodes.heading &&
    parent.attrs.level === (Number(name.slice(-1)) as HeadingLevel)
  )
}
