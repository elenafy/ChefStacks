import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SupabaseDB, convertToLegacyRecipe } from '@/lib/supabase-db'
import { listRecipes } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    // Fall back to original file-based system if Supabase is not configured
    if (!SupabaseDB.isConfigured()) {
      const { searchParams } = new URL(request.url)
      const q = searchParams.get('q')
      const recipes = await listRecipes(q || undefined)
      return NextResponse.json(recipes)
    }

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')
    const userId = searchParams.get('user_id')
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? Math.max(1, Math.min(200, parseInt(limitParam, 10) || 0)) : undefined
    
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
    
    let recipes
    if (userId === 'public') {
      recipes = await db.getCommunityFeed(limit ?? 100)
    } else if (user) {
      // Show user's own recipes (their versions and any they own)
      recipes = await db.getUserRecipes(user.id)
    } else {
      // For anonymous users, show community feed
      recipes = await db.getCommunityFeed(limit ?? 100)
    }
    
    // Convert to legacy format for backward compatibility
    const legacyRecipes = recipes.map(convertToLegacyRecipe)

    // If Supabase returned no recipes, return an empty list (no file-based fallback)
    if (!legacyRecipes || legacyRecipes.length === 0) {
      return NextResponse.json([])
    }
    
    // Apply search filter if provided
    if (q) {
      const searchTerm = q.toLowerCase()
      const filtered = legacyRecipes.filter(recipe => 
        recipe.title.toLowerCase().includes(searchTerm) ||
        recipe.subtitle.toLowerCase().includes(searchTerm)
      )
      const res = NextResponse.json(filtered)
      // Cache public filtered responses briefly at the edge
      if (!user || userId === 'public') {
        res.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
      }
      return res
    }
    
    const res = NextResponse.json(legacyRecipes)
    // Cache public community feed responses at the edge
    if (!user || userId === 'public') {
      res.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
    }
    return res
  } catch (error) {
    console.error('Error fetching recipes:', error)
    // Return empty array to avoid falling back to file-based data for community feed
    return NextResponse.json([])
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { recipe, owner_id } = body
    
    const db = new SupabaseDB()
    
    // Get user from auth header if available
    const authHeader = request.headers.get('authorization')
    let user = null
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
      )
      const { data: { user: authUser } } = await supabase.auth.getUser(token)
      user = authUser
    }
    
    // Check rate limit
    const rateLimit = await db.checkRateLimit(user?.id)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Rate limit exceeded. You can create ${rateLimit.remaining} more recipes today.` },
        { status: 429 }
      )
    }
    
    const newRecipe = await db.createRecipe(recipe, user?.id || owner_id)
    const legacyRecipe = convertToLegacyRecipe(newRecipe)
    
    return NextResponse.json(legacyRecipe)
  } catch (error) {
    console.error('Error creating recipe:', error)
    return NextResponse.json(
      { error: 'Failed to create recipe' },
      { status: 500 }
    )
  }
}