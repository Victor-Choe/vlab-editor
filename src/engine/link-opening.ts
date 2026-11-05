import { Plugin } from "prosemirror-state"
import type { EditorExtension } from "./extensions.js"
import { normalizeLinkUrl } from "./urls.js"
export interface LinkOpeningOptions {
  open?: (href: string, event: MouseEvent) => void
}
export function linkOpening(options: LinkOpeningOptions = {}): EditorExtension {
  return {
    name: "link-opening",
    plugins: () => [
      new Plugin({
        props: {
          handleDOMEvents: {
            click(view, event) {
              if (event.button !== 0 || event.shiftKey || event.altKey || event.defaultPrevented)
                return false
              const target = event.target as HTMLElement | null
              const link = target?.closest?.("a[href]")
              if (!link || !view.dom.contains(link)) return false
              const selection = view.dom.ownerDocument.getSelection()
              if (selection && !selection.isCollapsed) return false
              event.preventDefault()
              const href = normalizeLinkUrl(link.getAttribute("href"))
              if (href === null) return true
              if (options.open) options.open(href, event)
              else view.dom.ownerDocument.defaultView?.open(href, "_blank", "noopener,noreferrer")
              return true
            },
          },
        },
      }),
    ],
  }
}
