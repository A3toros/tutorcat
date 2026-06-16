'use client'

import React, { useState } from 'react'
import type { CharacterCategory, CharacterCategoryId, CharacterSelections } from '@/lib/characterBuilder/characterConfig'

type Props = {
  categories: CharacterCategory[]
  selection: CharacterSelections
  onChange: (categoryId: CharacterCategoryId, optionId: string) => void
}

export default function CategoryPicker({ categories, selection, onChange }: Props) {
  const [openId, setOpenId] = useState<CharacterCategoryId | null>('skin')

  return (
    <div className="space-y-2">
      {categories.map((cat) => {
        const isOpen = openId === cat.id
        const current = selection[cat.id]
        const currentLabel =
          current === 'none' ? 'None' : current ? `#${current.replace(/\D+/g, '') || current}` : '—'

        return (
          <div key={cat.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : cat.id)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-50"
            >
              <span className="text-sm font-semibold text-slate-800">{cat.label}</span>
              <span className="text-xs text-purple-700 font-medium">{currentLabel}</span>
            </button>
            {isOpen ? (
              <div className="max-h-52 overflow-y-auto flex flex-wrap gap-2 px-3 pb-3 border-t border-slate-100 pt-2">
                {cat.options.map((opt) => {
                  const selected = current === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onChange(cat.id, opt.id)}
                      className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium min-h-[44px] min-w-[56px] touch-manipulation ${
                        selected
                          ? 'border-purple-500 bg-purple-50 text-purple-900 ring-2 ring-purple-200'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-purple-50/50'
                      }`}
                      title={opt.label}
                    >
                      {opt.thumbUrl ? (
                        <img src={opt.thumbUrl} alt="" className="w-10 h-10 object-contain bg-white ring-1 ring-slate-200 rounded" />
                      ) : null}
                      <span>{opt.label}</span>
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
