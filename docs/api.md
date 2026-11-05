# API

The package provides `vlab-editor`, `vlab-editor/styles.css`, and the optional `vlab-editor/highlight` entry point. The root entry exports the engine and React components. There is no separate public engine subpath.

## React components

`useEditor(options)` creates one `Editor` instance without accessing the DOM. Initial `markdown`, `doc`, and extension configuration are read when the instance is created. Changing those options during a rerender does not replace the document. Call `setMarkdown()` for an explicit replacement. Callbacks and `editable` are refreshed after React commits.

`EditorProvider` shares the instance with descendants. `EditorContent` mounts and unmounts its ProseMirror view. Its `ref` points to the outer container, and ordinary `div` props are forwarded there. The inner `.ProseMirror` element is managed by the engine; do not provide `children` or `dangerouslySetInnerHTML`.

The inner editable element currently has a built-in Korean accessibility label. Passing `aria-label` to `EditorContent` labels the outer container. To change the inner label, set its view attributes after mounting:

```tsx
"use client"

import { useEffect, useSyncExternalStore } from "react"
import { EditorContent, EditorProvider, useEditor, useEditorContext } from "vlab-editor"

function LabeledContent() {
  const editor = useEditorContext()
  const { view } = useSyncExternalStore(
    editor.subscribe,
    editor.getSnapshot,
    editor.getServerSnapshot,
  )

  useEffect(() => {
    view?.setProps({
      attributes: {
        role: "textbox",
        "aria-label": "Document editor",
        "aria-multiline": "true",
      },
    })
  }, [view])

  return <EditorContent />
}

export function Writer() {
  const editor = useEditor()
  return <EditorProvider editor={editor}><LabeledContent /></EditorProvider>
}
```

`ToolBar` reads the provider's state and view. It supplies a default toolbar when no `children` are provided. Pass children to choose and order buttons yourself. `buttonClassName` and `dividerClassName` style all descendants; individual buttons also accept native button props and children. Built-in labels default to Korean and can be replaced with `aria-label`, `title`, and children.

`ToolBarButton` accepts a named `command` or a native ProseMirror command. `isActive` can be a boolean or a state selector. Set `focusEditor={false}` when a successful command should leave focus elsewhere.

`LinkButton` and `ImageButton` require your `onClick` handler to open an application-owned form. `TableOfContentsButton` is also a trigger; your application owns the table-of-contents UI.

## Subscriptions

```tsx
import { useEditorContext, useEditorState } from "vlab-editor"

export function WordCount() {
  const words = useEditorState((state) => {
    const text = state.doc.textContent.trim()
    return text ? text.split(/\s+/).length : 0
  })
  return <output>{words}</output>
}

export function ExportButton() {
  const editor = useEditorContext()
  return (
    <button type="button" onClick={() => console.log(editor.getMarkdown())}>
      Export
    </button>
  )
}
```

`useEditorState()` returns the current ProseMirror `EditorState`. `useEditorState(selector, isEqual?)` selects from that state and defaults to `Object.is` equality. Provide a comparator when a selector returns a new object. To subscribe to view changes as well, use `useSyncExternalStore` with the instance's snapshot methods, as in the accessibility-label example above.

Outside React, use `subscribe`, `getSnapshot`, and `getServerSnapshot`. The snapshot identity stays stable until a state/view update is published.

## Editor instance

```ts
import { Editor } from "vlab-editor"

const editor = new Editor({ markdown: "# Draft", editable: true })
const unsubscribe = editor.subscribe(() => console.log(editor.getSnapshot()))

editor.execute("bold")
editor.setEditable(false)
unsubscribe()
```

| Member | Behavior |
| --- | --- |
| `state` | Current ProseMirror `EditorState` |
| `view` | Mounted `EditorView`, or `null` |
| `isEditable` / `setEditable(value)` | Read or change editing availability |
| `execute(command, { focus? })` | Run a command and focus the editor by default |
| `canExecute(command)` | Check availability without dispatching |
| `dispatch(transaction)` | Apply a native ProseMirror transaction |
| `getMarkdown()` | Serialize with the configured schema and extensions |
| `setMarkdown(source)` | Replace content and reset selection/history after conversion succeeds |
| `replaceMarkdown(source)` | Replace content as one undoable change, preserving history; rejects pending uploads |
| `mount(element)` / `unmount(view)` | Attach or release a browser view |
| `uploadImage(file, attributes?)` | Upload and insert one image |
| `uploadImages(files, attributes?)` | Upload a group, maintaining source-file order |
| `cancelImageUpload(id)` | Cancel one pending upload |
| `cancelImageUploads()` | Cancel all pending uploads |

Supply either `markdown` or `doc`. A `doc` must use the editor's schema; with extensions, use `doc: (schema) => schema.nodeFromJSON(savedJson)`.

`EditorContent` owns view cleanup when using React. For manual integration, retain the view returned by `mount()` and pass it to `unmount()` when done. Remounting the same instance preserves document state and undo history. There can be only one mounted view per instance.

## Callbacks

| Option | Trigger |
| --- | --- |
| `onUpdate(state)` | Every applied state update, including selection and stored marks |
| `onChange(state)` | A document change, including formatting and undo/redo |
| `onSelectionChange(state)` | A changed selection |
| `onMarkdownPasteError(error)` | Unsupported text-only Markdown paste, inserted literally |
| `onImageUploadError(error)` | Failure during an automatically handled image paste/drop |

Keep storage/network work in your application. `onChange` can supply `state.doc.toJSON()` to your persistence layer. Markdown export can fail for unsupported document structures, so handle conversion errors when saving Markdown.

## Commands and buttons

Named commands include `paragraph`, `heading1`–`heading6`, `bold`, `italic`, `strike`, `inlineCode`, `codeBlock`, `bulletList`, `orderedList`, `taskList`, `indentList`, `outdentList`, `blockquote`, `horizontalRule`, `undo`, `redo`, and `removeLink`.

Public command factories include `insertTable`, `setTableAlignment`, `insertListParagraph`, `setCodeBlockLanguage`, `setLink`, `insertImage`, `updateImage`, `moveBlock`, and `moveBlocks`.

Use `isCommandActive(name, state)` for built-in toggle state. Action commands without a selected/unselected state return `undefined`.

React exports include formatting, heading, list, task-list, history, table, link, and image buttons. See the exact export list in [src/react/index.ts](https://github.com/Victor-Choe/vlab-editor/blob/main/src/react/index.ts).

## Table of contents

`getTableOfContents(state.doc)` returns H1–H6 entries with `title`, `level`, `position`, `number`, and `children`. Missing heading levels are not fabricated; entries attach to the nearest available parent heading.

`navigateToHeading(editor, position)` selects and scrolls to a valid heading, including in read-only mode. It returns `false` if there is no usable view or heading. Recompute positions whenever the document changes. The [playground control](https://github.com/Victor-Choe/vlab-editor/blob/main/playground/src/components/TableOfContentsControl.tsx) combines these functions with an application-owned dialog.

## Direct ProseMirror view

`createEditor(element, options)` returns a raw `EditorView` for an imperative integration. Call `view.destroy()` when finished. This view does not expose the `Editor` instance's Markdown or image-upload methods. Use the exported conversion helpers for a base-schema document, or use `Editor` when you need the instance lifecycle and upload API.

An existing view can drive `<ToolBar view={view} state={state} />`; pass the newest state after every update.
