import { useEffect } from 'react'

export function useKeyPress(callback: (T?: any) => void, keys: string[], preventDefault = false) {
  const onKeyDown = (event: KeyboardEvent) => {
    const wasAnyKeyPressed = keys.includes(event.key)

    if (wasAnyKeyPressed) {
      if (preventDefault)
        event.preventDefault()

      callback()
    }
  }

  useEffect(() => {
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onKeyDown])
}
