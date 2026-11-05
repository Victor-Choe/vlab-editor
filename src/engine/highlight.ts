import type { Node } from "prosemirror-model"
import { Plugin } from "prosemirror-state"
import { Decoration, DecorationSet } from "prosemirror-view"
import type { EditorExtension } from "./extensions.js"
export interface HighlightTree {
  type: string
  value?: string
  properties?: {
    className?: unknown
  }
  children?: readonly HighlightTree[]
}
export interface CodeHighlighter {
  registered(language: string): boolean
  highlight(language: string, code: string): HighlightTree
}
export interface CodeHighlightOptions {
  highlighter: CodeHighlighter
  defaultLanguage?: string
  maxCodeLength?: number
}
export function codeHighlighting({
  highlighter,
  defaultLanguage,
  maxCodeLength = 50000,
}: CodeHighlightOptions): EditorExtension {
  return {
    name: "code-highlighting",
    plugins: () => {
      const cache = new WeakMap<
        Node,
        {
          from: number
          to: number
          classes: string
        }[]
      >()
      const decorate = (doc: Node) => {
        const decorations: Decoration[] = []
        doc.descendants((node, pos) => {
          if (node.type.name !== "code_block") return
          let tokens = cache.get(node)
          if (!tokens) {
            tokens = []
            const language = node.attrs.params.trim().split(/\s+/)[0] || defaultLanguage
            if (
              language &&
              node.textContent.length <= maxCodeLength &&
              highlighter.registered(language)
            ) {
              let offset = 0
              const visit = (tree: HighlightTree, parents: string[]) => {
                if (tree.type === "text") {
                  const from = offset
                  offset += tree.value?.length ?? 0
                  if (parents.length && offset > from)
                    tokens?.push({ from, to: offset, classes: [...new Set(parents)].join(" ") })
                  return
                }
                const value = tree.properties?.className
                const classes = Array.isArray(value)
                  ? value.filter(
                      (item): item is string => typeof item === "string" && /^[\w-]+$/.test(item),
                    )
                  : []
                for (const child of tree.children ?? []) visit(child, [...parents, ...classes])
              }
              try {
                visit(highlighter.highlight(language, node.textContent), [])
              } catch {
                tokens = []
              }
              if (offset !== node.textContent.length) tokens = []
            }
            cache.set(node, tokens)
          }
          for (const token of tokens)
            decorations.push(
              Decoration.inline(pos + 1 + token.from, pos + 1 + token.to, { class: token.classes }),
            )
          return false
        })
        return DecorationSet.create(doc, decorations)
      }
      return [
        new Plugin<DecorationSet>({
          state: {
            init: (_config, state) => decorate(state.doc),
            apply: (tr, decorations) => (tr.docChanged ? decorate(tr.doc) : decorations),
          },
          props: {
            decorations(state) {
              return this.getState(state)
            },
          },
        }),
      ]
    },
  }
}
