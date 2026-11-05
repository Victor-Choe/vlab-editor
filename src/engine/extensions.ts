import type MarkdownIt from "markdown-it"
import type { MarkdownSerializer, ParseSpec } from "prosemirror-markdown"
import { type MarkSpec, type NodeSpec, Schema } from "prosemirror-model"
import type { Command, Plugin } from "prosemirror-state"
import type { NodeViewConstructor } from "prosemirror-view"
import { editorSchema } from "./schema.js"
export interface EditorExtension {
  name: string
  nodes?: Record<string, NodeSpec>
  marks?: Record<string, MarkSpec>
  plugins?: (context: { schema: Schema }) => readonly Plugin[]
  keymap?: (context: { schema: Schema }) => Record<string, Command>
  nodeViews?: Record<string, NodeViewConstructor>
  markdown?: {
    configure?: (tokenizer: MarkdownIt) => void
    tokens?: Record<string, ParseSpec>
    nodes?: MarkdownSerializer["nodes"]
    marks?: MarkdownSerializer["marks"]
  }
}
export function createEditorSchema(extensions: readonly EditorExtension[] = []): Schema {
  const names = new Set<string>()
  let nodes = editorSchema.spec.nodes
  let marks = editorSchema.spec.marks
  for (const extension of extensions) {
    if (!extension.name || names.has(extension.name))
      throw new RangeError(`vlab-editor: duplicate or empty extension name: ${extension.name}`)
    names.add(extension.name)
    for (const name of Object.keys(extension.nodes ?? {})) {
      if (nodes.get(name)) throw new RangeError(`vlab-editor: duplicate node: ${name}`)
    }
    for (const name of Object.keys(extension.marks ?? {})) {
      if (marks.get(name)) throw new RangeError(`vlab-editor: duplicate mark: ${name}`)
    }
    nodes = nodes.append(extension.nodes ?? {})
    marks = marks.append(extension.marks ?? {})
  }
  return extensions.some((extension) => extension.nodes || extension.marks)
    ? new Schema({ nodes, marks })
    : editorSchema
}
