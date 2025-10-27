import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SupabaseDB, convertToLegacyRecipe } from '@/lib/supabase-db'

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
  try {
    const { recipe_id, visibility = 'unlisted' } = await request.json()
    
    // Get user from auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid authentication' },
        { status: 401 }
      )
    }
    
    const db = new SupabaseDB()
    
    // Verify user owns the recipe
    const recipe = await db.getRecipe(recipe_id)
    if (!recipe || recipe.owner_id !== user.id) {
      return NextResponse.json(
        { error: 'Recipe not found or access denied' },
        { status: 404 }
      )
    }
    
    // Create share link
    const share = await db.createRecipeShare(recipe_id, visibility)
    
    return NextResponse.json({
      share_slug: share.share_slug,
      share_url: `${request.nextUrl.origin}/r/${share.share_slug}`,
      visibility: share.visibility
    })
  } catch (error) {
    console.error('Error creating share:', error)
    return NextResponse.json(
      { error: 'Failed to create share' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const share_slug = searchParams.get('slug')
    
    if (!share_slug) {
      return NextResponse.json(
        { error: 'Share slug required' },
        { status: 400 }
      )
    }
    
    const db = new SupabaseDB()
    const recipe = await db.getRecipeByShareSlug(share_slug)
    
    if (!recipe) {
      return NextResponse.json(
        { error: 'Share not found' },
        { status: 404 }
      )
    }
    
    const legacyRecipe = convertToLegacyRecipe(recipe)
    
    return NextResponse.json(legacyRecipe)
  } catch (error) {
    console.error('Error fetching shared recipe:', error)
    return NextResponse.json(
      { error: 'Failed to fetch shared recipe' },
      { status: 500 }
    )
  }
}
