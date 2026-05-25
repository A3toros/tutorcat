'use client'

import { useEffect, useState } from 'react'

/** True on phones/tablets — HTML5 drag often fails; prefer tap UX. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const update = () => {
      setCoarse(mq.matches || 'ontouchstart' in window)
    }
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return coarse
}
