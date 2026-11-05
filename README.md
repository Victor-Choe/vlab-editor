# vLab Editor

A composable React block editor built on [ProseMirror](https://prosemirror.net/), with Markdown import/export and toolbars you can style yourself.

[Playground](https://victor-choe.github.io/vlab-editor/) · [한국어](./README.ko.md) · [API](./docs/api.md) · [Markdown](./docs/markdown.md) · [Extensions](./docs/extensions.md) · [Contributing](./CONTRIBUTING.md)

The first npm release is being prepared. Try the [live playground](https://victor-choe.github.io/vlab-editor/) or run it locally from this repository.

## Features

- React 19 components, TypeScript declarations, and an editor instance whose state survives view remounts.
- Headings, nested lists, task lists, tables, quotes, links, images, code blocks, and inline formatting.
- Markdown conversion, typing shortcuts, and Markdown paste handling.
- Composable toolbar buttons with application-owned icons, labels, and styles.
- Optional block dragging, block selection, link navigation, and code highlighting.
- Application-provided image uploads with cancellation and insertion-position tracking.
- ProseMirror extensions for schemas, plugins, keymaps, NodeViews, and Markdown rules.

Your application owns persistence, authentication, upload endpoints, and the surrounding UI. Tailwind CSS is used by the playground; the editor package does not require it.

## Try the playground

For development, use Node.js 24 and pnpm 11.3.0.

```sh
git clone https://github.com/Victor-Choe/vlab-editor.git
cd vlab-editor
pnpm install
pnpm dev
```

Open <http://localhost:3005>. The command builds the library, watches its source, and starts the playground.

## React usage

Once the first npm release is published, install the package alongside React 19 and React DOM 19:

```sh
npm install vlab-editor
```

```tsx
"use client"

import {
  BoldButton,
  EditorContent,
  EditorProvider,
  ItalicButton,
  ToolBar,
  UndoButton,
  useEditor,
} from "vlab-editor"
import "vlab-editor/styles.css"

export function Writer() {
  const editor = useEditor({ markdown: "# Hello, vLab Editor" })

  return (
    <EditorProvider editor={editor}>
      <ToolBar aria-label="Formatting">
        <BoldButton aria-label="Bold" title="Bold">B</BoldButton>
        <ItalicButton aria-label="Italic" title="Italic">I</ItalicButton>
        <UndoButton aria-label="Undo" title="Undo">Undo</UndoButton>
      </ToolBar>
      <EditorContent className="document" />
      <button type="button" onClick={() => console.log(editor.getMarkdown())}>
        Export Markdown
      </button>
    </EditorProvider>
  )
}
```

The stylesheet supplies toolbar defaults and editing behavior. Set document typography and spacing in your application:

```css
.document > .ProseMirror {
  min-height: 240px;
  padding: 24px;
  line-height: 1.7;
}
```

`EditorContent` mounts the browser view after React commits. For Next.js App Router, use a client component as shown above. Server rendering produces the editor container; the editable document appears after hydration. Only one content view can be mounted per editor instance at a time.

Built-in labels currently default to Korean. Override button labels, titles, and children through props, as in the example. See [React components](./docs/api.md#react-components) for the editor-container accessibility label.

## Content and Markdown

```ts
import { Editor, parseMarkdown, serializeMarkdown } from "vlab-editor"

const editor = new Editor({ markdown: "**Hello**" })
const markdown = editor.getMarkdown()
const json = editor.state.doc.toJSON()

editor.setMarkdown("## A new document")

const doc = parseMarkdown(markdown)
const normalizedMarkdown = serializeMarkdown(doc)
```

Markdown output is normalized, so it does not preserve source spelling or blank-line counts. Features that cannot be represented by the supported Markdown format can raise `MarkdownConversionError`. Document replacement resets selection and undo history; failed conversions leave the existing state intact. Read the [Markdown contract](./docs/markdown.md) before choosing a storage format.

## Documentation

| Guide | Contents |
| --- | --- |
| [API](./docs/api.md) | Editor lifecycle, React components, subscriptions, and commands |
| [Markdown](./docs/markdown.md) | Supported syntax, normalization, shortcuts, and errors |
| [Extensions](./docs/extensions.md) | Plugins, custom blocks, highlighting, and block dragging |
| [Links and images](./docs/media.md) | Editing commands, URL handling, and upload integration |
| [Architecture](./docs/architecture.md) | How state, views, React, and conversion fit together |
| [Playground](https://github.com/Victor-Choe/vlab-editor/blob/main/playground/README.md) | Running and changing the demo |
| [Contributing](./CONTRIBUTING.md) | Development workflow and pull requests |
| [Releasing](./docs/releasing.md) | Package inspection and manual release steps |

## Development

```sh
pnpm check
```

This runs linting, library and test type checks, the existing unit/integration suite, and a production build of the playground. Tests run in Node.js and jsdom, including React hydration and DOM interaction tests; they are not a cross-browser test suite.

## License

[MIT](./LICENSE). Created by [Victor Choe](https://github.com/Victor-Choe) at vLab.
