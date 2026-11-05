export const presets = [
  {
    id: "classic",
    name: "클래식",
    description: "익숙한 문서 편집기",
    placement: "top",
    radius: "soft",
  },
  { id: "minimal", name: "아이콘", description: "작고 간결하게", placement: "top", radius: "soft" },
  {
    id: "color",
    name: "컬러",
    description: "버튼마다 다른 표정",
    placement: "top",
    radius: "pill",
  },
  {
    id: "dock",
    name: "다크 도크",
    description: "편집 영역 아래에 가볍게",
    placement: "bottom",
    radius: "pill",
  },
] as const
export const accents = {
  forest: { name: "포레스트", color: "#34765a", soft: "#eaf3ec", ink: "#25553f" },
  violet: { name: "바이올렛", color: "#7659bd", soft: "#f0ecf8", ink: "#59418f" },
  coral: { name: "코랄", color: "#b44f3c", soft: "#fbede7", ink: "#8f3b2c" },
} as const
export const corners = {
  square: { name: "각지게", value: "2px" },
  soft: { name: "둥글게", value: "8px" },
  pill: { name: "알약", value: "999px" },
} as const
export interface ShowcaseConfig {
  preset: (typeof presets)[number]["id"]
  accent: keyof typeof accents
  radius: keyof typeof corners
  placement: "top" | "bottom"
  showToolbar: boolean
  showBlockSelect: boolean
  showFormatting: boolean
  showBlocks: boolean
  showTables: boolean
  showMedia: boolean
  showHistory: boolean
}
export type UpdateConfig = <K extends keyof ShowcaseConfig>(
  key: K,
  value: ShowcaseConfig[K],
) => void
export const initialConfig: ShowcaseConfig = {
  preset: "classic",
  accent: "forest",
  radius: "soft",
  placement: "top",
  showToolbar: true,
  showBlockSelect: true,
  showFormatting: true,
  showBlocks: true,
  showTables: true,
  showMedia: true,
  showHistory: true,
}
export function toolbarExample(config: ShowcaseConfig): string {
  const lines = [
    "const editor = useEditor({ doc: initialDoc, extensions: editorExtensions })",
    "",
    "<EditorProvider editor={editor}>",
  ]
  const content = '  <EditorContent className="my-document" />'
  if (config.placement === "bottom") lines.push(content)
  if (config.showToolbar) {
    lines.push(
      "  <ToolBar",
      `    className="showcase-toolbar toolbar-${config.preset}"`,
      '    buttonClassName="showcase-button"',
      '    dividerClassName="showcase-divider"',
      "  >",
    )
    if (config.showBlockSelect) lines.push("    <BlockTypeSelect />")
    if (config.showFormatting) {
      if (config.showBlockSelect) lines.push("    <ToolBarSeparator />")
      if (config.preset === "color") {
        lines.push(
          '    <BoldButton className="button-accent">',
          '      <ToolbarIcon name="bold" /> 굵게',
          "    </BoldButton>",
          '    <ItalicButton className="button-outline">',
          '      <ToolbarIcon name="italic" /> 기울임',
          "    </ItalicButton>",
        )
      } else if (config.preset === "classic") {
        lines.push("    <BoldButton />", "    <ItalicButton />")
      } else {
        lines.push(
          '    <BoldButton><ToolbarIcon name="bold" /></BoldButton>',
          '    <ItalicButton><ToolbarIcon name="italic" /></ItalicButton>',
        )
      }
      lines.push("    <StrikeButton />")
      lines.push('    <InlineCodeButton><ToolbarIcon name="code" /></InlineCodeButton>')
    }
    if (config.showBlocks) {
      if (config.showBlockSelect || config.showFormatting) lines.push("    <ToolBarSeparator />")
      lines.push(
        '    <BulletListButton><ToolbarIcon name="bulletList" /></BulletListButton>',
        '    <OrderedListButton><ToolbarIcon name="orderedList" /></OrderedListButton>',
        "    <TaskListButton />",
        '    <IndentListButton><ToolbarIcon name="indent" /></IndentListButton>',
        '    <OutdentListButton><ToolbarIcon name="outdent" /></OutdentListButton>',
        '    <BlockquoteButton><ToolbarIcon name="quote" /></BlockquoteButton>',
        '    <HorizontalRuleButton><ToolbarIcon name="rule" /></HorizontalRuleButton>',
        '    <CodeBlockButton><ToolbarIcon name="codeBlock" /></CodeBlockButton>',
      )
    }
    if (config.showTables) lines.push("    <TableControls />")
    if (config.showMedia) {
      if (config.showBlockSelect || config.showFormatting || config.showBlocks)
        lines.push("    <ToolBarSeparator />")
      lines.push(
        "    <MediaControls onNotice={setMediaNotice}",
        "      uploadMode={uploadMode} onUploadModeChange={setUploadMode} />",
      )
    }
    if (config.showHistory) {
      if (config.showBlockSelect || config.showFormatting || config.showBlocks || config.showMedia)
        lines.push("    <ToolBarSeparator />")
      lines.push(
        '    <UndoButton><ToolbarIcon name="undo" /></UndoButton>',
        '    <RedoButton><ToolbarIcon name="redo" /></RedoButton>',
      )
    }
    lines.push(
      "    <ToolBarButton command={restoreExample}",
      '      className="button-restore" aria-label="예제 다시 불러오기">',
      '      <ToolbarIcon name="reset" />',
      ...(config.preset === "classic" || config.preset === "color" ? ["      예제 복원"] : []),
      "    </ToolBarButton>",
      "  </ToolBar>",
    )
  }
  if (config.placement === "top") lines.push(content)
  lines.push("</EditorProvider>")
  return lines.join("\n")
}
