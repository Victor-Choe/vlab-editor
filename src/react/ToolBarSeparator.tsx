"use client"
import type { ComponentProps } from "react"
import { cn } from "../lib/cn.js"
import { useToolBarContext } from "./toolbar-context.js"
export type ToolBarSeparatorProps = ComponentProps<"span">
export function ToolBarSeparator({ className, ...props }: ToolBarSeparatorProps) {
  const { dividerClassName } = useToolBarContext()
  return (
    <span
      aria-hidden="true"
      {...props}
      className={cn("vlab-editor-toolbar__divider", dividerClassName, className)}
    />
  )
}
