import MarkdownIt from "markdown-it"

const urls = new MarkdownIt("zero")
function normalizeUrl(value: unknown, protocols: readonly string[]): string | null {
  if (typeof value !== "string") return null
  const source = value.trim()
  if (
    !source ||
    source.includes("\\") ||
    Array.from(source).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return null
  const protocol = /^([a-z][a-z\d+.-]*):/i.exec(source)?.[1]?.toLowerCase()
  if (protocol) {
    if (!protocols.includes(protocol)) return null
    if (protocol === "http" || protocol === "https") {
      if (!/^https?:\/\//i.test(source)) return null
      try {
        if (!new URL(source).hostname) return null
      } catch {
        return null
      }
    } else if (!source.slice(source.indexOf(":") + 1).trim()) return null
  } else if (source.split(/[/?#]/, 1)[0]?.includes(":")) return null
  return urls.normalizeLink(source)
}
export function normalizeLinkUrl(value: unknown): string | null {
  return normalizeUrl(value, ["http", "https", "mailto", "tel"])
}
export function normalizeImageUrl(value: unknown): string | null {
  return normalizeUrl(value, ["http", "https"])
}
export function validateLinkUrl(value: unknown): void {
  if (normalizeLinkUrl(value) === null) throw new RangeError("vlab-editor: unsupported link URL.")
}
export function validateImageUrl(value: unknown): void {
  if (normalizeImageUrl(value) === null) throw new RangeError("vlab-editor: unsupported image URL.")
}
export function validateTitle(value: unknown): void {
  if (value !== null && typeof value !== "string")
    throw new TypeError("vlab-editor: title must be a string or null.")
}
