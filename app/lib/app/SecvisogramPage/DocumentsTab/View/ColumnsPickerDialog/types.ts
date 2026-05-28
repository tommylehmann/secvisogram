type Column = {
  id: string
  labelKey: string
  kind: 'string' | 'date' | 'version' | 'action'
  sortable: boolean
  defaultVisible: boolean
}

export interface Props {
  columns: ReadonlyArray<Column>
  visibility: Record<string, boolean>
  onToggle(id: string, visible: boolean): void
  onClose(): void
}
