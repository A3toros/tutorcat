'use client'

import React from 'react'
import {
  CHARACTER_BASE,
  resolveCharacterLayers,
  type CharacterSelections,
} from '@/lib/characterBuilder/characterConfig'

type Props = {
  selection: CharacterSelections
  characterName?: string
  captureRef?: React.RefObject<HTMLDivElement | null>
  className?: string
}

function LayerImg({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
    />
  )
}

/** avatar_maker SideA layer order */
export default function CharacterCanvas({
  selection,
  characterName,
  captureRef,
  className = '',
}: Props) {
  const layers = resolveCharacterLayers(selection)

  return (
    <div
      className={`relative mx-auto w-full max-w-[320px] aspect-[3/4] rounded-2xl border-2 border-purple-200 bg-gradient-to-b from-purple-50 to-white overflow-hidden ${className}`}
    >
      <div ref={captureRef} className="relative w-full h-full">
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
          {characterName ? (
            <p className="text-sm font-bold text-purple-900 truncate max-w-[90%] z-10">{characterName}</p>
          ) : null}
        </div>
        <div className="absolute inset-0">
          <img src={CHARACTER_BASE.empty} alt="" className="invisible w-full h-full object-contain" aria-hidden />
          <LayerImg src={CHARACTER_BASE.body} />
          {layers ? (
            <>
              <LayerImg src={layers.skin} />
              <LayerImg src={layers.mouth} />
              <LayerImg src={layers.eyes} />
              {layers.hair ? <LayerImg src={layers.hair} /> : null}
              {layers.features ? <LayerImg src={layers.features} /> : null}
              {layers.shoes ? <LayerImg src={layers.shoes} /> : null}
              {layers.bottom ? <LayerImg src={layers.bottom} /> : null}
              <LayerImg src={layers.top} />
              {layers.extra ? <LayerImg src={layers.extra} /> : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
