"use client"
import type { ComponentProps } from "react"
import { cn } from "../lib/cn.js"
import { useToolBarContext } from "./toolbar-context.js"
export type TableOfContentsButtonProps = Omit<ComponentProps<"button">, "type">
export function TableOfContentsButton({
  children = "목차",
  className,
  ...props
}: TableOfContentsButtonProps) {
  const { buttonClassName } = useToolBarContext()
  return (
    <button
      aria-label="목차"
      title="목차"
      {...props}
      type="button"
      className={cn("vlab-editor-toolbar__button", buttonClassName, className)}
    >
      {children}
    </button>
  )
}
