export function clipboardImageFiles(data: DataTransfer, document: Document): File[] {
  const items = Array.from(data.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
  if (items.length) return items
  const files = Array.from(data.files ?? []).filter((file) => file.type.startsWith("image/"))
  if (files.length) return files
  const html = data.getData("text/html")
  if (!html) return []
  const template = document.createElement("template")
  template.innerHTML = html
  const images = Array.from(template.content.querySelectorAll("img"))
  if (
    !images.length ||
    template.content.textContent?.trim() ||
    template.content.querySelector("table, hr, video, audio, iframe, object") ||
    images.some((image) => !image.getAttribute("src")?.startsWith("data:image/"))
  )
    return []
  return images.map((image, index) => {
    const match = /^data:(image\/[\w.+-]+)(;base64)?,([\s\S]*)$/i.exec(
      image.getAttribute("src") ?? "",
    )
    if (!match) throw new TypeError("Invalid clipboard image.")
    const type = match[1] as string
    const body = match[3] as string
    const bytes = match[2]
      ? Uint8Array.from(atob(body), (character) => character.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(body))
    const extension = type.slice(6).replace(/[^a-z0-9]/gi, "")
    return new File([bytes], `pasted-image-${index + 1}.${extension}`, { type })
  })
}
