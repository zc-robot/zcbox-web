import type { InputHTMLAttributes } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement>

const Input: React.FC<InputProps> = (props) => {
  return (
    <input
      {...props}
      className={`bg-gray-50 border-(solid 1px gray-300) text='sm gray-900' rounded-lg focus:(ring-blue-500 border-blue-500) p-2 ${props.className}`}
      required />
  )
}

export default Input
