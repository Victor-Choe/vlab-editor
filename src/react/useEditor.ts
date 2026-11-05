"use client"
import { useEffect, useState } from "react"
import { Editor, type EditorOptions } from "../engine/index.js"
export function useEditor(options: EditorOptions = {}): Editor {
  const [editor] = useState(() => new Editor(options))
  useEffect(() => {
    editor.setCallbacks(options)
    editor.setEditable(options.editable !== false)
  })
  useEffect(() => () => editor.cancelImageUploads(), [editor])
  return editor
}
