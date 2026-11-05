"use client"
import { canInsertImage, canSetLink, getLink, getSelectedImage } from "../engine/index.js"
import type { CommandButtonProps } from "./CommandButtons.js"
import { ToolBarButton } from "./ToolBarButton.js"
export type MediaButtonProps = Omit<CommandButtonProps, "onClick"> & {
  onClick: NonNullable<CommandButtonProps["onClick"]>
}
export function LinkButton({ children, ...props }: MediaButtonProps) {
  return (
    <ToolBarButton
      aria-label="링크 편집"
      title="링크 추가·수정"
      command={canSetLink}
      isActive={(state) => Boolean(getLink(state))}
      focusEditor={false}
      {...props}
    >
      {children === undefined ? "링크" : children}
    </ToolBarButton>
  )
}
export function ImageButton({ children, ...props }: MediaButtonProps) {
  return (
    <ToolBarButton
      aria-label="이미지 편집"
      title="이미지 삽입·수정·업로드"
      command={canInsertImage}
      isActive={(state) => Boolean(getSelectedImage(state))}
      focusEditor={false}
      {...props}
    >
      {children === undefined ? "이미지" : children}
    </ToolBarButton>
  )
}
