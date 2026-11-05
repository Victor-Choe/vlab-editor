"use client"
import type { EditorState } from "prosemirror-state"
import type { ComponentProps } from "react"
import { commands, type EditorCommand, isCommandActive } from "../engine/index.js"
import { cn } from "../lib/cn.js"
import { useToolBarContext } from "./toolbar-context.js"
export type ToolBarCommand = EditorCommand
export type ToolBarButtonProps = Omit<ComponentProps<"button">, "type"> & {
  command: ToolBarCommand
  isActive?: boolean | ((state: EditorState) => boolean)
  focusEditor?: boolean
}
function getActiveState(
  command: ToolBarCommand,
  state: EditorState | null,
  isActive: ToolBarButtonProps["isActive"],
): boolean | undefined {
  if (typeof isActive === "boolean") return isActive
  if (!state) {
    return typeof command === "string" &&
      ![
        "undo",
        "redo",
        "horizontalRule",
        "indentList",
        "outdentList",
        "removeLink",
        "insertListParagraph",
      ].includes(command)
      ? false
      : undefined
  }
  if (typeof isActive === "function") return isActive(state)
  return typeof command === "string" ? isCommandActive(command, state) : undefined
}
export function ToolBarButton({
  command,
  isActive,
  focusEditor = true,
  className,
  disabled = false,
  onPointerDown,
  onClick,
  "aria-pressed": ariaPressed,
  ...props
}: ToolBarButtonProps) {
  const { view, state, buttonClassName } = useToolBarContext()
  const execute = typeof command === "string" ? commands[command] : command
  const unavailable = !view || view.isDestroyed || !view.editable || !state
  const canExecute = !unavailable && execute(state, undefined, view)
  return (
    <button
      data-command={typeof command === "string" ? command : undefined}
      {...props}
      type="button"
      className={cn("vlab-editor-toolbar__button", buttonClassName, className)}
      aria-pressed={ariaPressed ?? getActiveState(command, state, isActive)}
      disabled={disabled || !canExecute}
      onPointerDown={(event) => {
        onPointerDown?.(event)
        event.preventDefault()
      }}
      onClick={(event) => {
        onClick?.(event)
        if (
          event.defaultPrevented ||
          disabled ||
          !view ||
          view.isDestroyed ||
          !view.editable ||
          !state
        )
          return
        if (execute(view.state, view.dispatch, view) && focusEditor && !view.isDestroyed) {
          view.focus()
        }
      }}
    />
  )
}
