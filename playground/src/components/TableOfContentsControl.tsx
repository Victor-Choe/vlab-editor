import { useMemo, useRef, useState } from "react"
import {
  getTableOfContents,
  navigateToHeading,
  TableOfContentsButton,
  type TableOfContentsEntry,
  useEditorContext,
  useEditorState,
} from "vlab-editor"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./Dialog.js"

function TableOfContentsItems({
  entries,
  onNavigate,
  nested = false,
}: {
  entries: TableOfContentsEntry[]
  onNavigate: (position: number) => void
  nested?: boolean
}) {
  return (
    <ol
      className={
        nested
          ? "m-0 ml-3 list-none space-y-1 border-l border-slate-500/10 pl-2"
          : "m-0 list-none space-y-1 p-0"
      }
    >
      {entries.map((entry) => (
        <li key={entry.position}>
          <button
            type="button"
            aria-label={`${entry.number}. ${entry.title}`}
            title={entry.title}
            className="flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-emerald-600"
            onClick={() => onNavigate(entry.position)}
          >
            <span className="shrink-0 tabular-nums text-muted-foreground">{entry.number}.</span>
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{entry.title}</span>
          </button>
          {entry.children.length > 0 && (
            <TableOfContentsItems entries={entry.children} onNavigate={onNavigate} nested />
          )}
        </li>
      ))}
    </ol>
  )
}
export function TableOfContentsControl() {
  const editor = useEditorContext()
  const doc = useEditorState((state) => state.doc)
  const entries = useMemo(() => getTableOfContents(doc), [doc])
  const [open, setOpen] = useState(false)
  const navigation = useRef<number | null>(null)
  const content = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    pointerId: number
    x: number
    y: number
    rect: DOMRect
  } | null>(null)
  const [position, setPosition] = useState<{
    left: number
    top: number
  } | null>(null)
  const [size, setSize] = useState<{
    width: number
    height: number
  } | null>(null)
  function move(left: number, top: number, rect: DOMRect) {
    setPosition({
      left: Math.max(0, Math.min(left, window.innerWidth - rect.width)),
      top: Math.max(0, Math.min(top, window.innerHeight - rect.height)),
    })
  }
  function rememberSize() {
    const rect = content.current?.getBoundingClientRect()
    if (rect) setSize({ width: rect.width, height: rect.height })
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) rememberSize()
        setOpen(next)
        drag.current = null
        navigation.current = null
      }}
    >
      <DialogTrigger asChild>
        <TableOfContentsButton />
      </DialogTrigger>
      <DialogContent
        ref={content}
        aria-describedby={undefined}
        onOpenAutoFocus={() => {
          const rect = content.current?.getBoundingClientRect()
          if (rect) {
            move(rect.left, rect.top, rect)
            setSize({ width: rect.width, height: rect.height })
          }
        }}
        onCloseAutoFocus={(event) => {
          const target = navigation.current
          navigation.current = null
          if (target === null) return
          event.preventDefault()
          requestAnimationFrame(() => navigateToHeading(editor, target))
        }}
        overlayClassName="bg-black/8"
        showCloseButton={false}
        className="flex max-h-[min(70dvh,calc(100dvh-2rem))] min-h-48 w-[min(340px,calc(100vw-2rem))] min-w-[min(240px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] resize flex-col gap-0 overflow-hidden rounded-xl border-slate-500/15 p-0 text-slate-700 shadow-lg transition-none duration-0 data-[state=closed]:animate-none data-[state=open]:animate-none sm:rounded-xl dark:border-slate-400/15 dark:text-slate-200"
        style={{
          ...size,
          ...(position
            ? {
                ...position,
                transform: "none",
                translate: "none",
                maxWidth: `calc(100vw - ${position.left}px - 16px)`,
                maxHeight: `calc(100dvh - ${position.top}px - 16px)`,
              }
            : {}),
        }}
      >
        <DialogHeader className="shrink-0 flex-row items-center gap-1 space-y-0 border-b border-slate-500/8 p-2">
          <DialogTitle className="sr-only">목차</DialogTitle>
          <button
            type="button"
            aria-label="목차 창 이동"
            title="드래그하거나 방향키로 이동"
            className="flex min-w-0 flex-1 touch-none cursor-grab select-none items-center justify-between rounded-md border-0 bg-transparent p-2 text-left font-[inherit] text-sm font-semibold text-inherit active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-emerald-600"
            onPointerDown={(event) => {
              if (event.button !== 0 || !content.current) return
              drag.current = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                rect: content.current.getBoundingClientRect(),
              }
              event.currentTarget.setPointerCapture(event.pointerId)
              event.preventDefault()
            }}
            onPointerMove={(event) => {
              const start = drag.current
              if (!start || start.pointerId !== event.pointerId) return
              move(
                start.rect.left + event.clientX - start.x,
                start.rect.top + event.clientY - start.y,
                start.rect,
              )
            }}
            onPointerUp={() => {
              drag.current = null
            }}
            onPointerCancel={() => {
              drag.current = null
            }}
            onLostPointerCapture={() => {
              drag.current = null
            }}
            onKeyDown={(event) => {
              const offsets: Record<string, [number, number]> = {
                ArrowLeft: [-10, 0],
                ArrowRight: [10, 0],
                ArrowUp: [0, -10],
                ArrowDown: [0, 10],
              }
              const offset = offsets[event.key]
              if (!offset || !content.current) return
              event.preventDefault()
              const rect = content.current.getBoundingClientRect()
              move(rect.left + offset[0], rect.top + offset[1], rect)
            }}
          >
            <span>목차</span>
            <span aria-hidden="true">⠿</span>
          </button>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {entries.length > 0 ? (
            <nav aria-label="목차 목록">
              <TableOfContentsItems
                entries={entries}
                onNavigate={(target) => {
                  rememberSize()
                  navigation.current = target
                  setOpen(false)
                }}
              />
            </nav>
          ) : (
            <p className="m-0 min-h-32 px-2 py-3 text-sm text-muted-foreground">
              본문에 제목을 추가하면 목차가 표시됩니다.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
