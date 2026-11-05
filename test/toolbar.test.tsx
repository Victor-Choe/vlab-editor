import { cleanup, fireEvent, render, within } from "@testing-library/react"
import type { Command } from "prosemirror-state"
import { TextSelection } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import { createRef } from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import {
  BoldButton,
  createEditor,
  editorSchema,
  HeadingButton,
  ItalicButton,
  ToolBar,
  ToolBarButton,
  ToolBarSeparator,
  UndoButton,
} from "../src/index.js"

const editors: {
  view: EditorView
  host: HTMLElement
}[] = []
beforeAll(() => {
  if (typeof Range.prototype.getClientRects !== "function") {
    Object.defineProperty(Range.prototype, "getClientRects", { value: () => [] })
    Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: () => new DOMRect() })
  }
})
function createTestEditor(text = "hello") {
  const host = document.createElement("div")
  document.body.append(host)
  const doc = editorSchema.nodeFromJSON({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  })
  const view = createEditor(host, { doc })
  editors.push({ view, host })
  return view
}
function selectText(view: EditorView) {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)))
}
afterEach(() => {
  cleanup()
  for (const { view, host } of editors.splice(0)) {
    if (!view.isDestroyed) view.destroy()
    host.remove()
  }
})
describe("toolbar composition", () => {
  it("preserves the default seven controls when children are omitted", () => {
    const view = createTestEditor()
    const result = render(<ToolBar view={view} state={view.state} />)
    expect(
      result.getAllByRole("button").map((button) => button.getAttribute("aria-label")),
    ).toEqual(["본문", "제목 1", "제목 2", "굵게", "기울임", "실행 취소", "다시 실행"])
    expect(result.getByRole("button", { name: "실행 취소" }).hasAttribute("disabled")).toBe(true)
    expect(result.getByRole("button", { name: "다시 실행" }).hasAttribute("disabled")).toBe(true)
  })
  it("lets a consumer choose, reorder, group and relabel controls", () => {
    const view = createTestEditor()
    const result = render(
      <ToolBar view={view} state={view.state}>
        <ItalicButton aria-label="Emphasis">My italic icon</ItalicButton>
        <ToolBarSeparator data-testid="divider" />
        <div>
          <HeadingButton level={2}>Subtitle</HeadingButton>
          <BoldButton aria-label="Bold">My bold icon</BoldButton>
        </div>
      </ToolBar>,
    )
    expect(result.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "My italic icon",
      "Subtitle",
      "My bold icon",
    ])
    expect(result.queryByRole("button", { name: "본문" })).toBeNull()
    expect(result.getByTestId("divider").getAttribute("aria-hidden")).toBe("true")
    fireEvent.click(result.getByRole("button", { name: "제목 2" }))
    expect(view.state.doc.firstChild?.attrs.level).toBe(2)
  })
  it("supports an explicitly empty toolbar", () => {
    const result = render(
      <ToolBar view={null} state={null}>
        {null}
      </ToolBar>,
    )
    expect(result.getByRole("toolbar")).toBeTruthy()
    expect(result.queryAllByRole("button")).toHaveLength(0)
  })
  it("merges inherited styles with per-control props and forwards native refs", () => {
    const view = createTestEditor()
    const buttonRef = createRef<HTMLButtonElement>()
    const toolbarRef = createRef<HTMLDivElement>()
    const result = render(
      <ToolBar
        ref={toolbarRef}
        id="custom-toolbar"
        view={view}
        state={view.state}
        buttonClassName="rounded-sm bg-red-500"
        dividerClassName="bg-red-500"
      >
        <BoldButton ref={buttonRef} className="rounded-full bg-blue-500" title="Custom title" />
        <ToolBarSeparator data-testid="divider" className="bg-blue-500" />
      </ToolBar>,
    )
    const button = result.getByRole("button", { name: "굵게" })
    expect(buttonRef.current).toBe(button)
    expect(toolbarRef.current?.id).toBe("custom-toolbar")
    expect(button.className).toBe("vlab-editor-toolbar__button rounded-full bg-blue-500")
    expect(button.title).toBe("Custom title")
    expect(result.getByTestId("divider").className).toBe("vlab-editor-toolbar__divider bg-blue-500")
  })
})
describe("editor command integration", () => {
  it("preserves document selection, updates pressed state and supports undo", () => {
    const view = createTestEditor()
    selectText(view)
    const result = render(<ToolBar view={view} state={view.state} />)
    const bold = result.getByRole("button", { name: "굵게" })
    expect(fireEvent.pointerDown(bold)).toBe(false)
    fireEvent.click(bold)
    expect(view.state.selection.from).toBe(1)
    expect(view.state.selection.to).toBe(6)
    expect(view.state.doc.rangeHasMark(1, 6, editorSchema.marks.strong)).toBe(true)
    result.rerender(<ToolBar view={view} state={view.state} />)
    expect(bold.getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(result.getByRole("button", { name: "실행 취소" }))
    expect(view.state.doc.rangeHasMark(1, 6, editorSchema.marks.strong)).toBe(false)
    result.rerender(<ToolBar view={view} state={view.state} />)
    fireEvent.click(result.getByRole("button", { name: "다시 실행" }))
    expect(view.state.doc.rangeHasMark(1, 6, editorSchema.marks.strong)).toBe(true)
  })
  it("runs the consumer's pointer handler and allows clicks to cancel the command", () => {
    const view = createTestEditor()
    selectText(view)
    const pointer = vi.fn()
    const click = vi.fn()
    const result = render(
      <ToolBar view={view} state={view.state}>
        <BoldButton
          onPointerDown={pointer}
          onClick={(event) => {
            click()
            event.preventDefault()
          }}
        />
      </ToolBar>,
    )
    const bold = result.getByRole("button", { name: "굵게" })
    expect(fireEvent.pointerDown(bold)).toBe(false)
    fireEvent.click(bold)
    expect(pointer).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(view.state.doc.rangeHasMark(1, 6, editorSchema.marks.strong)).toBe(false)
  })
  it("keeps unavailable, caller-disabled, unmounted and destroyed controls disabled", () => {
    const view = createTestEditor()
    const result = render(
      <ToolBar view={view} state={view.state}>
        <BoldButton disabled />
        <UndoButton disabled={false} />
        <ToolBarButton command={() => false}>Unavailable</ToolBarButton>
      </ToolBar>,
    )
    expect(result.getAllByRole("button").every((button) => button.hasAttribute("disabled"))).toBe(
      true,
    )
    result.rerender(<ToolBar view={null} state={null} />)
    expect(result.getAllByRole("button").every((button) => button.hasAttribute("disabled"))).toBe(
      true,
    )
    view.destroy()
    result.rerender(<ToolBar view={view} state={view.state} />)
    expect(result.getAllByRole("button").every((button) => button.hasAttribute("disabled"))).toBe(
      true,
    )
  })
  it("checks custom commands without dispatch and passes the view to both phases", () => {
    const view = createTestEditor()
    const command = vi.fn<Command>((state, dispatch, commandView) => {
      if (commandView !== view) return false
      dispatch?.(state.tr.insertText("!", state.doc.content.size - 1))
      return true
    })
    const result = render(
      <ToolBar view={view} state={view.state}>
        <ToolBarButton command={command} isActive={(state) => state.doc.textContent.endsWith("!")}>
          Append
        </ToolBarButton>
      </ToolBar>,
    )
    expect(view.state.doc.textContent).toBe("hello")
    expect(command).toHaveBeenCalledWith(view.state, undefined, view)
    const button = result.getByRole("button", { name: "Append" })
    expect(button.getAttribute("aria-pressed")).toBe("false")
    fireEvent.click(button)
    expect(view.state.doc.textContent).toBe("hello!")
    result.rerender(
      <ToolBar view={view} state={view.state}>
        <ToolBarButton command={command} isActive={(state) => state.doc.textContent.endsWith("!")}>
          Append
        </ToolBarButton>
      </ToolBar>,
    )
    expect(button.getAttribute("aria-pressed")).toBe("true")
  })
  it("lets a custom command retain focus in its own UI", () => {
    const view = createTestEditor()
    const focus = vi.spyOn(view, "focus")
    const result = render(
      <ToolBar view={view} state={view.state}>
        <ToolBarButton command={() => true} focusEditor={false}>
          Custom dialog
        </ToolBarButton>
      </ToolBar>,
    )
    fireEvent.click(result.getByRole("button", { name: "Custom dialog" }))
    expect(focus).not.toHaveBeenCalled()
  })
  it("does not submit the consumer's enclosing form", () => {
    const view = createTestEditor()
    const submit = vi.fn()
    const result = render(
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <ToolBar view={view} state={view.state}>
          <BoldButton />
        </ToolBar>
      </form>,
    )
    fireEvent.click(result.getByRole("button", { name: "굵게" }))
    expect(submit).not.toHaveBeenCalled()
  })
  it("keeps commands and state separate for two editor instances", () => {
    const left = createTestEditor()
    const right = createTestEditor()
    selectText(left)
    selectText(right)
    const result = render(
      <>
        <ToolBar view={left} state={left.state} aria-label="Left editor">
          <BoldButton />
        </ToolBar>
        <ToolBar view={right} state={right.state} aria-label="Right editor">
          <BoldButton />
        </ToolBar>
      </>,
    )
    fireEvent.click(
      within(result.getByRole("toolbar", { name: "Left editor" })).getByRole("button"),
    )
    expect(left.state.doc.rangeHasMark(1, 6, editorSchema.marks.strong)).toBe(true)
    expect(right.state.doc.rangeHasMark(1, 6, editorSchema.marks.strong)).toBe(false)
  })
})
