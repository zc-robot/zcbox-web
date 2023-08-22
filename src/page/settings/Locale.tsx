import { useParamsStore } from '@/store'
import { useLocales } from '@/hooks'
import type { LanguageCode } from '@/types'

const LanguageSetting: React.FC = () => {
  const { locale } = useLocales()
  const language = useParamsStore(state => state.language)
  const updateLanguage = useParamsStore(state => state.updateLanguage)

  return (
    <>
      <h3>{locale('languageOption')}</h3>
      <form>
        <div className="flex flex-items-center p2 gap-2">
          <span className="text-sm w-30">{locale('uiLanguage')}</span>
          <select
            value={language}
            onChange={e => updateLanguage(e.target.value as LanguageCode)}>
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
          </select>
        </div>
      </form>
    </>
  )
}

export default LanguageSetting
