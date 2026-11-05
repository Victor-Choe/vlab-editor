import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Editor, EditorContent, EditorProvider, linkOpening } from "../src/index.js"

afterEach(() => {
  cleanup()
  document.getSelection()?.removeAllRanges()
})
function setup(open?: (href: string, event: MouseEvent) => void) {
  const editor = new Editor({
    markdown: "[링크 **본문**](https://example.com/path)",
    extensions: [linkOpening(open ? { open } : {})],
  })
  const result = render(
    <EditorProvider editor={editor}>
      <EditorContent />
    </EditorProvider>,
  )
  result.container.addEventListener("click", (event) => event.preventDefault())
  const link = result.getByRole("link")
  return { editor, link }
}
describe("opt-in link opening", () => {
  it("opens a clicked link in a new tab without changing the document", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    const { editor, link } = setup()
    const before = editor.state.doc
    fireEvent.click(link.querySelector("strong") as HTMLElement)
    expect(open).toHaveBeenCalledWith("https://example.com/path", "_blank", "noopener,noreferrer")
    expect(editor.state.doc).toBe(before)
  })
  it("allows the consumer to replace navigation", () => {
    const open = vi.fn()
    const { link } = setup(open)
    fireEvent.click(link)
    expect(open).toHaveBeenCalledWith("https://example.com/path", expect.any(MouseEvent))
  })
  it("does not navigate while extending or dragging a text selection", () => {
    const open = vi.fn()
    const { link } = setup(open)
    const range = document.createRange()
    range.selectNodeContents(link)
    document.getSelection()?.addRange(range)
    fireEvent.click(link)
    document.getSelection()?.removeAllRanges()
    fireEvent.click(link, { shiftKey: true })
    expect(open).not.toHaveBeenCalled()
  })
  it("validates the actual destination before invoking a navigation callback", () => {
    const open = vi.fn()
    const { link } = setup(open)
    link.setAttribute("href", "javascript:alert(1)")
    fireEvent.click(link)
    expect(open).not.toHaveBeenCalled()
  })
})
