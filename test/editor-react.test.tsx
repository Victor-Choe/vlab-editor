import { act, cleanup, fireEvent, render, renderHook, within } from "@testing-library/react"
import { TextSelection } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { createRef, StrictMode } from "react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import {
  BoldButton,
  createEditor,
  Editor,
  EditorContent,
  EditorProvider,
  editorSchema,
  parseMarkdown,
  serializeMarkdown,
  ToolBar,
  useEditor,
  useEditorContext,
  useEditorState,
} from "../src/index.js"

function documentWith(text: string) {
  return editorSchema.nodeFromJSON({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  })
}
function InstanceConsumer({ onRender }: { onRender: () => void }) {
  const instance = useEditorContext()
  onRender()
  return (
    <button type="button" onClick={() => instance.execute("heading2")}>
      Heading
    </button>
  )
}
function TextConsumer({ onRender }: { onRender?: () => void }) {
  const text = useEditorState((state) => state.doc.textContent)
  onRender?.()
  return <output data-testid="text">{text}</output>
}
function ObjectConsumer({ onRender }: { onRender: () => void }) {
  const value = useEditorState(
    (state) => ({ text: state.doc.textContent }),
    (previous, next) => previous.text === next.text,
  )
  onRender()
  return <output data-testid="object">{value.text}</output>
}
function SubscriberApp({
  editor,
  parentRender,
  instanceRender,
  textRender,
  objectRender,
}: {
  editor: Editor
  parentRender: () => void
  instanceRender: () => void
  textRender: () => void
  objectRender: () => void
}) {
  parentRender()
  return (
    <EditorProvider editor={editor}>
      <InstanceConsumer onRender={instanceRender} />
      <TextConsumer onRender={textRender} />
      <ObjectConsumer onRender={objectRender} />
    </EditorProvider>
  )
}
function SelectionConsumer() {
  const state = useEditorState()
  return (
    <output>
      {state.doc.textContent}:{state.selection.from}
    </output>
  )
}
function ContentApp({ editor, visible }: { editor: Editor; visible: boolean }) {
  return (
    <EditorProvider editor={editor}>
      <ToolBar />
      {visible && <EditorContent />}
    </EditorProvider>
  )
}
function ServerApp() {
  const editor = useEditor({ doc: documentWith("hello") })
  return (
    <EditorProvider editor={editor}>
      <ToolBar />
      <EditorContent />
      <TextConsumer />
    </EditorProvider>
  )
}
beforeAll(() => {
  if (typeof Range.prototype.getClientRects !== "function") {
    Object.defineProperty(Range.prototype, "getClientRects", { value: () => [] })
    Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: () => new DOMRect() })
  }
})
afterEach(cleanup)
describe("useEditor and state subscriptions", () => {
  it("keeps one DOM-free instance across rerenders and updates callbacks without resetting content", () => {
    const initial = documentWith("hello")
    const first = vi.fn()
    const next = vi.fn()
    const { result, rerender } = renderHook(({ doc, onChange }) => useEditor({ doc, onChange }), {
      initialProps: { doc: initial, onChange: first },
    })
    const editor = result.current
    expect(editor.view).toBeNull()
    editor.dispatch(editor.state.tr.insertText("!", 6))
    expect(first).toHaveBeenCalledOnce()
    rerender({ doc: documentWith("replacement"), onChange: next })
    expect(result.current).toBe(editor)
    expect(editor.state.doc.textContent).toBe("hello!")
    editor.dispatch(editor.state.tr.insertText("?", 7))
    expect(first).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledOnce()
    expect(editor.state.doc.textContent).toBe("hello!?")
  })
  it("separates document, selection and stored-mark updates", () => {
    const onChange = vi.fn()
    const onSelectionChange = vi.fn()
    const onUpdate = vi.fn()
    const editor = new Editor({ doc: documentWith("hello"), onChange, onSelectionChange, onUpdate })
    editor.execute("bold")
    expect(onUpdate).toHaveBeenCalledOnce()
    expect(onChange).not.toHaveBeenCalled()
    expect(onSelectionChange).not.toHaveBeenCalled()
    editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 6)))
    expect(onSelectionChange).toHaveBeenCalledOnce()
    expect(onChange).not.toHaveBeenCalled()
    editor.execute("bold")
    expect(onChange).toHaveBeenCalledOnce()
    expect(onSelectionChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenLastCalledWith(editor.state)
    editor.execute("undo")
    expect(onChange).toHaveBeenCalledTimes(2)
    editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 6)))
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onUpdate).toHaveBeenCalledTimes(5)
  })
  it("provides stable snapshots and unsubscribe functions", () => {
    const editor = new Editor({ doc: documentWith("hello") })
    const initial = editor.getSnapshot()
    const listener = vi.fn()
    const unsubscribe = editor.subscribe(listener)
    expect(editor.getSnapshot()).toBe(initial)
    editor.dispatch(editor.state.tr.insertText("!", 6))
    expect(editor.getSnapshot()).not.toBe(initial)
    expect(editor.getSnapshot()).toBe(editor.getSnapshot())
    expect(editor.getServerSnapshot()).toBe(initial)
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
    editor.dispatch(editor.state.tr.insertText("?", 7))
    expect(listener).toHaveBeenCalledOnce()
  })
  it("rerenders subscribers only when their selected value changes", () => {
    const editor = new Editor({ doc: documentWith("hello") })
    const parentRender = vi.fn()
    const instanceRender = vi.fn()
    const textRender = vi.fn()
    const objectRender = vi.fn()
    const result = render(
      <SubscriberApp
        editor={editor}
        parentRender={parentRender}
        instanceRender={instanceRender}
        textRender={textRender}
        objectRender={objectRender}
      />,
    )
    act(() =>
      editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2))),
    )
    expect(textRender).toHaveBeenCalledOnce()
    expect(objectRender).toHaveBeenCalledOnce()
    act(() => editor.dispatch(editor.state.tr.insertText("!", 6)))
    expect(result.getByTestId("text").textContent).toBe("hello!")
    expect(result.getByTestId("object").textContent).toBe("hello!")
    expect(textRender).toHaveBeenCalledTimes(2)
    expect(objectRender).toHaveBeenCalledTimes(2)
    expect(parentRender).toHaveBeenCalledOnce()
    expect(instanceRender).toHaveBeenCalledOnce()
    fireEvent.click(result.getByRole("button", { name: "Heading" }))
    expect(editor.state.doc.firstChild?.attrs.level).toBe(2)
    expect(textRender).toHaveBeenCalledTimes(2)
  })
  it("supports full-state subscriptions and switching the provider instance", () => {
    const first = new Editor({ doc: documentWith("first") })
    const second = new Editor({ doc: documentWith("second") })
    const result = render(
      <EditorProvider editor={first}>
        <SelectionConsumer />
      </EditorProvider>,
    )
    act(() => first.dispatch(first.state.tr.setSelection(TextSelection.create(first.state.doc, 3))))
    expect(result.getByRole("status").textContent).toBe("first:3")
    result.rerender(
      <EditorProvider editor={second}>
        <SelectionConsumer />
      </EditorProvider>,
    )
    expect(result.getByRole("status").textContent).toBe("second:1")
    act(() => first.dispatch(first.state.tr.insertText("!", 6)))
    expect(result.getByRole("status").textContent).toBe("second:1")
  })
})
describe("EditorProvider and EditorContent", () => {
  it("replaces Markdown in the mounted view and updates subscribed controls", () => {
    const { result: hook } = renderHook(() => useEditor({ markdown: "이전 문서" }))
    const editor = hook.current
    const result = render(
      <EditorProvider editor={editor}>
        <ToolBar />
        <EditorContent />
        <TextConsumer />
      </EditorProvider>,
    )
    const view = editor.view
    act(() => editor.dispatch(editor.state.tr.insertText("!")))
    act(() => editor.setMarkdown("## 새 문서\n\n**내용**"))
    expect(editor.view).toBe(view)
    expect(result.getByRole("textbox").querySelector("h2")?.textContent).toBe("새 문서")
    expect(result.getByRole("textbox").querySelector("strong")?.textContent).toBe("내용")
    expect(result.getByTestId("text").textContent).toBe("새 문서내용")
    expect(result.getByRole("button", { name: "제목 2" }).getAttribute("aria-pressed")).toBe("true")
    expect(result.getByRole("button", { name: "실행 취소" }).hasAttribute("disabled")).toBe(true)
    const state = editor.state
    expect(() => editor.setMarkdown("<div>미지원 HTML</div>")).toThrow()
    expect(editor.state).toBe(state)
    expect(result.getByRole("textbox").querySelector("strong")?.textContent).toBe("내용")
  })
  it("accepts initial Markdown in the imperative API and fails before mounting invalid input", () => {
    const host = document.createElement("div")
    const view = createEditor(host, { markdown: "# 제목\n\n*내용*" })
    try {
      expect(view.state.doc.eq(parseMarkdown("# 제목\n\n*내용*"))).toBe(true)
      expect(serializeMarkdown(view.state.doc)).toBe("# 제목\n\n*내용*")
    } finally {
      view.destroy()
    }
    expect(() => createEditor(host, { markdown: "<div>미지원 HTML</div>" })).toThrow()
    expect(host.children).toHaveLength(0)
  })
  it("connects the toolbar, native content props and ref without manual state forwarding", () => {
    const { result: hook } = renderHook(() => useEditor({ doc: documentWith("hello") }))
    const editor = hook.current
    const ref = createRef<HTMLDivElement>()
    const result = render(
      <EditorProvider editor={editor}>
        <ToolBar />
        <EditorContent
          ref={ref}
          data-testid="content"
          className="my-document"
          style={{ color: "red" }}
        />
      </EditorProvider>,
    )
    expect(ref.current).toBe(result.getByTestId("content"))
    expect(ref.current?.className).toBe("vlab-editor-content my-document")
    expect(ref.current?.style.color).toBe("red")
    expect(result.getByRole("textbox").textContent).toBe("hello")
    act(() =>
      editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 6))),
    )
    const bold = result.getByRole("button", { name: "굵게" })
    fireEvent.click(bold)
    expect(bold.getAttribute("aria-pressed")).toBe("true")
    expect(result.getByRole("textbox").querySelector("strong")?.textContent).toBe("hello")
    expect(result.getByRole("button", { name: "실행 취소" }).hasAttribute("disabled")).toBe(false)
    fireEvent.click(result.getByRole("button", { name: "실행 취소" }))
    expect(bold.getAttribute("aria-pressed")).toBe("false")
  })
  it("destroys views on unmount, disables controls and restores content, selection and history", () => {
    const editor = new Editor({ doc: documentWith("hello") })
    const result = render(<ContentApp editor={editor} visible />)
    const firstView = editor.view
    act(() =>
      editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 6))),
    )
    fireEvent.click(result.getByRole("button", { name: "굵게" }))
    const state = editor.state
    result.rerender(<ContentApp editor={editor} visible={false} />)
    expect(firstView?.isDestroyed).toBe(true)
    expect(editor.view).toBeNull()
    expect(editor.state).toBe(state)
    expect(result.getAllByRole("button").every((button) => button.hasAttribute("disabled"))).toBe(
      true,
    )
    result.rerender(<ContentApp editor={editor} visible />)
    expect(editor.view).not.toBe(firstView)
    expect(editor.state).toBe(state)
    expect(result.getByRole("textbox").querySelector("strong")?.textContent).toBe("hello")
    fireEvent.click(result.getByRole("button", { name: "실행 취소" }))
    expect(editor.state.doc.rangeHasMark(1, 6, editorSchema.marks.strong)).toBe(false)
    const secondView = editor.view
    result.unmount()
    expect(secondView?.isDestroyed).toBe(true)
    expect(editor.view).toBeNull()
  })
  it("survives StrictMode setup/cleanup with exactly one active view", () => {
    const destroy = vi.spyOn(EditorView.prototype, "destroy")
    const { result: hook } = renderHook(() => useEditor({ doc: documentWith("hello") }), {
      wrapper: StrictMode,
    })
    const editor = hook.current
    const result = render(
      <StrictMode>
        <EditorProvider editor={editor}>
          <ToolBar />
          <EditorContent />
        </EditorProvider>
      </StrictMode>,
    )
    expect(destroy).toHaveBeenCalledOnce()
    expect(result.getAllByRole("textbox")).toHaveLength(1)
    expect(editor.view?.isDestroyed).toBe(false)
    result.unmount()
    expect(destroy).toHaveBeenCalledTimes(2)
    expect(editor.view).toBeNull()
  })
  it("releases the old view when an existing content container receives another editor", () => {
    const first = new Editor({ doc: documentWith("first") })
    const second = new Editor({ doc: documentWith("second") })
    const result = render(
      <EditorProvider editor={first}>
        <EditorContent />
      </EditorProvider>,
    )
    const oldView = first.view
    result.rerender(
      <EditorProvider editor={second}>
        <EditorContent />
      </EditorProvider>,
    )
    expect(oldView?.isDestroyed).toBe(true)
    expect(first.view).toBeNull()
    expect(second.view?.isDestroyed).toBe(false)
    expect(result.getAllByRole("textbox")).toHaveLength(1)
    expect(result.getByRole("textbox").textContent).toBe("second")
  })
  it("isolates nested editor providers and their toolbar commands", () => {
    const first = new Editor({ doc: documentWith("first") })
    const second = new Editor({ doc: documentWith("second") })
    const result = render(
      <EditorProvider editor={first}>
        <section data-testid="first">
          <ToolBar>
            <BoldButton />
          </ToolBar>
          <EditorContent />
        </section>
        <EditorProvider editor={second}>
          <section data-testid="second">
            <ToolBar>
              <BoldButton />
            </ToolBar>
            <EditorContent />
          </section>
        </EditorProvider>
      </EditorProvider>,
    )
    act(() =>
      first.dispatch(first.state.tr.setSelection(TextSelection.create(first.state.doc, 1, 6))),
    )
    fireEvent.click(within(result.getByTestId("first")).getByRole("button"))
    expect(first.state.doc.rangeHasMark(1, 6, editorSchema.marks.strong)).toBe(true)
    expect(second.state.doc.rangeHasMark(1, 6, editorSchema.marks.strong)).toBe(false)
    expect(
      within(result.getByTestId("second")).getByRole("button").getAttribute("aria-pressed"),
    ).toBe("false")
  })
  it("rejects duplicate mounts without damaging the original view", () => {
    const editor = new Editor()
    const first = document.createElement("div")
    const second = document.createElement("div")
    const view = editor.mount(first)
    try {
      expect(() => editor.mount(second)).toThrow("only be mounted in one")
      expect(editor.view).toBe(view)
      expect(view.isDestroyed).toBe(false)
    } finally {
      editor.unmount(view)
    }
  })
  it("reports missing providers clearly", () => {
    expect(() => render(<EditorContent />)).toThrow("inside <EditorProvider>")
    expect(() => render(<ToolBar />)).toThrow("requires <EditorProvider>")
    expect(() => renderHook(useEditorContext)).toThrow("inside <EditorProvider>")
    expect(() => renderHook(useEditorState)).toThrow("inside <EditorProvider>")
  })
  it("keeps explicitly supplied toolbar state independent of an enclosing provider", () => {
    const editor = new Editor({ doc: documentWith("context") })
    const host = document.createElement("div")
    const view = createEditor(host, { doc: documentWith("explicit") })
    try {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 9)))
      const result = render(
        <EditorProvider editor={editor}>
          <ToolBar view={view} state={view.state}>
            <BoldButton />
          </ToolBar>
        </EditorProvider>,
      )
      fireEvent.click(result.getByRole("button"))
      expect(view.state.doc.rangeHasMark(1, 9, editorSchema.marks.strong)).toBe(true)
      expect(editor.state.doc.textContent).toBe("context")
      expect(editor.state.doc.rangeHasMark(1, 8, editorSchema.marks.strong)).toBe(false)
    } finally {
      view.destroy()
    }
  })
})
describe("server rendering", () => {
  it("renders without mounting a view and hydrates the same document without mismatches", async () => {
    const mount = vi.spyOn(Editor.prototype, "mount")
    const html = renderToString(<ServerApp />)
    expect(mount).not.toHaveBeenCalled()
    expect(html).toContain("hello")
    expect(html).not.toContain("contenteditable")
    const host = document.createElement("div")
    host.innerHTML = html
    document.body.append(host)
    const onRecoverableError = vi.fn()
    let root: ReturnType<typeof hydrateRoot> | undefined
    try {
      await act(async () => {
        root = hydrateRoot(host, <ServerApp />, { onRecoverableError })
      })
      expect(within(host).getByRole("textbox").textContent).toBe("hello")
      expect(within(host).getByRole("button", { name: "굵게" }).hasAttribute("disabled")).toBe(
        false,
      )
      expect(onRecoverableError).not.toHaveBeenCalled()
    } finally {
      act(() => root?.unmount())
      host.remove()
    }
  })
})
