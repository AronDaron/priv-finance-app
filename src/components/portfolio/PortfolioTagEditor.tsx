import { useState } from 'react'
import { updatePortfolioTags } from '../../lib/api'
import { PORTFOLIO_TAGS } from '../../lib/types'

interface Props {
  portfolioId: number
  currentTags: string[]
  onUpdate: (tags: string[]) => void
}

export default function PortfolioTagEditor({ portfolioId, currentTags, onUpdate }: Props) {
  const [open, setOpen] = useState(false)
  const availableTags = PORTFOLIO_TAGS.filter(t => !currentTags.includes(t))

  const removeTag = async (tag: string) => {
    const newTags = currentTags.filter(t => t !== tag)
    await updatePortfolioTags(portfolioId, newTags)
    onUpdate(newTags)
  }

  const addTag = async (tag: string) => {
    const newTags = [...currentTags, tag]
    await updatePortfolioTags(portfolioId, newTags)
    onUpdate(newTags)
    setOpen(false)
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {currentTags.map(tag => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-finance-green/20 text-finance-green border border-finance-green/30"
        >
          {tag}
          <button
            onClick={() => removeTag(tag)}
            className="hover:text-white transition-colors leading-none"
            title={`Usuń tag ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      {availableTags.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setOpen(o => !o)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-gray-400 hover:text-white border border-gray-600 hover:border-gray-400 transition-colors"
            title="Dodaj tag"
          >
            + tag
          </button>
          {open && (
            <div className="absolute top-full left-0 mt-1 z-10 bg-gray-800 border border-gray-600 rounded-lg shadow-lg py-1 min-w-[140px]">
              {availableTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => addTag(tag)}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
