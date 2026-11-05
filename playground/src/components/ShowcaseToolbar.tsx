import {
  BlockquoteButton,
  BoldButton,
  BulletListButton,
  CodeBlockButton,
  type EditorCommand,
  HorizontalRuleButton,
  headingLevels,
  IndentListButton,
  InlineCodeButton,
  InsertListParagraphButton,
  ItalicButton,
  isCommandActive,
  OrderedListButton,
  OutdentListButton,
  RedoButton,
  StrikeButton,
  TaskListButton,
  ToolBar,
  ToolBarButton,
  type ToolBarCommand,
  ToolBarSeparator,
  UndoButton,
  useEditorContext,
  useEditorState,
} from "vlab-editor"
import type { ShowcaseConfig } from "../showcase"
import { MediaControls, type MediaNotice } from "./MediaControls"
import { TableControls } from "./TableControls"
import { TableOfContentsControl } from "./TableOfContentsControl"
import { ToolbarIcon } from "./ToolbarIcon"

const blockOptions = [
  { command: "paragraph", label: "본문" },
  ...headingLevels.map((level) => ({
    command: `heading${level}` as const,
    label: `제목 ${level}`,
  })),
  { command: "codeBlock", label: "코드 블록" },
] satisfies {
  command: EditorCommand
  label: string
}[]
function BlockTypeSelect() {
  const editor = useEditorContext()
  const state = useEditorState()
  const value =
    blockOptions.find(({ command }) => isCommandActive(command, state))?.command ?? "paragraph"
  return (
    <span className="block-select">
      <select
        aria-label="문단 스타일"
        value={value}
        onChange={(event) => {
          const option = blockOptions.find((option) => option.command === event.target.value)
          if (option) editor.execute(option.command)
        }}
      >
        {blockOptions.map(({ command, label }) => (
          <option key={command} value={command} disabled={!editor.canExecute(command)}>
            {label}
          </option>
        ))}
      </select>
      <ToolbarIcon name="chevron" size={14} />
    </span>
  )
}
export function ShowcaseToolbar({
  config,
  restoreExample,
  onMediaNotice,
  uploadMode,
  onUploadModeChange,
}: {
  config: ShowcaseConfig
  restoreExample: ToolBarCommand
  onMediaNotice: (notice: MediaNotice) => void
  uploadMode: "success" | "failure"
  onUploadModeChange: (mode: "success" | "failure") => void
}) {
  const labeled = config.preset === "classic" || config.preset === "color"
  return (
    <ToolBar
      id="toolbar"
      className={`showcase-toolbar toolbar-${config.preset}`}
      buttonClassName="showcase-button"
      dividerClassName="showcase-divider"
    >
      {config.showBlockSelect && <BlockTypeSelect />}
      {config.showFormatting && (
        <>
          {config.showBlockSelect && <ToolBarSeparator />}
          <BoldButton className={config.preset === "color" ? "button-accent" : undefined}>
            {config.preset === "classic" ? <strong>B</strong> : <ToolbarIcon name="bold" />}
            {config.preset === "color" && <span>굵게</span>}
          </BoldButton>
          <ItalicButton className={config.preset === "color" ? "button-outline" : undefined}>
            {config.preset === "classic" ? <em>I</em> : <ToolbarIcon name="italic" />}
            {config.preset === "color" && <span>기울임</span>}
          </ItalicButton>
          <StrikeButton />
          <InlineCodeButton>
            <ToolbarIcon name="code" />
          </InlineCodeButton>
        </>
      )}
      {config.showBlocks && (
        <>
          {(config.showBlockSelect || config.showFormatting) && <ToolBarSeparator />}
          <BulletListButton>
            <ToolbarIcon name="bulletList" />
          </BulletListButton>
          <OrderedListButton>
            <ToolbarIcon name="orderedList" />
          </OrderedListButton>
          <TaskListButton />
          <IndentListButton>
            <ToolbarIcon name="indent" />
          </IndentListButton>
          <OutdentListButton>
            <ToolbarIcon name="outdent" />
          </OutdentListButton>
          <InsertListParagraphButton />
          <BlockquoteButton>
            <ToolbarIcon name="quote" />
          </BlockquoteButton>
          <HorizontalRuleButton>
            <ToolbarIcon name="rule" />
          </HorizontalRuleButton>
          <CodeBlockButton>
            <ToolbarIcon name="codeBlock" />
          </CodeBlockButton>
        </>
      )}
      {config.showTables && (
        <>
          <ToolBarSeparator />
          <TableControls />
        </>
      )}
      {config.showMedia && (
        <>
          {(config.showBlockSelect || config.showFormatting || config.showBlocks) && (
            <ToolBarSeparator />
          )}
          <MediaControls
            onNotice={onMediaNotice}
            uploadMode={uploadMode}
            onUploadModeChange={onUploadModeChange}
          />
        </>
      )}
      {config.showHistory && (
        <>
          {(config.showBlockSelect ||
            config.showFormatting ||
            config.showBlocks ||
            config.showMedia) && <ToolBarSeparator />}
          <UndoButton>
            <ToolbarIcon name="undo" />
          </UndoButton>
          <RedoButton>
            <ToolbarIcon name="redo" />
          </RedoButton>
        </>
      )}
      <TableOfContentsControl />
      <ToolBarButton
        command={restoreExample}
        className="button-restore"
        aria-label="예제 다시 불러오기"
        title="예제 다시 불러오기"
      >
        <ToolbarIcon name="reset" size={16} />
        {labeled && <span>예제 복원</span>}
      </ToolBarButton>
    </ToolBar>
  )
}
