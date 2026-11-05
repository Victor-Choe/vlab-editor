"use client"
import type { EditorState } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import { createContext, useContext } from "react"
export interface ToolBarContextValue {
  view: EditorView | null
  state: EditorState | null
  buttonClassName: string | undefined
  dividerClassName: string | undefined
}
export const ToolBarContext = createContext<ToolBarContextValue | null>(null)
export function useToolBarContext(): ToolBarContextValue {
  const context = useContext(ToolBarContext)
  if (!context) {
    throw new Error("vlab-editor toolbar controls must be rendered inside <ToolBar>.")
  }
  return context
}
