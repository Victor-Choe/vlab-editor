# Links, images, and uploads

Links are marks on inline content; images are document nodes with `src`, `alt`, and `title`. The application provides forms and upload transport while the editor manages selections, transactions, and pending insertion positions.

## Editing commands

```ts
import { Editor, getLink, getSelectedImage, insertImage, setLink, updateImage } from "vlab-editor"

const editor = new Editor({ markdown: "A draft" })

editor.execute(setLink({ href: "/docs", text: "Documentation" }))
editor.execute("removeLink")
editor.execute(insertImage({ src: "/images/example.png", alt: "Example" }))
editor.execute(updateImage({ src: "/images/updated.png", alt: "Updated example" }))

const link = getLink(editor.state)
const image = getSelectedImage(editor.state)
```

`setLink()` applies to a selection or edits an existing link at the cursor. Omitting `text` preserves existing text/formatting; at an empty cursor, it inserts the URL as text. An explicit `text` replacement is limited to a single paragraph. `removeLink` removes the current link or link marks within a range.

`insertImage()` replaces the selection. `updateImage()` requires a node-selected image and preserves its link mark and selection. Commands follow ProseMirror's `(state, dispatch?, view?) => boolean` contract. Use `editor.canExecute(command)` to check availability without modifying state.

## Application-owned forms

`LinkButton` and `ImageButton` invoke a required `onClick` handler. Your application opens its form and runs a command after submission. If focus leaves the editor, save and restore a selection bookmark as needed; if the document changes while a form is open, validate its target before applying.

The [playground media controls](https://github.com/Victor-Choe/vlab-editor/blob/main/playground/src/components/MediaControls.tsx) demonstrate this flow with native dialogs.

`linkOpening()` opts into following links while editing. It opens a new tab by default and preserves Shift+click/text-selection gestures. Provide `open(href, event)` to integrate an application router or preview.

## URL handling

Links accept HTTP(S), `mailto:`, `tel:`, anchors, and relative URLs. Images accept HTTP(S) and relative URLs. Protocol-relative URLs are also supported. `normalizeLinkUrl` and `normalizeImageUrl` return normalized values or `null`.

`javascript:`, `file:`, `data:`, and `blob:` are not accepted as stored link/image URLs. An uploader should return a persistent URL. Schema DOM parsing applies these URL checks to HTML paste as well. Plain strings that the Markdown parser does not recognize as links can remain literal text.

## Upload integration

```tsx
"use client"

import { useEditor } from "vlab-editor"

export function useImageEditor(uploadUrl: string) {
  return useEditor({
    uploadImage: async (file, { signal }) => {
      const body = new FormData()
      body.append("file", file)
      const response = await fetch(uploadUrl, { method: "POST", body, signal })
      if (!response.ok) throw new Error("Image upload failed")
      const result: { url: string } = await response.json()
      return { src: result.url, alt: file.name }
    },
  })
}
```

Call `editor.uploadImage(file, { alt })` for a file selected by your UI, or `editor.uploadImages(files)` for a group. The application owns authentication, file-size/type restrictions, endpoint response validation, and error presentation.

With an uploader configured, clipboard images and image-file drops use it automatically. Disable these behaviors with `imagePaste: false` or `imageDrop: false`. Clipboard file items and image-only HTML data URLs are converted into uploads; only the returned persistent URL is stored.

Pending insertion positions map through document transactions. Existing text remains during upload, and temporary status widgets are excluded from Markdown. Grouped uploads maintain file order even if requests finish out of order. If the target is deleted, the insertion is cancelled instead of being moved to an unrelated location.

`getPendingImageUploads(editor.state)` returns pending IDs, file names, and positions. Use `cancelImageUpload(id)` or `cancelImageUploads()` to abort requests. `setMarkdown()` cancels uploads on a successful replacement; `replaceMarkdown()` rejects replacement while uploads are pending. Unmounting a view alone lets uploads continue. Unmounting the component that owns `useEditor()` cancels them.

`ImageUploadError.code` distinguishes `not-configured`, `invalid-file`, `invalid-result`, `invalid-target`, `target-removed`, `cancelled`, and `failed`. Handle direct upload promises in your application; automatic paste/drop failures are reported through `onImageUploadError`.
