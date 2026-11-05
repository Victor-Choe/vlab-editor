# vLab Editor

[ProseMirror](https://prosemirror.net/) 기반 React 블록 에디터입니다. Markdown을 가져오고 내보낼 수 있으며, 툴바의 버튼과 디자인을 앱에 맞게 조합할 수 있습니다.

[Playground](https://victor-choe.github.io/vlab-editor/) · [English](./README.md) · [API](./docs/api.md) · [Markdown](./docs/markdown.md) · [확장](./docs/extensions.md) · [기여 안내](./CONTRIBUTING.md)

첫 npm 배포를 준비하고 있습니다. [공개 playground](https://victor-choe.github.io/vlab-editor/)에서 체험하거나 이 저장소를 받아 직접 실행할 수 있습니다.

## 주요 기능

- React 19, TypeScript 타입, 편집 화면을 다시 연결해도 유지되는 문서 상태
- 제목, 중첩 목록, 체크리스트, 표, 인용문, 링크, 이미지, 코드 블록, 인라인 서식
- Markdown 변환, 입력 단축키, Markdown 붙여넣기
- 아이콘·문구·스타일을 직접 지정하는 툴바와 버튼
- 선택형 블록 드래그·블록 선택·링크 열기·코드 하이라이트
- 앱의 이미지 업로더 연결, 업로드 취소, 삽입 위치 추적
- ProseMirror 스키마·플러그인·단축키·NodeView·Markdown 규칙 확장

저장, 인증, 업로드 서버와 주변 UI는 사용하는 앱이 담당합니다. playground는 Tailwind CSS를 사용하지만, 에디터 패키지는 Tailwind CSS를 요구하지 않습니다.

## Playground 실행

개발 환경은 Node.js 24와 pnpm 11.3.0을 사용합니다.

```sh
git clone https://github.com/Victor-Choe/vlab-editor.git
cd vlab-editor
pnpm install
pnpm dev
```

<http://localhost:3005>에서 확인할 수 있습니다. 라이브러리를 먼저 빌드한 뒤 소스 변경 감지와 데모 서버를 함께 실행합니다.

## React에서 사용하기

첫 npm 배포 이후에는 React 19와 React DOM 19를 사용하는 프로젝트에 설치합니다.

```sh
npm install vlab-editor
```

```tsx
"use client"

import {
  BoldButton,
  EditorContent,
  EditorProvider,
  ItalicButton,
  ToolBar,
  UndoButton,
  useEditor,
} from "vlab-editor"
import "vlab-editor/styles.css"

export function Writer() {
  const editor = useEditor({ markdown: "# 안녕하세요, vLab Editor" })

  return (
    <EditorProvider editor={editor}>
      <ToolBar>
        <BoldButton />
        <ItalicButton />
        <UndoButton />
      </ToolBar>
      <EditorContent className="document" />
      <button type="button" onClick={() => console.log(editor.getMarkdown())}>
        Markdown 내보내기
      </button>
    </EditorProvider>
  )
}
```

기본 CSS는 툴바 디자인과 편집 동작에 필요한 스타일을 제공합니다. 본문 글꼴·여백·줄 간격은 앱에서 지정합니다.

```css
.document > .ProseMirror {
  min-height: 240px;
  padding: 24px;
  line-height: 1.7;
}
```

`EditorContent`는 React가 화면을 반영한 뒤 브라우저 편집 뷰를 연결합니다. Next.js App Router에서는 위 예제처럼 클라이언트 컴포넌트에서 사용합니다. 서버는 편집기 컨테이너를 렌더링하며, 실제 편집 문서는 hydration 후 나타납니다. 인스턴스 하나에는 편집 화면 하나만 동시에 연결할 수 있습니다.

기본 버튼 문구와 접근성 레이블은 한국어입니다. 버튼의 `aria-label`, `title`, `children`으로 바꿀 수 있습니다. 편집 영역 자체의 접근성 레이블은 [API 안내](./docs/api.md#react-components)를 참고하세요.

## 문서와 Markdown

```ts
import { Editor, parseMarkdown, serializeMarkdown } from "vlab-editor"

const editor = new Editor({ markdown: "**안녕하세요**" })
const markdown = editor.getMarkdown()
const json = editor.state.doc.toJSON()

editor.setMarkdown("## 새 문서")

const doc = parseMarkdown(markdown)
const normalizedMarkdown = serializeMarkdown(doc)
```

Markdown 출력은 정규화되므로 원문의 표기와 빈 줄 개수를 그대로 보존하지 않습니다. 지원하는 Markdown으로 표현할 수 없는 내용은 `MarkdownConversionError`를 일으킬 수 있습니다. 문서 교체에 성공하면 선택과 실행 취소 기록이 초기화되고, 변환에 실패하면 기존 상태가 유지됩니다. 저장 형식을 정하기 전에 [Markdown 지원 범위](./docs/markdown.md)를 확인하세요.

## 문서

개발 문서는 영문으로 제공합니다.

| 안내 | 내용 |
| --- | --- |
| [API](./docs/api.md) | 인스턴스 수명, React 컴포넌트, 상태 구독, 명령 |
| [Markdown](./docs/markdown.md) | 지원 문법, 정규화, 입력 단축키, 오류 |
| [확장](./docs/extensions.md) | 플러그인, 블록, 하이라이트, 드래그 |
| [링크와 이미지](./docs/media.md) | 편집 명령, 주소 처리, 이미지 업로드 |
| [내부 구조](./docs/architecture.md) | 상태·뷰·React·변환의 연결 |
| [Playground](https://github.com/Victor-Choe/vlab-editor/blob/main/playground/README.md) | 데모 실행과 수정 |
| [기여 안내](./CONTRIBUTING.md) | 개발 명령과 PR 작성 |
| [배포 안내](./docs/releasing.md) | 패키지 검사와 수동 배포 절차 |

## 개발 확인

```sh
pnpm check
```

린트, 라이브러리·테스트 타입 검사, 기존 단위·통합 테스트, playground 프로덕션 빌드를 실행합니다. 테스트는 Node.js와 jsdom에서 실행하며 React hydration과 DOM 동작도 검사합니다. 여러 브라우저를 대상으로 하는 테스트 모음은 아닙니다.

## 라이선스

[MIT](./LICENSE). vLab의 [Victor Choe](https://github.com/Victor-Choe)가 만들었습니다.
