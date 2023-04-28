import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export function useInterval(callback: () => void, delay?: number) {
  const savedCallback = useRef(callback)

  // Remember the latest callback if it changes.
  useLayoutEffect(() => {
    savedCallback.current = callback
  }, [callback])

  // Set up the interval.
  useEffect(() => {
    // Don't schedule if no delay is specified.
    // Note: 0 is a valid value for delay.
    if (!delay && delay !== 0)
      return

    const id = setInterval(() => savedCallback.current(), delay)
    return () => clearInterval(id)
  }, [delay])
}

export function useKeyPress(callback: (T?: any) => void, keys: string[]) {
  const onKeyDown = (event: KeyboardEvent) => {
    const wasAnyKeyPressed = keys.includes(event.key)

    if (wasAnyKeyPressed) {
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

export function useElementSize<T extends HTMLElement = HTMLDivElement>(): [
  (node: T | null) => void,
  { width: number; height: number },
] {
  const [ref, setRef] = useState<T | null>(null)
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  })

  // Prevent too many rendering using useCallback
  const handleSize = useCallback(() => {
    setSize({
      width: ref?.offsetWidth || 0,
      height: ref?.offsetHeight || 0,
    })
  }, [ref?.offsetHeight, ref?.offsetWidth])

  addEventListener('resize', handleSize)

  useLayoutEffect(() => {
    handleSize()
  }, [ref?.offsetHeight, ref?.offsetWidth])

  return [setRef, size]
}
