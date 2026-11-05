"use client"
import type { ReactNode } from "react"
import type { HeadingLevel } from "../engine/index.js"
import type { ToolBarButtonProps } from "./ToolBarButton.js"
import { ToolBarButton } from "./ToolBarButton.js"
export type CommandButtonProps = Omit<ToolBarButtonProps, "command">
export type HeadingButtonProps = CommandButtonProps & {
  level: HeadingLevel
}
const defaults = {
  paragraph: { label: "본문", title: "본문 (Ctrl/Cmd+Alt+0)", content: "본문" },
  heading1: { label: "제목 1", title: "제목 1 (Ctrl/Cmd+Alt+1)", content: "H1" },
  heading2: { label: "제목 2", title: "제목 2 (Ctrl/Cmd+Alt+2)", content: "H2" },
  heading3: { label: "제목 3", title: "제목 3 (Ctrl/Cmd+Alt+3)", content: "H3" },
  heading4: { label: "제목 4", title: "제목 4 (Ctrl/Cmd+Alt+4)", content: "H4" },
  heading5: { label: "제목 5", title: "제목 5 (Ctrl/Cmd+Alt+5)", content: "H5" },
  heading6: { label: "제목 6", title: "제목 6 (Ctrl/Cmd+Alt+6)", content: "H6" },
  bold: { label: "굵게", title: "굵게 (Ctrl/Cmd+B)", content: <strong>B</strong> },
  italic: { label: "기울임", title: "기울임 (Ctrl/Cmd+I)", content: <em>I</em> },
  strike: { label: "취소선", title: "취소선 (Ctrl/Cmd+Shift+S)", content: <s>S</s> },
  taskList: { label: "체크리스트", title: "체크리스트 전환", content: "☑" },
  inlineCode: { label: "인라인 코드", title: "인라인 코드 (Ctrl/Cmd+`)", content: "<>" },
  codeBlock: { label: "코드 블록", title: "코드 블록 (Ctrl/Cmd+Alt+C)", content: "코드" },
  bulletList: { label: "글머리 목록", title: "글머리 목록 (Ctrl/Cmd+Alt+7)", content: "• 목록" },
  orderedList: { label: "번호 목록", title: "번호 목록 (Ctrl/Cmd+Alt+8)", content: "1. 목록" },
  blockquote: { label: "인용문", title: "인용문 (Ctrl/Cmd+Alt+9)", content: "인용" },
  horizontalRule: { label: "구분선", title: "구분선 삽입", content: "―" },
  indentList: { label: "목록 들여쓰기", title: "목록 들여쓰기 (Tab)", content: "→" },
  outdentList: { label: "목록 내어쓰기", title: "목록 내어쓰기 (Shift+Tab)", content: "←" },
  insertListParagraph: {
    label: "목록 항목 아래 문단 추가",
    title: "목록 항목 아래 문단 추가 (Ctrl/Cmd+Enter)",
    content: "↳ 본문",
  },
  removeLink: { label: "링크 해제", title: "선택한 링크 해제", content: "링크 해제" },
  insertTable: { label: "표 삽입", title: "표 삽입", content: "표" },
  addRowBefore: { label: "위에 행 추가", title: "위에 행 추가", content: "↑ 행" },
  addRowAfter: { label: "아래에 행 추가", title: "아래에 행 추가", content: "↓ 행" },
  deleteRow: { label: "행 삭제", title: "행 삭제", content: "− 행" },
  addColumnBefore: { label: "왼쪽에 열 추가", title: "왼쪽에 열 추가", content: "← 열" },
  addColumnAfter: { label: "오른쪽에 열 추가", title: "오른쪽에 열 추가", content: "→ 열" },
  deleteColumn: { label: "열 삭제", title: "열 삭제", content: "− 열" },
  deleteTable: { label: "표 삭제", title: "표 삭제", content: "표 삭제" },
  undo: { label: "실행 취소", title: "실행 취소 (Ctrl/Cmd+Z)", content: "↶" },
  redo: { label: "다시 실행", title: "다시 실행 (Ctrl/Cmd+Shift+Z)", content: "↷" },
} satisfies Record<
  string,
  {
    label: string
    title: string
    content: ReactNode
  }
>
function DefaultCommandButton({
  command,
  children,
  ...props
}: CommandButtonProps & {
  command: keyof typeof defaults
}) {
  const { label, title, content } = defaults[command]
  return (
    <ToolBarButton aria-label={label} title={title} {...props} command={command}>
      {children === undefined ? content : children}
    </ToolBarButton>
  )
}
export function ParagraphButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="paragraph" />
}
export function HeadingButton({ level, ...props }: HeadingButtonProps) {
  return <DefaultCommandButton {...props} command={`heading${level}`} />
}
export function BoldButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="bold" />
}
export function ItalicButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="italic" />
}
export function InlineCodeButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="inlineCode" />
}
export function CodeBlockButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="codeBlock" />
}
export function BulletListButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="bulletList" />
}
export function OrderedListButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="orderedList" />
}
export function BlockquoteButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="blockquote" />
}
export function HorizontalRuleButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="horizontalRule" />
}
export function IndentListButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="indentList" />
}
export function OutdentListButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="outdentList" />
}
export function InsertListParagraphButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="insertListParagraph" />
}
export function RemoveLinkButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="removeLink" />
}
export function UndoButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="undo" />
}
export function RedoButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="redo" />
}
export function StrikeButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="strike" />
}
export function TaskListButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="taskList" />
}
export function InsertTableButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="insertTable" />
}
export function AddRowBeforeButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="addRowBefore" />
}
export function AddRowAfterButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="addRowAfter" />
}
export function DeleteRowButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="deleteRow" />
}
export function AddColumnBeforeButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="addColumnBefore" />
}
export function AddColumnAfterButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="addColumnAfter" />
}
export function DeleteColumnButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="deleteColumn" />
}
export function DeleteTableButton(props: CommandButtonProps) {
  return <DefaultCommandButton {...props} command="deleteTable" />
}
