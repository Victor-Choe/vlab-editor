"use client"
import type { EditorState } from "prosemirror-state"
import { useMemo, useSyncExternalStore } from "react"
import { useEditorContext } from "./editor-context.js"
export function useEditorState(): EditorState
export function useEditorState<T>(
  selector: (state: EditorState) => T,
  isEqual?: (previous: T, next: T) => boolean,
): T
export function useEditorState<T = EditorState>(
  selector: (state: EditorState) => T | EditorState = (state) => state,
  isEqual: (previous: T | EditorState, next: T | EditorState) => boolean = Object.is,
): T | EditorState {
  const editor = useEditorContext()
  const store = useMemo(() => {
    let cached:
      | {
          state: EditorState
          value: T | EditorState
        }
      | undefined
    const select = (state: EditorState) => {
      if (cached?.state === state) return cached.value
      const value = selector(state)
      cached = { state, value: cached && isEqual(cached.value, value) ? cached.value : value }
      return cached.value
    }
    return {
      getSnapshot: () => select(editor.getSnapshot().state),
      getServerSnapshot: () => select(editor.getServerSnapshot().state),
    }
  }, [editor, selector, isEqual])
  return useSyncExternalStore(editor.subscribe, store.getSnapshot, store.getServerSnapshot)
}
