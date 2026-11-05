"use client"
import type { EditorState } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import { type ComponentProps, useContext, useSyncExternalStore } from "react"
import { cn } from "../lib/cn.js"
import {
  BoldButton,
  HeadingButton,
  ItalicButton,
  ParagraphButton,
  RedoButton,
  UndoButton,
} from "./CommandButtons.js"
import { EditorContext } from "./editor-context.js"
import { ToolBarSeparator } from "./ToolBarSeparator.js"
import { ToolBarContext } from "./toolbar-context.js"
export type ToolBarProps = ComponentProps<"div"> & {
  buttonClassName?: string
  dividerClassName?: string
} & (
    | {
        view: EditorView | null
        state: EditorState | null
      }
    | {
        view?: never
        state?: never
      }
  )
const subscribeToNothing = () => () => {}
const getEmptySnapshot = () => null
export function ToolBar({
  view,
  state,
  children,
  className,
  buttonClassName,
  dividerClassName,
  ...props
}: ToolBarProps) {
  const editor = useContext(EditorContext)
  const explicit = view !== undefined || state !== undefined
  const source = explicit ? null : editor
  const snapshot = useSyncExternalStore(
    source?.subscribe ?? subscribeToNothing,
    source?.getSnapshot ?? getEmptySnapshot,
    source?.getServerSnapshot ?? getEmptySnapshot,
  )
  if (!explicit && !editor) {
    throw new Error(
      "vlab-editor: <ToolBar> requires <EditorProvider> or both view and state props.",
    )
  }
  if (explicit && (view === undefined || state === undefined)) {
    throw new Error("vlab-editor: pass both view and state to <ToolBar>.")
  }
  return (
    <ToolBarContext.Provider
      value={{
        view: explicit ? (view ?? null) : (snapshot?.view ?? null),
        state: explicit ? (state ?? null) : (snapshot?.state ?? null),
        buttonClassName,
        dividerClassName,
      }}
    >
      <div
        role="toolbar"
        aria-label="문서 서식"
        {...props}
        className={cn("vlab-editor-toolbar", className)}
      >
        {children === undefined ? (
          <>
            <ParagraphButton />
            <HeadingButton level={1} />
            <HeadingButton level={2} />
            <ToolBarSeparator />
            <BoldButton />
            <ItalicButton />
            <ToolBarSeparator />
            <UndoButton />
            <RedoButton />
          </>
        ) : (
          children
        )}
      </div>
    </ToolBarContext.Provider>
  )
}
