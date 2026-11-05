"use client"
import { createContext, useContext } from "react"
import type { Editor } from "../engine/index.js"
export const EditorContext = createContext<Editor | null>(null)
export function useEditorContext(): Editor {
  const editor = useContext(EditorContext)
  if (!editor) {
    throw new Error("vlab-editor: editor components must be rendered inside <EditorProvider>.")
  }
  return editor
}
