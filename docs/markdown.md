# Markdown

vLab Editor connects `prosemirror-markdown` and `markdown-it` to its document schema. Markdown is a normalized interchange format, not a lossless source-text representation.

## Supported content

| Content | Notes |
| --- | --- |
| Paragraphs and H1–H6 | ATX and Setext headings are accepted |
| Bullet and ordered lists | Nested items and ordered-list start numbers |
| Task lists | Checkbox state is stored on list items |
| Blockquotes and horizontal rules | Standard Markdown forms |
| Bold, italic, strike, inline code | Nested emphasis and supported combinations |
| Code blocks | Fenced/indented blocks and fence language/info strings |
| Links and images | URL, title, and image description |
| GFM tables | Header row, cells, and column alignment |
| Hard and soft line breaks | Markdown hard breaks and attribute-free `<br>` tags |

Reference links become inline links. Unused reference definitions are removed. Image descriptions are plain text. List markers, emphasis delimiters, and source spacing may be rewritten. Blank paragraphs and the number of blank lines are not preserved.

Arbitrary HTML, styling, and unsupported Markdown dialect features are outside the built-in format. Merged table cells, column widths, and multiline/multi-paragraph cells cannot be preserved in GFM export.

## Conversion errors

Recognized unsupported syntax raises `MarkdownConversionError`. Its `phase` is `parse` or `serialize`; `issues` include a feature name, message, and a one-based block starting line when available. Incomplete syntax and unrecognized dialect extensions can still be interpreted as ordinary text.

```ts
import { MarkdownConversionError, parseMarkdown } from "vlab-editor"

try {
  const doc = parseMarkdown("<div>Unsupported HTML</div>")
  console.log(doc.toJSON())
} catch (error) {
  if (error instanceof MarkdownConversionError) {
    console.error(error.phase, error.issues)
  } else {
    throw error
  }
}
```

Export normalizes a copy, reparses the result, and checks document equivalence. It rejects structures or formatting that cannot survive the supported Markdown representation. The live document, cursor, and internal/code whitespace are not modified by export.

## Replacing content

`setMarkdown(source)` converts and validates before applying a replacement. On success it moves the selection to the start, clears stored marks and undo/redo history, and cancels pending image uploads. Callbacks reflect the resulting document/selection changes. It does not recreate the view or force focus.

On conversion failure, existing content, selection, history, subscriptions, and pending uploads are retained. `replaceMarkdown(source)` instead applies replacement as one undoable change and preserves earlier history. It rejects replacement while an upload is pending and skips an identical document.

Use `parseMarkdown()` and `serializeMarkdown()` for the base schema. Extended schemas should use their editor's Markdown methods or a matching `createMarkdownCodec()`; see [extensions](./extensions.md).

## Input and paste

Markdown typing shortcuts and text-only Markdown paste are enabled by default. Set `markdownShortcuts: false` or `markdownPaste: false` to disable either behavior.

| Input | Result |
| --- | --- |
| `# ` through `###### ` | Heading |
| `- `, `+ `, `* ` | Bullet list |
| `1. ` or `3) ` | Ordered list with that start number |
| `> ` | Blockquote |
| `--- `, `*** `, `___ ` | Horizontal rule |
| Three backticks or tildes | Code block |
| `- [ ] ` or `- [x] ` | Task-list item |
| Paired emphasis, strike, or inline-code delimiters | Corresponding inline formatting |

Backspace immediately after an input-rule conversion restores its literal source. Inline code conversion requires matching delimiter runs. Link/image syntax is not automatically converted character by character.

Rich HTML paste follows ProseMirror's schema parsing. For a text-only Markdown paste that contains recognized unsupported features, the editor inserts literal text and calls `onMarkdownPasteError`. Explicit plain-text paste also retains literal text. Image paste/drop is handled separately when an uploader is configured.
