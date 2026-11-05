import { AllSelection, type EditorState, NodeSelection, TextSelection } from "prosemirror-state"
import { BlockSelection } from "./block-selection.js"
export function contentSelection(state: EditorState) {
  const selection = state.selection
  return selection instanceof AllSelection ||
    selection instanceof BlockSelection ||
    (selection instanceof NodeSelection && !selection.node.isLeaf)
    ? TextSelection.between(selection.$from, selection.$to)
    : selection
}
export function withContentSelection(state: EditorState): EditorState {
  const selection = contentSelection(state)
  return selection === state.selection ? state : state.apply(state.tr.setSelection(selection))
}
