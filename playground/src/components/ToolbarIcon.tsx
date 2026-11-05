const paths = {
  link: "m10 13 4-4M8 16H6a4 4 0 0 1 0-8h4m4 0h4a4 4 0 0 1 0 8h-4",
  unlink: "m3 3 18 18M8 16H6a4 4 0 0 1-2-7m10-1h4a4 4 0 0 1 3 7M10 13l2-2",
  image: "M3 4h18v16H3V4m0 12 5-5 4 4 3-3 6 6M8 8h.01",
  bold: "M6 4h6a4 4 0 0 1 0 8H6m0 0h7a4 4 0 0 1 0 8H6V4",
  italic: "M10 4h10M4 20h10M15 4 9 20",
  code: "m8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16",
  codeBlock: "M4 3h16v18H4V3m4 5-3 4 3 4m8-8 3 4-3 4",
  bulletList: "M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1",
  orderedList: "M10 6h11M10 12h11M10 18h11M3 3h1v5M2 8h4M2 13c0-3 4-3 4-1 0 1-4 5-4 5h4",
  quote: "M4 5h6v7H4V5m6 7c0 4-2 6-5 7M14 5h6v7h-6V5m6 7c0 4-2 6-5 7",
  rule: "M3 12h18",
  indent: "M10 5h11M10 12h11M10 19h11m-8-7 5 4-5 4",
  outdent: "M10 5h11M10 12h11M10 19h11m-3-7-5 4 5 4",
  undo: "M9 5 4 10l5 5M4 10h10a6 6 0 0 1 6 6v3",
  redo: "m15 5 5 5-5 5M20 10H10a6 6 0 0 0-6 6v3",
  reset: "M3 10a9 9 0 1 1 2 8M3 4v6h6",
  chevron: "m7 10 5 5 5-5",
  check: "m5 12 4 4L19 6",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  eyeOff:
    "m3 3 18 18M10.6 5.1 12 5c6.5 0 10 7 10 7a20 20 0 0 1-3 3.8M6.6 6.6A21 21 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.4-1.6M10 10a3 3 0 0 0 4 4",
} as const
export function ToolbarIcon({ name, size = 18 }: { name: keyof typeof paths; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}
