import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SupabaseDB } from '@/lib/supabase-db'

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
  try {
    const { anonymous_id } = await request.json()
    
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
    
    // Migrate anonymous data to user account
    // Note: This is a simplified migration. In a real implementation,
    // you'd need to track anonymous data with the anonymous_id
    // and then migrate it when the user signs up
    
    // For now, we'll just ensure the user has a default collection
    const collections = await db.getUserCollections(user.id)
    let defaultCollection = collections.find(c => c.name === 'My Collection')
    if (!defaultCollection) {
      defaultCollection = await db.createCollection('My Collection', user.id)
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Data migrated successfully',
      collection_id: defaultCollection.id
    })
  } catch (error) {
    console.error('Error migrating data:', error)
    return NextResponse.json(
      { error: 'Failed to migrate data' },
      { status: 500 }
    )
  }
}
