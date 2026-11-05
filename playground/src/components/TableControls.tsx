import {
  AddColumnAfterButton,
  AddColumnBeforeButton,
  AddRowAfterButton,
  AddRowBeforeButton,
  DeleteColumnButton,
  DeleteRowButton,
  DeleteTableButton,
  InsertTableButton,
  setTableAlignment,
  ToolBarButton,
  useEditorState,
} from "vlab-editor"
export function TableControls() {
  const inTable = useEditorState(({ selection }) => {
    for (let depth = selection.$from.depth; depth > 0; depth--)
      if (selection.$from.node(depth).type.spec.tableRole === "table") return true
    return false
  })
  return (
    <>
      <InsertTableButton />
      {inTable && (
        <>
          <AddRowBeforeButton />
          <AddRowAfterButton />
          <DeleteRowButton />
          <AddColumnBeforeButton />
          <AddColumnAfterButton />
          <DeleteColumnButton />
          <ToolBarButton command={setTableAlignment("left")} aria-label="열 왼쪽 정렬">
            좌
          </ToolBarButton>
          <ToolBarButton command={setTableAlignment("center")} aria-label="열 가운데 정렬">
            중
          </ToolBarButton>
          <ToolBarButton command={setTableAlignment("right")} aria-label="열 오른쪽 정렬">
            우
          </ToolBarButton>
          <DeleteTableButton />
        </>
      )}
    </>
  )
}
