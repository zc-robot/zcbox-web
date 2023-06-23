import { useEffect, useLayoutEffect, useRef } from 'react'

export function useInterval(callback: () => void, delay?: number) {
  const savedCallback = useRef(callback)
  const taskId = useRef<number | undefined>(undefined)

  // Remember the latest callback if it changes.
  useLayoutEffect(() => {
    savedCallback.current = callback
  }, [callback])

  // Set up the interval.
  useEffect(() => {
    // Clear any previous interval.
    if (taskId.current)
      clearInterval(taskId.current)

    // Don't schedule if no delay is specified.
    // Note: 0 is a valid value for delay.
    if (!delay && delay !== 0)
      return

    taskId.current = setInterval(() => savedCallback.current(), delay)
    return () => clearInterval(taskId.current)
  }, [delay])
}
