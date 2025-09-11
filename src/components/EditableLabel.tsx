import { createRef, useState, useEffect } from 'react'

interface EditableLabelProps {
  value: string
  onValueChanged?: (value: string) => void
  onValueConfirmed?: (value: string) => void
  editing?: boolean
  setEditing?: (editing: boolean) => void
}

const EditableLabel: React.FC<EditableLabelProps> = ({ value, onValueChanged, onValueConfirmed, editing, setEditing }) => {
  const inputRef = createRef<HTMLInputElement>()
  const [originalValue, setOriginalValue] = useState(value)
  
  // 当开始编辑时，保存原始值（只在editing从false变为true时执行）
  useEffect(() => {
    if (editing) {
      setOriginalValue(value)
    }
  }, [editing]) // 移除value依赖，只监听editing状态变化

  const handleBlur = () => {
    // 失焦时保存数据（如果不为空）
    const trimmedValue = value.trim()
    if (trimmedValue) {
      onValueConfirmed?.(trimmedValue)
    } else {
      // 如果为空，恢复原始值并保存
      onValueChanged?.(originalValue)
      onValueConfirmed?.(originalValue)
    }
    setEditing?.(false)
  }

  const handleInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      const trimmedValue = value.trim()
      if (trimmedValue) {
        onValueConfirmed?.(trimmedValue)
      } else {
        // 如果为空，恢复原始值并保存
        onValueChanged?.(originalValue)
        onValueConfirmed?.(originalValue)
      }
      setEditing?.(false)
    } else if (event.key === 'Escape') {
      // ESC键取消编辑，恢复原始值并保存
      onValueChanged?.(originalValue)
      onValueConfirmed?.(originalValue)
      setEditing?.(false)
    }
  }

  const handleInputChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    onValueChanged?.(value)
  }

  return (
    <section>
      {editing
        ? <input
        ref={inputRef}
        className={'ml-1 text-3'}
        autoFocus={true}
        value={value}
        onBlur={handleBlur}
        onChange={handleInputChanged}
        onKeyDown={handleInputKeyDown}/>
        : <div className={'ml-1 text-3'}>{value}</div>}
    </section>
  )
}

export default EditableLabel