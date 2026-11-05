import { type CSSProperties, StrictMode, useState } from "react"
import { createRoot } from "react-dom/client"
import {
  EditorContent,
  EditorProvider,
  editorSchema,
  type ToolBarCommand,
  useEditor,
  useEditorState,
} from "vlab-editor"
import "./styles.css"
import "vlab-editor/styles.css"
import "./showcase.css"
import { MarkdownPanel } from "./components/MarkdownPanel"
import { ImageUploadStatus, type MediaNotice } from "./components/MediaControls"
import { PresetPicker, ShowcaseControls } from "./components/ShowcaseControls"
import { ShowcaseToolbar } from "./components/ShowcaseToolbar"
import { ToolbarIcon } from "./components/ToolbarIcon"
import { demoImageUpload } from "./demo-upload"
import { editorExtensions } from "./editor-extensions"
import { accents, corners, initialConfig, type ShowcaseConfig, toolbarExample } from "./showcase"

const initialDoc = editorSchema.nodeFromJSON({
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "같은 문서, 다른 표정." }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "어울리는 툴바를 골라보세요. 색과 모양을 바꿔도 여기에 적은 이야기는 그대로 남아 있어요.",
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "텍스트를 선택하면 " },
        { type: "text", text: "굵게", marks: [{ type: "strong" }] },
        { type: "text", text: " 또는 " },
        { type: "text", text: "기울임", marks: [{ type: "em" }] },
        { type: "text", text: " 서식을 적용할 수 있어요." },
      ],
    },
    { type: "paragraph" },
  ],
})
const restoreExample: ToolBarCommand = (state, dispatch) => {
  if (state.doc.eq(initialDoc)) return false
  dispatch?.(state.tr.replaceWith(0, state.doc.content.size, initialDoc.content))
  return true
}
function DocumentStats() {
  const stats = useEditorState(
    ({ doc }) => `${doc.childCount}개 블록 · ${Array.from(doc.textContent).length}자`,
  )
  return <span id="document-stats">{stats}</span>
}
function DocumentJSON() {
  const json = useEditorState(({ doc }) => JSON.stringify(doc.toJSON(), null, 2))
  return (
    <pre>
      <code id="document-json">{json}</code>
    </pre>
  )
}
function Inspector({ config }: { config: ShowcaseConfig }) {
  const [tab, setTab] = useState<"jsx" | "json" | "markdown">("markdown")
  return (
    <section className="inspector-panel" aria-label="구성과 문서 살펴보기">
      <div className="inspector-heading">
        <div className="inspector-tabs">
          <button
            type="button"
            aria-pressed={tab === "markdown"}
            onClick={() => setTab("markdown")}
          >
            마크다운 변환
          </button>
          <button type="button" aria-pressed={tab === "jsx"} onClick={() => setTab("jsx")}>
            JSX 구성
          </button>
          <button type="button" aria-pressed={tab === "json"} onClick={() => setTab("json")}>
            문서 JSON
          </button>
        </div>
        <span className="live-label">
          <span className="status-dot" aria-hidden="true" /> LIVE
        </span>
      </div>
      <p className="inspector-description">
        {tab === "markdown"
          ? "문자열을 편집기에 넣고, 편집 결과를 마크다운으로 꺼내보세요. 미지원 문법은 적용 전에 알려줍니다."
          : tab === "jsx"
            ? "지금 선택한 툴바의 구성입니다. 아이콘과 드롭다운, CSS 클래스는 이 playground에서 정의했어요."
            : "편집한 문서를 데이터로 확인해보세요. 툴바 디자인을 바꿔도 문서는 유지됩니다."}
      </p>
      {tab === "markdown" ? (
        <MarkdownPanel />
      ) : tab === "jsx" ? (
        <pre>
          <code>{toolbarExample(config)}</code>
        </pre>
      ) : (
        <DocumentJSON />
      )}
    </section>
  )
}
function EditorDemo() {
  const [pasteNotice, setPasteNotice] = useState<string | null>(null)
  const [mediaNotice, setMediaNotice] = useState<MediaNotice | null>(null)
  const [uploadMode, setUploadMode] = useState<"success" | "failure">("success")
  const editor = useEditor({
    doc: initialDoc,
    extensions: editorExtensions,
    uploadImage: demoImageUpload(uploadMode),
    onMarkdownPasteError: (error) =>
      setPasteNotice(`${error.message}\n원문 텍스트로 붙여넣었습니다.`),
  })
  const [config, setConfig] = useState(initialConfig)
  const palette = accents[config.accent]
  const style = {
    "--demo-accent": palette.color,
    "--demo-soft": palette.soft,
    "--demo-ink": palette.ink,
    "--demo-radius": corners[config.radius].value,
  } as CSSProperties
  function updateConfig<K extends keyof ShowcaseConfig>(key: K, value: ShowcaseConfig[K]) {
    setConfig((previous) => ({ ...previous, [key]: value }))
  }
  return (
    <EditorProvider editor={editor}>
      <div className="toolbar-playground" style={style}>
        <PresetPicker
          config={config}
          onSelect={(preset) => {
            setConfig((previous) => ({
              ...previous,
              preset: preset.id,
              placement: preset.placement,
              radius: preset.radius,
              showToolbar: true,
            }))
          }}
        />
        <div className="workspace">
          <section className="editor-panel" aria-labelledby="editor-title">
            <div className="panel-heading">
              <h2 id="editor-title">
                <span className="status-dot" aria-hidden="true" /> 내 첫 번째 문서
              </h2>
              <button
                type="button"
                className="visibility-toggle"
                aria-pressed={config.showToolbar}
                onClick={() => updateConfig("showToolbar", !config.showToolbar)}
              >
                <ToolbarIcon name={config.showToolbar ? "eyeOff" : "eye"} size={15} />
                {config.showToolbar ? "툴바 숨기기" : "툴바 표시"}
              </button>
            </div>
            <div className="typing-guide">
              <span>빈 문단에서 바로 입력해 보세요</span>
              <code># 제목</code>
              <code>###### 제목 6</code>
              <code>**굵게**</code>
              <code>- 목록</code>
              <code>- [ ] 할 일</code>
              <code>~~취소선~~</code>
              <code>&gt; 인용문</code>
              <code>`코드`</code>
              <code>``` 코드 블록</code>
            </div>
            <p className="keyboard-guide">
              블록에 마우스를 올리면 왼쪽에 나타나는 ⠿ 손잡이로 순서를 바꿀 수 있어요. 손잡이에
              포커스한 뒤 Alt+↑/↓로도 이동합니다. 본문 좌우 여백을 드래그하거나, 블록을 선택한 뒤
              Shift+클릭·Shift+↑/↓로 여러 블록을 선택하세요. 선택한 블록은 함께 이동하고
              Delete·Backspace로 삭제할 수 있어요. Esc로 블록 선택을 시작하거나 해제합니다.
            </p>
            <p className="keyboard-guide">
              목록의 각 항목과 하위 항목도 따로 선택하고 옮길 수 있어요. Tab·Shift+Tab으로 중첩을
              조절하고, 목록 안에서 Ctrl/Cmd+Enter 또는 ‘목록 항목 아래 문단 추가’ 버튼으로 번호
              없는 설명·링크·이미지를 넣어보세요. 표는 Tab·Shift+Tab으로 셀을 이동하고,
              코드·표에서는 Ctrl/Cmd+Enter로 빠져나옵니다.
            </p>
            <p className="keyboard-guide">
              기존 문단도 목록 항목의 글자 영역 하단으로 끌어 넣을 수 있어요. 항목 안쪽의 드롭 선을
              확인하고 놓으면 번호 없는 하위 문단이 됩니다. 글머리·번호·체크 목록 모두 같은 방식으로
              동작합니다.
            </p>
            <div className="editor-canvas" data-placement={config.placement}>
              <div className="toolbar-slot">
                {config.showToolbar && (
                  <ShowcaseToolbar
                    config={config}
                    restoreExample={restoreExample}
                    onMediaNotice={setMediaNotice}
                    uploadMode={uploadMode}
                    onUploadModeChange={setUploadMode}
                  />
                )}
              </div>
              <EditorContent id="editor" />
            </div>
            <ImageUploadStatus />
            {mediaNotice && (
              <div
                className={`media-notice media-notice-${mediaNotice.kind}`}
                role={mediaNotice.kind === "error" ? "alert" : "status"}
              >
                <span>{mediaNotice.message}</span>
                <button
                  type="button"
                  aria-label="링크·이미지 알림 닫기"
                  onClick={() => setMediaNotice(null)}
                >
                  닫기
                </button>
              </div>
            )}
            {pasteNotice && (
              <div className="paste-notice" role="alert">
                <span>{pasteNotice}</span>
                <button
                  type="button"
                  aria-label="붙여넣기 알림 닫기"
                  onClick={() => setPasteNotice(null)}
                >
                  닫기
                </button>
              </div>
            )}
            <div className="editor-footer">
              <span>
                {config.showToolbar
                  ? "마크다운을 복사해 붙여넣거나, 텍스트를 선택해 서식을 적용해 보세요."
                  : "툴바를 숨겨도 입력 자동 변환과 붙여넣기를 사용할 수 있어요."}
              </span>
              <DocumentStats />
            </div>
          </section>
          <ShowcaseControls config={config} update={updateConfig} />
        </div>
        <Inspector config={config} />
      </div>
    </EditorProvider>
  )
}
const container = document.querySelector("#editor-demo")
if (!container) throw new Error("Missing editor demo container")
const root = createRoot(container)
root.render(
  <StrictMode>
    <EditorDemo />
  </StrictMode>,
)
if (import.meta.hot) {
  import.meta.hot.dispose(() => root.unmount())
}
