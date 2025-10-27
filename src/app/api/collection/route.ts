import { NextRequest, NextResponse } from "next/server"
import { createClient } from '@supabase/supabase-js'
import { SupabaseDB, convertToLegacyRecipe } from '@/lib/supabase-db'
import { getCollection } from '@/lib/db'

// Deduplicate recipes by base recipe - one version per base recipe
function normalizeUrl(raw?: string | null): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    // Lowercase host, drop www., strip trailing slash and query tracking params
    let host = u.host.toLowerCase()
    if (host.startsWith('www.')) host = host.slice(4)
    const pathname = u.pathname.replace(/\/$/, '') || '/'
    // Keep only stable params for common platforms (none for now)
    return `${host}${pathname}`
  } catch {
    // Fallback: naive normalization
    return raw.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')
  }
}

// Deduplicate recipes by canonical key:
// 1) normalized source_url when available; otherwise
// 2) base id (parent_id if present, else id)
function deduplicateRecipes(recipes: any[], userId?: string): any[] {
  // Group by canonical key
  const groups: { [key: string]: any[] } = {}
  for (const r of recipes) {
    const urlKey = normalizeUrl(r.source_url || r.web?.url)
    const baseKey = r.parent_id || r.id
    const key = urlKey || baseKey
    if (!groups[key]) groups[key] = []
    groups[key].push(r)
  }

  const pickBest = (versions: any[]): any => {
    // 1. User's own version
    const userVersion = userId ? versions.find(v => v.owner_id === userId) : null
    if (userVersion) return userVersion
    // 2. Most saved
    versions.sort((a, b) => (b.saves_count || 0) - (a.saves_count || 0))
    const topSaved = versions[0]
    // 3. If tie or no saves data, pick most recent
    const topSavedCount = topSaved?.saves_count || 0
    const tied = versions.filter(v => (v.saves_count || 0) === topSavedCount)
    if (tied.length <= 1) return topSaved
    tied.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    return tied[0]
  }

  const result: any[] = []
  for (const versions of Object.values(groups)) {
    if (versions.length === 1) {
      result.push(versions[0])
    } else {
      result.push(pickBest(versions))
    }
  }
  return result
}

// Check if Supabase is properly configured
const isSupabaseConfigured = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  return url && key && !url.includes('placeholder') && !key.includes('placeholder')
}

export async function GET(request: NextRequest) {
  try {
    // Fall back to original file-based system if Supabase is not configured
    if (!isSupabaseConfigured()) {
      const data = await getCollection()
      return NextResponse.json(data)
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    )
    const db = new SupabaseDB()
    
    // Get user from auth header if available
    const authHeader = request.headers.get('authorization')
    let user = null
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user: authUser } } = await supabase.auth.getUser(token)
      user = authUser
    }
    
    // Get user's collections
    const collections = await db.getUserCollections(user?.id)
    
    // Get recipes from the default collection (for backward compatibility)
    // For now, we'll create a default collection if it doesn't exist
    let defaultCollection = collections.find(c => c.name === 'My Collection')
    if (!defaultCollection) {
      defaultCollection = await db.createCollection('My Collection', user?.id)
    }
    
    // Get both saved recipes and user-generated recipes
    const savedRecipes = await db.getCollectionRecipes(defaultCollection.id)
    const userGeneratedRecipes = user?.id ? await db.getUserRecipes(user.id) : []
    
    // Debug logging
    console.log('Collection API Debug:', {
      userId: user?.id,
      savedRecipesCount: savedRecipes.length,
      userGeneratedRecipesCount: userGeneratedRecipes.length,
      savedRecipeIds: savedRecipes.map(r => r.id),
      userGeneratedRecipeIds: userGeneratedRecipes.map(r => r.id)
    })
    
    // Combine both sets of recipes, avoiding duplicates
    const allRecipes = [...savedRecipes]
    const savedRecipeIds = new Set(savedRecipes.map(r => r.id))
    
    // Add user-generated recipes that aren't already saved
    for (const recipe of userGeneratedRecipes) {
      if (!savedRecipeIds.has(recipe.id)) {
        allRecipes.push(recipe)
      }
    }
    
    // Apply deduplication logic to the combined list
    const deduplicatedRecipes = deduplicateRecipes(allRecipes, user?.id)
    
    console.log('Deduplication debug:', {
      totalRecipes: allRecipes.length,
      deduplicatedCount: deduplicatedRecipes.length,
      allRecipeIds: allRecipes.map(r => ({ id: r.id, title: r.title, parent_id: r.parent_id, owner_id: r.owner_id })),
      deduplicatedIds: deduplicatedRecipes.map(r => ({ id: r.id, title: r.title, parent_id: r.parent_id, owner_id: r.owner_id }))
    })
    
    const legacyRecipes = deduplicatedRecipes.map(convertToLegacyRecipe)
    
    return NextResponse.json(legacyRecipes)
  } catch (error) {
    console.error('Error fetching collection:', error)
    
    // Fall back to file-based system on error
    try {
      const data = await getCollection()
      return NextResponse.json(data)
    } catch (fallbackError) {
      console.error('Collection fallback also failed:', fallbackError)
      return NextResponse.json(
        { error: 'Failed to fetch collection' },
        { status: 500 }
      )
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { recipe_id, action, collection_id } = await request.json()
    
    // Check if recipe_id is a valid UUID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recipe_id)
    
    // Fall back to original file-based system if Supabase is not configured OR if recipe_id is not a UUID
    if (!isSupabaseConfigured() || !isUUID) {
      const { toggleSave } = await import('@/lib/db')
      await toggleSave(String(recipe_id))
      return NextResponse.json({ ok: true })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    )
    const db = new SupabaseDB()
    
    // Get user from auth header if available
    const authHeader = request.headers.get('authorization')
    let user = null
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user: authUser } } = await supabase.auth.getUser(token)
      user = authUser
      
      // Ensure user profile exists
      if (user?.id) {
        try {
          await db.ensureUserProfile(user.id)
        } catch (error) {
          console.error('Error ensuring user profile:', error)
          // Continue anyway, the operation might still work
        }
      }
    }
    
    // Get or create default collection
    const collections = await db.getUserCollections(user?.id)
    let defaultCollection = collections.find(c => c.name === 'My Collection')
    if (!defaultCollection) {
      defaultCollection = await db.createCollection('My Collection', user?.id)
    }
    
    const targetCollectionId = collection_id || defaultCollection.id
    
    if (action === 'add') {
      await db.addRecipeToCollection(targetCollectionId, recipe_id)
      try { await db.incrementSavesCount(recipe_id, 1) } catch {}
    } else if (action === 'remove') {
      await db.removeRecipeFromCollection(targetCollectionId, recipe_id)
      try { await db.incrementSavesCount(recipe_id, -1) } catch {}
    } else {
      // Toggle action - check if recipe is user-generated or manually saved
      const userGeneratedRecipes = user?.id ? await db.getUserRecipes(user.id) : []
      const isUserGenerated = userGeneratedRecipes.some(r => r.id === recipe_id)
      
      if (isUserGenerated) {
        // User-generated recipes can't be "unsaved" - they're always in the collection
        // But we can still add them to the manual collection for organization
        const collectionRecipes = await db.getCollectionRecipes(targetCollectionId)
        const isManuallySaved = collectionRecipes.some(r => r.id === recipe_id)
        
        if (!isManuallySaved) {
          await db.addRecipeToCollection(targetCollectionId, recipe_id)
          try { await db.incrementSavesCount(recipe_id, 1) } catch {}
        }
        // If already manually saved, do nothing (can't remove user-generated recipes)
      } else {
        // For non-user-generated recipes, use normal toggle logic
        const collectionRecipes = await db.getCollectionRecipes(targetCollectionId)
        const isInCollection = collectionRecipes.some(r => r.id === recipe_id)
        
        if (isInCollection) {
          await db.removeRecipeFromCollection(targetCollectionId, recipe_id)
          try { await db.incrementSavesCount(recipe_id, -1) } catch {}
        } else {
          await db.addRecipeToCollection(targetCollectionId, recipe_id)
          try { await db.incrementSavesCount(recipe_id, 1) } catch {}
        }
      }
    }
    
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error updating collection:', error)
    
    // Fall back to file-based system on error
    try {
      const { toggleSave } = await import('@/lib/db')
      const { recipe_id: fallbackRecipeId } = await request.json()
      await toggleSave(String(fallbackRecipeId))
      return NextResponse.json({ ok: true })
    } catch (fallbackError) {
      console.error('Collection toggle fallback also failed:', fallbackError)
      return NextResponse.json(
        { error: 'Failed to update collection' },
        { status: 500 }
      )
    }
  }
}
