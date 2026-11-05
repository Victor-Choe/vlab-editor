import { useState } from "react"
import { useEditorContext, useEditorState } from "vlab-editor"
import { sampleImageUrl } from "../assets.js"

const example =
  "# 마크다운 문서\n\n본문에 **굵게**와 *기울임*, `인라인 코드`를 넣어보세요.\n\n### 세 번째 제목\n\n- 첫 번째 항목\n- 두 번째 항목\n  - 중첩 목록\n\n3. 번호는 3부터 시작합니다.\n4. 다음 항목\n\n> 인용문 안에서도 **서식**을 쓸 수 있어요.\n\n---\n\n```ts\nconst greeting = '안녕'\nconsole.log(greeting)\n```\n\n###### 여섯 번째 제목"
const tableExample = "# 표가 있는 문서\n\n| 이름 | 상태 |\n| --- | --- |\n| 예제 | 완료 |"
const gfmExample =
  "## GFM과 외부 확장\n\n- [ ] 표 편집 버튼으로 행과 열을 바꿔보세요\n- [x] 완료한 항목은 체크 상태까지 저장돼요\n- [ ] **굵게**, ~~취소선~~도 함께 쓸 수 있어요\n\n| 기능 | 진행 | 담당 |\n| :--- | :---: | ---: |\n| 표 편집 | 완료 | ProseMirror |\n| 코드 색상 | 완료 | lowlight |\n| 블록 UI | 앱에서 변경 | NodeView |\n\n```ts\ninterface Greeting { message: string }\nconst greeting: Greeting = { message: '안녕, vlab-editor!' }\nconsole.log(greeting.message)\n```\n\n코드 블록 상단에서 언어를 바꿔보고, 편집 후 마크다운을 다시 가져와 보세요."
const mediaExample = `## 링크와 이미지\n\n[공식 문서](https://prosemirror.net/docs/ "ProseMirror")에서 편집 기능을 확인하세요.\n\n[**같은 페이지 링크**](#editor-demo)도 유지합니다.\n\n![에디터 이미지 예제](${sampleImageUrl} "vlab-editor")`
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "마크다운 변환에 실패했습니다."
}
export function MarkdownPanel() {
  const editor = useEditorContext()
  useEditorState((state) => state.doc)
  const output = (() => {
    try {
      return { markdown: editor.getMarkdown(), error: null }
    } catch (error) {
      return { markdown: "", error: errorMessage(error) }
    }
  })()
  const [source, setSource] = useState(output.markdown)
  const [feedback, setFeedback] = useState<{
    error: boolean
    message: string
  } | null>(null)
  function applyMarkdown() {
    try {
      editor.setMarkdown(source)
      setFeedback({
        error: false,
        message: "문서를 교체했습니다. 실행 취소 기록이 초기화되었습니다.",
      })
    } catch (error) {
      setFeedback({ error: true, message: `${errorMessage(error)} 기존 문서는 유지됩니다.` })
    }
  }
  function readMarkdown() {
    try {
      setSource(editor.getMarkdown())
      setFeedback(null)
    } catch (error) {
      setFeedback({ error: true, message: errorMessage(error) })
    }
  }
  return (
    <div className="markdown-panel">
      <div className="markdown-columns">
        <div>
          <label className="markdown-caption" htmlFor="markdown-source">
            마크다운 입력
          </label>
          <textarea
            id="markdown-source"
            value={source}
            spellCheck={false}
            aria-describedby="markdown-support"
            onChange={(event) => {
              setSource(event.target.value)
              setFeedback(null)
            }}
          />
          <div className="markdown-actions">
            <button type="button" className="markdown-apply" onClick={applyMarkdown}>
              편집기에 적용
            </button>
            <button type="button" onClick={readMarkdown}>
              현재 문서 가져오기
            </button>
            <button
              type="button"
              onClick={() => {
                setSource(example)
                setFeedback(null)
              }}
            >
              지원 예제
            </button>
            <button
              type="button"
              onClick={() => {
                setSource(tableExample)
                setFeedback(null)
              }}
            >
              표 예제
            </button>
            <button
              type="button"
              onClick={() => {
                setSource(mediaExample)
                setFeedback(null)
              }}
            >
              링크·이미지 예제
            </button>
            <button
              type="button"
              onClick={() => {
                setSource(gfmExample)
                setFeedback(null)
              }}
            >
              GFM·코드 예제
            </button>
          </div>
        </div>
        <div className="markdown-output">
          <span className="markdown-caption">현재 문서 → 마크다운</span>
          {output.error ? (
            <p role="alert" className="markdown-error">
              {output.error}
            </p>
          ) : (
            <pre>
              <code id="document-markdown">{output.markdown || "(빈 문서)"}</code>
            </pre>
          )}
        </div>
      </div>
      <p id="markdown-support" className="markdown-support">
        H1~H6·목록·체크리스트·표·취소선·인용문·강조·코드·링크·이미지를 지원합니다. 적용하면 문서
        전체를 교체합니다. 문법과 빈 줄 표현은 정규화될 수 있어요.
      </p>
      <p className="markdown-support">
        입력란의 예제를 복사해서 위 편집 영역에 붙여넣어 보세요. 선택한 위치에 서식과 함께
        들어갑니다. 원문을 넣으려면 브라우저의 서식 없이 붙여넣기를 사용하세요. 미지원 문법도 원문
        텍스트로 유지됩니다.
      </p>
      {feedback && (
        <p
          role={feedback.error ? "alert" : "status"}
          className={feedback.error ? "markdown-feedback markdown-error" : "markdown-feedback"}
        >
          {feedback.message}
        </p>
      )}
    </div>
  )
}
