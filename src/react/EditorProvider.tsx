"use client"
import type { ReactNode } from "react"
import type { Editor } from "../engine/index.js"
import { EditorContext } from "./editor-context.js"
export interface EditorProviderProps {
  editor: Editor
  children?: ReactNode
}
export function EditorProvider({ editor, children }: EditorProviderProps) {
  return <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>
}
