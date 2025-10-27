'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import RecipeTile from '@/components/RecipeTile'
import Navigation from '@/components/Navigation'
import { ArrowLeft, Share2 } from 'lucide-react'
import Link from 'next/link'

export default function SharedRecipePage() {
  const params = useParams()
  const slug = params.slug as string
  const [recipe, setRecipe] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchSharedRecipe = async () => {
      try {
        const response = await fetch(`/api/share?slug=${slug}`)
        if (!response.ok) {
          throw new Error('Recipe not found')
        }
        const data = await response.json()
        setRecipe(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load recipe')
      } finally {
        setLoading(false)
      }
    }

    if (slug) {
      fetchSharedRecipe()
    }
  }, [slug])

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6">
        <div className="mb-6">
          <Navigation />
        </div>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-slate-600">Loading recipe...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6">
        <div className="mb-6">
          <Navigation />
        </div>
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-red-100 rounded-xl mb-4">
            <Share2 className="h-20 w-20 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Recipe Not Found</h1>
          <p className="text-slate-600 mb-6">{error}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6">
      <div className="mb-6">
        <Navigation />
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Shared Recipe</h1>
          <p className="text-slate-600">This recipe was shared with you</p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>
      </div>

      <div className="max-w-4xl mx-auto">
        <RecipeTile recipe={recipe} />
      </div>
    </div>
  )
}
