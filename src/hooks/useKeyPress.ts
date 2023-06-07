import { useEffect } from 'react'

export function useKeyPress(callback: (event: KeyboardEvent, pressed: boolean) => void, keys: string[], preventDefault = false) {
  const onKeyDown = (event: KeyboardEvent) => {
    const wasAnyKeyPressed = keys.includes(event.key)

    if (wasAnyKeyPressed) {
      if (preventDefault)
        event.preventDefault()

      callback(event, true)
    }
  }

  const onKeyUp = (event: KeyboardEvent) => {
    const wasAnyKeyPressed = keys.includes(event.key)

    if (wasAnyKeyPressed) {
      if (preventDefault)
        event.preventDefault()

      callback(event, false)
    }
  }

  useEffect(() => {
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onKeyDown])
}
