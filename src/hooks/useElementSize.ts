import { useCallback, useLayoutEffect, useState } from 'react'

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
  }, [handleSize, ref?.offsetHeight, ref?.offsetWidth])

  return [setRef, size]
}
