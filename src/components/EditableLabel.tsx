import { createRef, useState } from 'react'

interface EditableLabelProps {
  value: string
  onValueChanged?: (value: string) => void
  onValueConfirmed?: (value: string) => void
}

const EditableLabel: React.FC<EditableLabelProps> = ({ value, onValueChanged, onValueConfirmed }) => {
  const [editing, isEditing] = useState(false)
  const inputRef = createRef<HTMLInputElement>()

  const handleDoubleClick = () => {
    isEditing(true)
  }

  const handleBlur = () => {
    isEditing(false)
  }

  const handleInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      isEditing(false)
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
        className={editing ? 'ml-1 text-3' : 'hidden'}
        autoFocus={true}
        value={value}
        onBlur={handleBlur}
        // onClick={e => e.stopPropagation()}
        onChange={handleInputChanged}
        onKeyDown={handleInputKeyDown}/>
        : <div className={!editing ? 'ml-1 text-3' : 'hidden'} onDoubleClick={handleDoubleClick}>{value}</div>}
    </section>
  )
}

export default EditableLabel
