import { createRef, useState } from 'react'

interface EditableLabelProps {
  value: string
  onValueChanged?: (value: string) => void
  onValueConfirmed?: (value: string) => void
  editing?: boolean
  setEditing?: (editing: boolean) => void
}

const EditableLabel: React.FC<EditableLabelProps> = ({ value, onValueChanged, onValueConfirmed, editing, setEditing }) => {
  const inputRef = createRef<HTMLInputElement>()

  const handleBlur = () => {
    setEditing?.(false)
  }

  const handleInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      setEditing?.(false)
      onValueConfirmed?.(value)
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