"use client"
import { type ComponentProps, useEffect, useImperativeHandle, useRef } from "react"
import { cn } from "../lib/cn.js"
import { useEditorContext } from "./editor-context.js"
export type EditorContentProps = Omit<
  ComponentProps<"div">,
  "children" | "dangerouslySetInnerHTML"
> & {
  children?: never
  dangerouslySetInnerHTML?: never
}
export function EditorContent({ className, ref, ...props }: EditorContentProps) {
  const editor = useEditorContext()
  const elementRef = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => {
    const element = elementRef.current
    if (!element) throw new Error("vlab-editor: content container is not mounted.")
    return element
  }, [])
  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    const view = editor.mount(element)
    return () => editor.unmount(view)
  }, [editor])
  return <div {...props} ref={elementRef} className={cn("vlab-editor-content", className)} />
}
