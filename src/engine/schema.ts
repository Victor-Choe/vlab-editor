import { Schema } from "prosemirror-model"
import { bulletList, listItem, orderedList } from "prosemirror-schema-list"
import { tableNodes } from "prosemirror-tables"
import {
  normalizeImageUrl,
  normalizeLinkUrl,
  validateImageUrl,
  validateLinkUrl,
  validateTitle,
} from "./urls.js"
export const headingLevels = [1, 2, 3, 4, 5, 6] as const
export type HeadingLevel = (typeof headingLevels)[number]
export const editorSchema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0],
    },
    heading: {
      group: "block",
      content: "inline*",
      attrs: {
        level: {
          default: 1,
          validate: (value: unknown) => {
            if (!headingLevels.includes(value as HeadingLevel)) {
              throw new RangeError("vlab-editor: heading level must be between 1 and 6.")
            }
          },
        },
      },
      defining: true,
      parseDOM: headingLevels.map((level) => ({ tag: `h${level}`, attrs: { level } })),
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
    blockquote: {
      group: "block",
      content: "block+",
      defining: true,
      parseDOM: [{ tag: "blockquote" }],
      toDOM: () => ["blockquote", 0],
    },
    horizontal_rule: {
      group: "block",
      parseDOM: [{ tag: "hr" }],
      toDOM: () => ["hr"],
    },
    code_block: {
      group: "block",
      content: "text*",
      marks: "",
      code: true,
      defining: true,
      attrs: { params: { default: "", validate: "string" } },
      parseDOM: [
        {
          tag: "pre",
          preserveWhitespace: "full",
          getAttrs: (element) => ({
            params:
              element.getAttribute("data-params") ??
              element.querySelector("code")?.className.match(/(?:^|\s)language-([^\s]+)/)?.[1] ??
              "",
          }),
        },
      ],
      toDOM: (node) => [
        "pre",
        node.attrs.params ? { "data-params": node.attrs.params } : {},
        ["code", 0],
      ],
    },
    bullet_list: { ...bulletList, group: "block", content: "list_item+" },
    ordered_list: {
      ...orderedList,
      group: "block",
      content: "list_item+",
      attrs: {
        order: {
          default: 1,
          validate: (value: unknown) => {
            if (
              !Number.isInteger(value) ||
              (value as number) < 0 ||
              (value as number) > 999999999
            ) {
              throw new RangeError(
                "vlab-editor: list start must be an integer from 0 to 999999999.",
              )
            }
          },
        },
      },
      parseDOM: [
        {
          tag: "ol",
          getAttrs: (element) => {
            const order = Number(element.getAttribute("start") ?? 1)
            return {
              order: Number.isInteger(order) && order >= 0 && order <= 999999999 ? order : 1,
            }
          },
        },
      ],
    },
    list_item: {
      ...listItem,
      content: "paragraph block*",
      attrs: {
        checked: {
          default: null,
          validate: (value: unknown) => {
            if (value !== null && typeof value !== "boolean")
              throw new RangeError("vlab-editor: checked must be a boolean or null.")
          },
        },
      },
      parseDOM: [
        {
          tag: "li",
          getAttrs: (element) => ({
            checked: element.hasAttribute("data-checked")
              ? element.getAttribute("data-checked") === "true"
              : element.querySelector(
                    ':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]',
                  )
                ? (
                    element.querySelector(
                      ':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]',
                    ) as HTMLInputElement
                  ).checked
                : null,
          }),
        },
      ],
      toDOM: (node) =>
        node.attrs.checked === null
          ? ["li", 0]
          : [
              "li",
              { "data-checked": String(node.attrs.checked) },
              [
                "input",
                {
                  type: "checkbox",
                  ...(node.attrs.checked ? { checked: "checked" } : {}),
                  contenteditable: "false",
                  "aria-label": "완료 상태",
                },
              ],
              ["div", { "data-task-content": "" }, 0],
            ],
    },
    ...tableNodes({
      tableGroup: "block",
      cellContent: "paragraph",
      cellAttributes: {
        align: {
          default: null,
          getFromDOM: (element) => {
            const align = element.style.textAlign || element.getAttribute("align")
            return align === "left" || align === "center" || align === "right" ? align : null
          },
          setDOMAttr: (value, attributes) => {
            if (value === "left" || value === "center" || value === "right")
              attributes.style = `text-align: ${value}`
          },
        },
      },
    }),
    image: {
      inline: true,
      group: "inline",
      draggable: true,
      attrs: {
        src: { validate: validateImageUrl },
        alt: { default: "", validate: "string" },
        title: { default: null, validate: validateTitle },
      },
      parseDOM: [
        {
          tag: "img[src]",
          getAttrs: (element) => {
            const src = normalizeImageUrl(element.getAttribute("src"))
            return src === null
              ? false
              : {
                  src,
                  alt: element.getAttribute("alt") ?? "",
                  title: element.getAttribute("title"),
                }
          },
        },
      ],
      toDOM: (node) => [
        "img",
        { src: normalizeImageUrl(node.attrs.src), alt: node.attrs.alt, title: node.attrs.title },
      ],
    },
    hard_break: {
      inline: true,
      group: "inline",
      selectable: false,
      parseDOM: [{ tag: "br" }],
      toDOM: () => ["br"],
    },
    text: { group: "inline" },
  },
  marks: {
    link: {
      attrs: {
        href: { validate: validateLinkUrl },
        title: { default: null, validate: validateTitle },
      },
      inclusive: false,
      parseDOM: [
        {
          tag: "a[href]",
          getAttrs: (element) => {
            const href = normalizeLinkUrl(element.getAttribute("href"))
            return href === null ? false : { href, title: element.getAttribute("title") }
          },
        },
      ],
      toDOM: (mark) => [
        "a",
        { href: normalizeLinkUrl(mark.attrs.href), title: mark.attrs.title },
        0,
      ],
    },
    strong: {
      parseDOM: [{ tag: "strong" }, { tag: "b" }],
      toDOM: () => ["strong", 0],
    },
    em: {
      parseDOM: [{ tag: "em" }, { tag: "i" }],
      toDOM: () => ["em", 0],
    },
    strike: {
      parseDOM: [{ tag: "s" }, { tag: "del" }, { tag: "strike" }],
      toDOM: () => ["s", 0],
    },
    code: {
      code: true,
      inclusive: false,
      parseDOM: [{ tag: "code" }],
      toDOM: () => ["code", 0],
    },
  },
})
export function editorTypes(schema: Schema): typeof editorSchema {
  return schema as typeof editorSchema
}
