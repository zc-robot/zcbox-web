import { useCallback, useEffect } from 'react'

export function useKeyPress(callback: (event: KeyboardEvent, pressed: boolean) => void, keys: string[], preventDefault = false) {
  const onKeyDown = useCallback((event: KeyboardEvent) => {
    const wasAnyKeyPressed = keys.includes(event.key)

    if (wasAnyKeyPressed) {
      if (preventDefault)
        event.preventDefault()

      callback(event, true)
    }
  }, [callback, keys, preventDefault])

  const onKeyUp = useCallback((event: KeyboardEvent) => {
    const wasAnyKeyPressed = keys.includes(event.key)

    if (wasAnyKeyPressed) {
      if (preventDefault)
        event.preventDefault()

      callback(event, false)
    }
  }, [callback, keys, preventDefault])

  useEffect(() => {
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
    }
  }, [onKeyDown, onKeyUp])
}
