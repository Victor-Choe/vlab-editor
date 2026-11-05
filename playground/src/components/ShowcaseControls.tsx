import { accents, corners, presets, type ShowcaseConfig, type UpdateConfig } from "../showcase"
import { ToolbarIcon } from "./ToolbarIcon"
export function PresetPicker({
  config,
  onSelect,
}: {
  config: ShowcaseConfig
  onSelect: (preset: (typeof presets)[number]) => void
}) {
  return (
    <section className="preset-section" aria-labelledby="preset-title">
      <div className="section-caption">
        <h2 id="preset-title">어떤 툴바가 어울리나요?</h2>
        <span>같은 에디터로 네 가지 디자인을 비교해보세요.</span>
      </div>
      <div className="preset-grid">
        {presets.map((preset, index) => (
          <button
            key={preset.id}
            type="button"
            className={`preset-card preset-${preset.id}`}
            aria-label={`${preset.name} 디자인`}
            aria-pressed={config.preset === preset.id}
            onClick={() => onSelect(preset)}
          >
            <span className={`preset-preview preview-${preset.id}`} aria-hidden="true">
              <span className="mini-document">
                <span />
                <span />
                <span />
              </span>
              <span className="mini-toolbar">
                <span className="mini-heading">
                  T<span>⌄</span>
                </span>
                <strong>B</strong>
                <em>I</em>
                <span className="mini-separator" />
                <span>↶</span>
                <span>↷</span>
              </span>
            </span>
            <span className="preset-label">
              <span className="preset-number">0{index + 1}</span>
              <span>
                <strong>{preset.name}</strong>
                <small>{preset.description}</small>
              </span>
              <span className="preset-check">
                <ToolbarIcon name="check" size={14} />
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
function SettingToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="setting-toggle">
      <span>{label}</span>
      <span className="switch-control">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="switch-track" aria-hidden="true" />
      </span>
    </label>
  )
}
export function ShowcaseControls({
  config,
  update,
}: {
  config: ShowcaseConfig
  update: UpdateConfig
}) {
  return (
    <aside className="customize-panel" aria-labelledby="customize-title">
      <div className="customize-heading">
        <span className="eyebrow">MAKE IT YOURS</span>
        <h2 id="customize-title">취향대로 바꿔보세요.</h2>
        <p>아래 설정은 바로 왼쪽에 적용됩니다.</p>
      </div>
      <fieldset className="setting-group">
        <legend>포인트 컬러</legend>
        <div className="accent-options">
          {Object.entries(accents).map(([id, accent]) => (
            <button
              key={id}
              type="button"
              className="accent-option"
              aria-label={accent.name}
              aria-pressed={config.accent === id}
              onClick={() => update("accent", id as keyof typeof accents)}
            >
              <span style={{ backgroundColor: accent.color }}>
                <ToolbarIcon name="check" size={15} />
              </span>
              {accent.name}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="setting-group">
        <legend>버튼 모서리</legend>
        <div className="segmented-control">
          {Object.entries(corners).map(([id, corner]) => (
            <button
              key={id}
              type="button"
              aria-pressed={config.radius === id}
              onClick={() => update("radius", id as keyof typeof corners)}
            >
              {corner.name}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="setting-group">
        <legend>툴바 위치</legend>
        <div className="segmented-control">
          <button
            type="button"
            aria-pressed={config.placement === "top"}
            onClick={() => update("placement", "top")}
          >
            상단
          </button>
          <button
            type="button"
            aria-pressed={config.placement === "bottom"}
            onClick={() => update("placement", "bottom")}
          >
            하단
          </button>
        </div>
      </fieldset>
      <fieldset className="setting-group component-settings">
        <legend>버튼 구성</legend>
        <SettingToggle
          label="제목·본문 드롭다운"
          checked={config.showBlockSelect}
          onChange={(value) => update("showBlockSelect", value)}
        />
        <SettingToggle
          label="굵게·기울임·취소선·코드"
          checked={config.showFormatting}
          onChange={(value) => update("showFormatting", value)}
        />
        <SettingToggle
          label="목록·체크리스트·인용·코드 블록"
          checked={config.showBlocks}
          onChange={(value) => update("showBlocks", value)}
        />
        <SettingToggle
          label="실행 취소·다시 실행"
          checked={config.showHistory}
          onChange={(value) => update("showHistory", value)}
        />
        <SettingToggle
          label="표 편집"
          checked={config.showTables}
          onChange={(value) => update("showTables", value)}
        />
        <SettingToggle
          label="링크·이미지"
          checked={config.showMedia}
          onChange={(value) => update("showMedia", value)}
        />
      </fieldset>
      <div className="customize-note">
        <span className="status-dot" aria-hidden="true" />
        디자인을 바꿔도 작성한 내용은 유지돼요.
      </div>
    </aside>
  )
}
