interface SwitcherProps {
  isChecked: boolean
  setChecked: (value: boolean) => void
  title?: string
}

const switcher: React.FC<SwitcherProps> = ({ isChecked, setChecked, title }) => {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        className="sr-only peer"
        type="checkbox"
        checked={isChecked}
        onChange={() => setChecked(!isChecked)} />
      <div className="w-11 h-6 bg-gray-200 peer-focus:(outline-none ring-4 ring-blue-300) rounded-full peer-checked:(after:translate-x-full after:border-white bg-blue-600) after:(content-[''] absolute top-[2px] left-[2px] bg-white border-gray-300 border rounded-full h-5 w-5 transition-all)" />
      {title && <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">{title}</span>}
    </label>
  )
}

export default switcher
