import bash from "highlight.js/lib/languages/bash"
import css from "highlight.js/lib/languages/css"
import javascript from "highlight.js/lib/languages/javascript"
import json from "highlight.js/lib/languages/json"
import python from "highlight.js/lib/languages/python"
import sql from "highlight.js/lib/languages/sql"
import typescript from "highlight.js/lib/languages/typescript"
import xml from "highlight.js/lib/languages/xml"
import { createLowlight } from "lowlight"
import { blockDragAndDrop, type EditorExtension, setCodeBlockLanguage } from "vlab-editor"
import { codeHighlighting } from "vlab-editor/highlight"
import "./extensions.css"

const highlighter = createLowlight({ bash, css, javascript, json, python, sql, typescript, xml })
const languages = [
  ["", "일반 텍스트"],
  ["ts", "TypeScript"],
  ["js", "JavaScript"],
  ["json", "JSON"],
  ["css", "CSS"],
  ["html", "HTML"],
  ["python", "Python"],
  ["sql", "SQL"],
  ["bash", "Bash"],
] as const
const codeBlockUI: EditorExtension = {
  name: "playground-code-block-ui",
  nodeViews: {
    code_block: (initial, view, getPos) => {
      let node = initial
      const dom = document.createElement("div")
      dom.className = "demo-code-block"
      const header = document.createElement("div")
      header.className = "demo-code-heading"
      header.contentEditable = "false"
      const caption = document.createElement("span")
      caption.textContent = "CODE"
      const select = document.createElement("select")
      select.setAttribute("aria-label", "코드 블록 언어")
      for (const [value, label] of languages) {
        const option = document.createElement("option")
        option.value = value
        option.textContent = label
        select.append(option)
      }
      const pre = document.createElement("pre")
      const contentDOM = document.createElement("code")
      pre.append(contentDOM)
      header.append(caption, select)
      dom.append(header, pre)
      const render = () => {
        const language = node.attrs.params.trim().split(/\s+/)[0] ?? ""
        if (!Array.from(select.options).some((option) => option.value === language)) {
          const option = document.createElement("option")
          option.value = language
          option.textContent = `${language} (하이라이트 미등록)`
          select.append(option)
        }
        select.value = language
        select.disabled = !view.editable
      }
      const change = () => {
        const pos = getPos()
        if (pos !== undefined && view.editable) {
          setCodeBlockLanguage(select.value, pos)(view.state, view.dispatch, view)
        }
      }
      select.addEventListener("change", change)
      render()
      return {
        dom,
        contentDOM,
        update(next) {
          if (next.type !== node.type) return false
          node = next
          render()
          return true
        },
        stopEvent: (event) => header.contains(event.target as globalThis.Node),
        ignoreMutation: (mutation) =>
          mutation.type !== "selection" && !contentDOM.contains(mutation.target),
        destroy: () => select.removeEventListener("change", change),
      }
    },
  },
}
export const editorExtensions = [blockDragAndDrop(), codeHighlighting({ highlighter }), codeBlockUI]
