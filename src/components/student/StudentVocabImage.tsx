'use client'

import React, { useState } from 'react'

interface Props {
  src: string
  alt: string
  className?: string
}

/** Plain img — avoids Next.js image optimizer 404s on Commons SVGs. */
export default function StudentVocabImage({ src, alt, className = '' }: Props) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <span className={`text-[10px] text-slate-400 text-center px-1 ${className}`}>
        {failed ? '…' : '—'}
      </span>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`h-full w-full object-contain ${className}`}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}
