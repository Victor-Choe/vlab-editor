import { baseKeymap, chainCommands, exitCode, newlineInCode } from "prosemirror-commands"
import { closeHistory, history } from "prosemirror-history"
import { undoInputRule } from "prosemirror-inputrules"
import { keymap } from "prosemirror-keymap"
import type { Node } from "prosemirror-model"
import { EditorState, Selection, type Transaction } from "prosemirror-state"
import { goToNextCell, tableEditing } from "prosemirror-tables"
import { EditorView, type NodeViewConstructor } from "prosemirror-view"
import { clipboardImageFiles } from "./clipboard-images.js"
import { commands, type EditorCommand, insertHardBreak } from "./commands.js"
import { createEditorSchema, type EditorExtension } from "./extensions.js"
import {
  addImageUpload,
  completeImageUpload,
  getPendingImageUploads,
  ImageUploadError,
  type ImageUploadGroup,
  type ImageUploadOptions,
  imageUploadPlugin,
  removeImageUpload,
} from "./image-upload.js"
import {
  createMarkdownCodec,
  type MarkdownCodec,
  type MarkdownConversionError,
} from "./markdown.js"
import {
  type MarkdownBehaviorOptions,
  markdownInputRules,
  markdownPastePlugin,
} from "./markdown-input.js"
import { canInsertImage, type ImageAttributes, imageNode } from "./media.js"
import { exitTable, gfmTablePlugin } from "./tables.js"
import { splitEditorListItem, syncTaskItemEditability, taskItemView } from "./tasks.js"
export interface EditorCallbacks {
  onUpdate?: (state: EditorState) => void
  onChange?: (state: EditorState) => void
  onSelectionChange?: (state: EditorState) => void
  onMarkdownPasteError?: (error: MarkdownConversionError) => void
  onImageUploadError?: (error: ImageUploadError) => void
}
export type EditorOptions = EditorCallbacks &
  ImageUploadOptions &
  MarkdownBehaviorOptions & {
    extensions?: readonly EditorExtension[]
    editable?: boolean
  } & (
    | {
        doc?: Node | ((schema: EditorState["schema"]) => Node)
        markdown?: never
      }
    | {
        doc?: never
        markdown: string
      }
  )
export interface EditorSnapshot {
  readonly state: EditorState
  readonly view: EditorView | null
}
export interface ExecuteOptions {
  focus?: boolean
}
interface EditorConfiguration {
  schema: ReturnType<typeof createEditorSchema>
  codec: MarkdownCodec
  extensions: readonly EditorExtension[]
  nodeViews: Record<string, NodeViewConstructor>
}
function configure(extensions: readonly EditorExtension[] = []): EditorConfiguration {
  const schema = createEditorSchema(extensions)
  const nodeViews: Record<string, NodeViewConstructor> = { list_item: taskItemView }
  const owners = new Set<string>()
  for (const extension of extensions) {
    for (const [name, nodeView] of Object.entries(extension.nodeViews ?? {})) {
      if (!schema.nodes[name]) throw new RangeError(`vlab-editor: unknown NodeView type: ${name}`)
      if (owners.has(name)) throw new RangeError(`vlab-editor: duplicate NodeView: ${name}`)
      owners.add(name)
      nodeViews[name] = nodeView
    }
  }
  return {
    schema,
    codec: createMarkdownCodec(schema, extensions),
    extensions: [...extensions],
    nodeViews,
  }
}
function createState(
  options: EditorOptions,
  onPasteError = options.onMarkdownPasteError,
  configuration = configure(options.extensions),
): EditorState {
  if (options.doc !== undefined && options.markdown !== undefined) {
    throw new TypeError("vlab-editor: pass either doc or markdown, not both.")
  }
  const { schema, codec, extensions } = configuration
  const doc =
    options.markdown !== undefined
      ? codec.parse(options.markdown)
      : typeof options.doc === "function"
        ? options.doc(schema)
        : options.doc
  if (doc && doc.type.schema !== schema)
    throw new RangeError(
      "vlab-editor: doc must use this editor's schema. For extensions, pass markdown or a doc: (schema) => Node factory.",
    )
  doc?.check()
  return EditorState.create({
    schema,
    ...(doc ? { doc } : {}),
    plugins: [
      ...extensions.flatMap((extension) => extension.plugins?.({ schema }) ?? []),
      ...extensions.flatMap((extension) =>
        extension.keymap ? [keymap(extension.keymap({ schema }))] : [],
      ),
      history(),
      gfmTablePlugin(),
      imageUploadPlugin(),
      ...(options.markdownShortcuts !== false ? [markdownInputRules(schema, codec)] : []),
      ...(options.markdownPaste !== false ? [markdownPastePlugin(onPasteError, codec.parse)] : []),
      keymap({
        Backspace: undoInputRule,
        "Mod-z": commands.undo,
        "Mod-Shift-z": commands.redo,
        "Mod-y": commands.redo,
        "Mod-b": commands.bold,
        "Mod-i": commands.italic,
        "Mod-Shift-s": commands.strike,
        "Mod-`": commands.inlineCode,
        "Mod-Enter": chainCommands(exitCode, exitTable, commands.insertListParagraph),
        "Shift-Enter": chainCommands(newlineInCode, goToNextCell(1), exitTable, insertHardBreak),
        Enter: chainCommands(
          goToNextCell(1),
          exitTable,
          splitEditorListItem,
          baseKeymap.Enter ?? (() => false),
        ),
        Tab: chainCommands(goToNextCell(1), exitTable, commands.indentList),
        "Shift-Tab": chainCommands(goToNextCell(-1), commands.outdentList),
        "Mod-Alt-0": commands.paragraph,
        "Mod-Alt-1": commands.heading1,
        "Mod-Alt-2": commands.heading2,
        "Mod-Alt-3": commands.heading3,
        "Mod-Alt-4": commands.heading4,
        "Mod-Alt-5": commands.heading5,
        "Mod-Alt-6": commands.heading6,
        "Mod-Alt-7": commands.bulletList,
        "Mod-Alt-8": commands.orderedList,
        "Mod-Alt-9": commands.blockquote,
        "Mod-Alt-c": commands.codeBlock,
      }),
      keymap(baseKeymap),
      tableEditing({ allowTableNodeSelection: true }),
    ],
  })
}
const attributes = {
  role: "textbox",
  "aria-label": "문서 편집기",
  "aria-multiline": "true",
}
function notifyUpdate(previous: EditorState, state: EditorState, callbacks: EditorCallbacks) {
  callbacks.onUpdate?.(state)
  if (!previous.doc.eq(state.doc)) callbacks.onChange?.(state)
  if (!previous.selection.eq(state.selection)) callbacks.onSelectionChange?.(state)
}
export class Editor {
  #snapshot: EditorSnapshot
  #serverSnapshot: EditorSnapshot
  #callbacks: EditorCallbacks & ImageUploadOptions
  #markdownBehavior: MarkdownBehaviorOptions
  #configuration: EditorConfiguration
  #listeners = new Set<() => void>()
  #imageUploads = new Map<string, AbortController>()
  #nextImageUpload = 0
  #editable: boolean
  constructor(options: EditorOptions = {}) {
    this.#callbacks = options
    this.#editable = options.editable !== false
    this.#configuration = configure(options.extensions)
    this.#markdownBehavior = {
      markdownShortcuts: options.markdownShortcuts !== false,
      markdownPaste: options.markdownPaste !== false,
    }
    this.#snapshot = {
      state: createState(
        options,
        (error) => this.#callbacks.onMarkdownPasteError?.(error),
        this.#configuration,
      ),
      view: null,
    }
    this.#serverSnapshot = this.#snapshot
  }
  get state(): EditorState {
    return this.#snapshot.state
  }
  get view(): EditorView | null {
    return this.#snapshot.view
  }
  get isEditable(): boolean {
    return this.#editable
  }
  setEditable(editable: boolean): void {
    if (this.#editable === editable) return
    this.#editable = editable
    if (this.view) {
      this.view.setProps({ editable: () => this.#editable })
      syncTaskItemEditability(this.view)
    }
    this.#publish({ state: this.state, view: this.view })
  }
  getSnapshot = (): EditorSnapshot => this.#snapshot
  getServerSnapshot = (): EditorSnapshot => this.#serverSnapshot
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }
  setCallbacks(callbacks: EditorCallbacks & ImageUploadOptions): void {
    this.#callbacks = callbacks
  }
  dispatch = (transaction: Transaction): void => {
    const previous = this.state
    const { state } = previous.applyTransaction(transaction)
    if (state === previous) return
    this.#updateState(state)
  }
  getMarkdown(): string {
    return this.#configuration.codec.serialize(this.state.doc)
  }
  replaceMarkdown(markdown: string): void {
    const doc = this.#configuration.codec.parse(markdown)
    this.#configuration.codec.serialize(doc)
    if (getPendingImageUploads(this.state).length)
      throw new Error("vlab-editor: wait for image uploads before replacing Markdown source.")
    if (doc.eq(this.state.doc)) return
    const tr = closeHistory(this.state.tr).replaceWith(0, this.state.doc.content.size, doc.content)
    tr.setSelection(Selection.atStart(tr.doc))
    this.dispatch(tr)
    this.dispatch(closeHistory(this.state.tr))
  }
  setMarkdown(markdown: string): void {
    const state = createState(
      { markdown, ...this.#markdownBehavior },
      (error) => this.#callbacks.onMarkdownPasteError?.(error),
      this.#configuration,
    )
    for (const controller of this.#imageUploads.values())
      controller.abort(new ImageUploadError("cancelled"))
    this.#updateState(state)
  }
  uploadImage(file: File, attributes: Omit<ImageAttributes, "src"> = {}): Promise<ImageAttributes> {
    return this.#uploadImage(file, attributes)
  }
  uploadImages(
    files: readonly File[],
    attributes: Omit<ImageAttributes, "src"> = {},
  ): Promise<ImageAttributes[]> {
    const id = `image-group-${++this.#nextImageUpload}`
    return Promise.all(
      files.map((file, order) => this.#uploadImage(file, attributes, { id, order })),
    )
  }
  async #uploadImage(
    file: File,
    attributes: Omit<ImageAttributes, "src"> = {},
    group?: ImageUploadGroup,
  ): Promise<ImageAttributes> {
    const upload = this.#callbacks.uploadImage
    if (!upload) throw new ImageUploadError("not-configured")
    if (
      !file ||
      typeof file.name !== "string" ||
      typeof file.type !== "string" ||
      !file.type.startsWith("image/")
    )
      throw new ImageUploadError("invalid-file")
    if (!this.#editable || !canInsertImage(this.state)) throw new ImageUploadError("invalid-target")
    const id = `image-upload-${++this.#nextImageUpload}`
    const controller = new AbortController()
    this.#imageUploads.set(id, controller)
    this.dispatch(
      addImageUpload(
        this.state.tr,
        { id, fileName: file.name, position: this.state.selection.to },
        group,
      ),
    )
    let onAbort: (() => void) | undefined
    const cancelled = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(controller.signal.reason)
      controller.signal.addEventListener("abort", onAbort, { once: true })
    })
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => {
          if (controller.signal.aborted) throw controller.signal.reason
          return upload(file, { signal: controller.signal })
        }),
        cancelled,
      ])
      if (controller.signal.aborted) throw controller.signal.reason
      const node =
        result && typeof result === "object"
          ? imageNode(
              { ...result, ...attributes, alt: attributes.alt ?? result.alt ?? file.name },
              this.state.schema,
            )
          : null
      if (!node) throw new ImageUploadError("invalid-result")
      const target = getPendingImageUploads(this.state).find((pending) => pending.id === id)
      if (!target) throw new ImageUploadError("target-removed")
      if (this.state.doc.resolve(target.position).parent.type.spec.code)
        throw new ImageUploadError("invalid-target")
      const transaction = this.state.tr.replaceRangeWith(target.position, target.position, node)
      if (!transaction.docChanged) throw new ImageUploadError("invalid-target")
      this.dispatch(
        closeHistory(completeImageUpload(transaction, id, target.position, node.nodeSize)),
      )
      return { src: node.attrs.src, alt: node.attrs.alt, title: node.attrs.title }
    } catch (cause) {
      if (cause instanceof ImageUploadError) throw cause
      throw new ImageUploadError("failed", { cause })
    } finally {
      if (onAbort) controller.signal.removeEventListener("abort", onAbort)
      this.#imageUploads.delete(id)
      if (getPendingImageUploads(this.state).some((pending) => pending.id === id)) {
        this.dispatch(removeImageUpload(this.state.tr, id).setMeta("addToHistory", false))
      }
    }
  }
  cancelImageUpload(id: string): boolean {
    const controller = this.#imageUploads.get(id)
    if (!controller || controller.signal.aborted) return false
    controller.abort(new ImageUploadError("cancelled"))
    if (getPendingImageUploads(this.state).some((pending) => pending.id === id)) {
      this.dispatch(removeImageUpload(this.state.tr, id).setMeta("addToHistory", false))
    }
    return true
  }
  #handleImageFiles(view: EditorView, files: readonly File[], position?: number): boolean {
    const images = files.filter((file) => file.type.startsWith("image/"))
    if (!images.length || !this.#callbacks.uploadImage || !this.#editable || !view.editable)
      return false
    if (position !== undefined)
      view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(position))))
    void this.uploadImages(images).catch((cause) => {
      const error =
        cause instanceof ImageUploadError ? cause : new ImageUploadError("failed", { cause })
      this.#callbacks.onImageUploadError?.(error)
    })
    return true
  }
  cancelImageUploads(): void {
    for (const id of this.#imageUploads.keys()) this.cancelImageUpload(id)
  }
  canExecute(command: EditorCommand): boolean {
    if (!this.#editable) return false
    const execute = typeof command === "string" ? commands[command] : command
    return execute(this.state, undefined, this.view ?? undefined)
  }
  execute(command: EditorCommand, { focus = true }: ExecuteOptions = {}): boolean {
    if (!this.#editable) return false
    const execute = typeof command === "string" ? commands[command] : command
    const applied = execute(this.state, this.dispatch, this.view ?? undefined)
    if (applied && focus) this.view?.focus()
    return applied
  }
  mount(element: HTMLElement): EditorView {
    if (this.view) {
      throw new Error(
        "vlab-editor: an editor can only be mounted in one <EditorContent> at a time.",
      )
    }
    const view = new EditorView(element, {
      state: this.state,
      attributes,
      nodeViews: this.#configuration.nodeViews,
      editable: () => this.#editable,
      handleDOMEvents: {
        paste: (view, event) => {
          if (
            this.#callbacks.imagePaste === false ||
            !this.#callbacks.uploadImage ||
            !this.#editable ||
            !view.editable ||
            !event.clipboardData
          )
            return false
          try {
            if (
              !this.#handleImageFiles(
                view,
                clipboardImageFiles(event.clipboardData, view.dom.ownerDocument),
              )
            )
              return false
          } catch (cause) {
            this.#callbacks.onImageUploadError?.(new ImageUploadError("invalid-file", { cause }))
          }
          event.preventDefault()
          return true
        },
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved || view.dragging || this.#callbacks.imageDrop === false) return false
        const target = view.posAtCoords({ left: event.clientX, top: event.clientY })
        return (
          target !== null &&
          this.#handleImageFiles(view, Array.from(event.dataTransfer?.files ?? []), target.pos)
        )
      },
      dispatchTransaction: (transaction) => {
        if (!view.isDestroyed) this.dispatch(transaction)
      },
    })
    this.#publish({ state: this.state, view })
    return view
  }
  unmount(view: EditorView): void {
    if (this.view !== view) return
    view.destroy()
    this.#publish({ state: this.state, view: null })
  }
  #updateState(state: EditorState): void {
    const previous = this.state
    const view = this.view
    this.#snapshot = { state, view }
    view?.updateState(state)
    for (const listener of this.#listeners) listener()
    notifyUpdate(previous, state, this.#callbacks)
  }
  #publish(snapshot: EditorSnapshot): void {
    this.#snapshot = snapshot
    for (const listener of this.#listeners) listener()
  }
}
export function createEditor(element: HTMLElement, options: EditorOptions = {}): EditorView {
  const configuration = configure(options.extensions)
  const view = new EditorView(element, {
    state: createState(options, options.onMarkdownPasteError, configuration),
    attributes,
    nodeViews: configuration.nodeViews,
    editable: () => options.editable !== false,
    dispatchTransaction(transaction) {
      if (view.isDestroyed) return
      const previous = view.state
      const { state } = previous.applyTransaction(transaction)
      view.updateState(state)
      notifyUpdate(previous, state, options)
    },
  })
  return view
}
