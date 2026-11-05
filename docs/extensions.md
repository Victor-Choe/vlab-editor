# Extensions

`EditorExtension` connects native ProseMirror APIs and Markdown rules to an editor. Configuration is fixed when the instance is created.

## Code highlighting

The adapter is optional. The root package does not load language grammars or lowlight. Install those dependencies in your application:

```sh
npm install lowlight highlight.js
```

```tsx
"use client"

import { createLowlight } from "lowlight"
import typescript from "highlight.js/lib/languages/typescript"
import { EditorContent, EditorProvider, useEditor } from "vlab-editor"
import { codeHighlighting } from "vlab-editor/highlight"
import "vlab-editor/styles.css"

const highlighter = createLowlight({ typescript })
const extensions = [codeHighlighting({ highlighter })]

export function CodeWriter() {
  const editor = useEditor({
    markdown: "```typescript\nconst message = 'Hello'\n```",
    extensions,
  })
  return <EditorProvider editor={editor}><EditorContent /></EditorProvider>
}
```

Load a highlight.js theme in your application's CSS:

```css
@import "highlight.js/styles/github.css";
```

The adapter converts the highlighter's tree into inline Decorations. It saves source code and the code-block info string, never highlighted HTML. Themes that rely on nested DOM selectors may need adaptation because overlapping Decorations can combine classes on one element.

Unknown languages and highlighter failures leave code uncolored. Blocks without a language are not highlighted unless `defaultLanguage` is set. `maxCodeLength` defaults to 50,000 UTF-16 code units. Results are cached by block-node reference; selection-only updates do not re-highlight.

Use `editor.execute(setCodeBlockLanguage("typescript"))` for the selected block. A NodeView can pass its explicit position as the second argument. Setting a nonempty language preserves the remaining info string; an empty language clears that string.

## Native plugins and NodeViews

An extension can provide `nodes`, `marks`, `plugins`, `keymap`, `nodeViews`, and `markdown` rules. For a small complete example, this extension changes the rendering of an existing code block without changing its schema:

```ts
import type { EditorExtension } from "vlab-editor"

export const codeFrame: EditorExtension = {
  name: "code-frame",
  nodeViews: {
    code_block: () => {
      const dom = document.createElement("pre")
      const contentDOM = document.createElement("code")
      dom.className = "code-frame"
      dom.append(contentDOM)
      return { dom, contentDOM }
    },
  },
}
```

Supply it through `extensions: [codeFrame]`. Keep editable content under ProseMirror's control using `contentDOM`. If a NodeView creates a React root or listeners, release them in its `destroy()` method.

Extension names must be nonempty and unique. New node/mark names cannot replace built-in schema types. A NodeView can customize a built-in type, but multiple extensions cannot each own that type's view. Extension plugins and keymaps run before the built-in keymaps; table editing is installed last.

Plugin factories run during initial state creation and successful Markdown replacement. Replacing state resets plugin state/cache. Unmounting only the content view destroys NodeViews/plugin views while retaining document and plugin state.

## Custom document types

New node and mark types need matching parse/serialize rules if you intend to export Markdown. Use the native `NodeSpec`/`MarkSpec` shapes and the extension's `markdown.configure`, `tokens`, `nodes`, and `marks` fields.

The [extension integration tests](https://github.com/Victor-Choe/vlab-editor/blob/main/test/extensions.test.tsx) contain a complete `noteExtension()` with custom syntax, schema, NodeView, plugin, and keymap behavior.

When extensions add types, use Markdown or a schema-aware document factory:

```ts
import { Editor, type EditorExtension } from "vlab-editor"

export function restoreDocument(extensions: EditorExtension[], json: unknown) {
  return new Editor({
    extensions,
    doc: (schema) => schema.nodeFromJSON(json),
  })
}
```

For standalone conversion, pair `createEditorSchema(extensions)` with `createMarkdownCodec(schema, extensions)`. The base `parseMarkdown()` and `serializeMarkdown()` helpers cannot handle arbitrary extended schemas.

Extensions for another editor framework are not directly interchangeable. Native ProseMirror plugins, specs, and NodeViews can be connected through this interface.

## Block dragging and selection

```tsx
"use client"

import { blockDragAndDrop, EditorContent, EditorProvider, useEditor } from "vlab-editor"
import "vlab-editor/styles.css"

const extensions = [blockDragAndDrop({ handleClassName: "block-handle" })]

export function BlockWriter() {
  const editor = useEditor({ extensions, markdown: "# Draft\n\nMove this paragraph." })
  return <EditorProvider editor={editor}><EditorContent className="document" /></EditorProvider>
}
```

Provide enough left padding around the editable content for the handle. `createHandle` can return your own button, `indicatorClassName` styles the drop indicator, and `canDrag(node, position, state)` restricts movable content.

The extension supports selectable top-level blocks, list items, and nested content. Clicking a handle selects a block. Dragging or Alt+Up/Down reorders blocks; Delete/Backspace removes selected blocks with undo support. Shift+click and Shift+Up/Down extend a block selection. Escape switches between block selection and text editing. Arrow keys navigate selected blocks; Enter/Left/Right return to text editing. Copy/cut preserves selected block structure.

Dragging from editor padding selects a block range; dragging within text retains native text selection. Selected list items move together with their child content. The exported `BlockSelection`, `moveBlock`, and `moveBlocks` APIs also support programmatic integration.

Block selection is separate from document content and is not serialized into Markdown. Custom extension blocks must support selection and valid document placement to participate.

## Styling hooks

The package styles live in `@layer vlab-editor`. Override them with application CSS or define the layer order explicitly when using Tailwind. Available variables include:

- `--vlab-editor-text-selection-background`
- `--vlab-editor-block-selection-background`
- `--vlab-editor-block-selection-color`
- `--vlab-editor-block-selection-outset`
- `--vlab-editor-drag-background`
- `--vlab-editor-drag-color`
- `--vlab-editor-drag-hover-background`
- `--vlab-editor-drag-hover-color`
- `--vlab-editor-drop-color`

Block selection uses a faint fill by default. The selection outset defaults to `6px` and does not alter document layout.
