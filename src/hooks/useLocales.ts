import zhCN from '../../locales/zh-CN.json'
import en from '../../locales/en.json'
import type { LanguageCode } from '@/types'
import { useParamsStore } from '@/store'

const locales: { [key in LanguageCode]: { [k: string]: string } } = {
  'en': en,
  'zh-CN': zhCN,
}

export function useLocales() {
  const language = useParamsStore((state) => {
    return state.language
  })
  const locale = (key: string) => {
    return locales[language][key] || '--'
  }

  return { locale }
}
