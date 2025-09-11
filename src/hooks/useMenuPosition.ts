import { RefObject, useState, useEffect } from 'react'

// 自定义 Hook 用于计算菜单位置
export const useMenuPosition = (menuRef: RefObject<HTMLDivElement>, showMenu: boolean, mousePosition: { x: number, y: number }) => {
  const [position, setPosition] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (showMenu && menuRef.current) {
      // 使用 requestAnimationFrame 确保菜单已经渲染完成
      const frame = requestAnimationFrame(() => {
        const menu = menuRef.current
        if (!menu) return

        const rect = menu.getBoundingClientRect()
        const viewportHeight = window.innerHeight
        const viewportWidth = window.innerWidth

        // 基于鼠标位置计算菜单位置
        let top = mousePosition.y
        let left = mousePosition.x

        // 判断菜单是否超出底部边界
        if (rect.height + mousePosition.y > viewportHeight && mousePosition.y > rect.height) {
          // 如果超出底部边界且上方空间足够，向上显示
          top = mousePosition.y - rect.height
        } else if (rect.height + mousePosition.y > viewportHeight) {
          // 如果向上也放不下，调整位置使其不超出视窗
          top = viewportHeight - rect.height
        }

        // 判断菜单是否超出右侧边界
        if (rect.width + mousePosition.x > viewportWidth) {
          // 调整左侧位置，使其不超出右边界
          left = viewportWidth - rect.width
        }

        // 确保菜单不会超出左边界
        if (left < 0) {
          left = 0
        }

        // 确保菜单不会超出顶部边界
        if (top < 0) {
          top = 0
        }

        setPosition({ top, left })
      })

      return () => cancelAnimationFrame(frame)
    }
  }, [showMenu, mousePosition])

  return position
}