import { useEffect, RefObject } from 'react'

/**
 * 自定义hook：点击元素外部时执行回调函数
 * @param ref - 要监听的元素引用
 * @param handler - 点击外部时执行的回调函数
 * @param active - 是否激活监听，默认为true
 */
export function useClickOutside<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T>,
  handler: () => void,
  active: boolean = true
) {
  useEffect(() => {
    if (!active) return

    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handler()
      }
    }

    // 添加事件监听器
    document.addEventListener('mousedown', handleClickOutside)
    
    // 清理函数
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [ref, handler, active])
}
