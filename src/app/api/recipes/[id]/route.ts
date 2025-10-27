import { NextRequest, NextResponse } from "next/server";
import { deleteRecipe, getRecipeById } from "@/lib/db";
import { createClient } from '@supabase/supabase-js';
import { SupabaseDB, convertToLegacyRecipe } from '@/lib/supabase-db';

// Check if Supabase is properly configured
const isSupabaseConfigured = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  return url && key && !url.includes('placeholder') && !key.includes('placeholder')
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Use Supabase if configured, otherwise fall back to file-based system
    if (isSupabaseConfigured()) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SECRET_KEY!
      );
      const db = new SupabaseDB();
      
      // Check if recipe exists
      const recipe = await db.getRecipe(id);
      if (!recipe) {
        return NextResponse.json(
          { error: "Recipe not found" },
          { status: 404 }
        );
      }
      
      // Delete the recipe
      await db.deleteRecipe(id);
      
      return NextResponse.json({ 
        success: true, 
        message: `Recipe "${recipe.title}" has been deleted` 
      });
    } else {
      // Fall back to file-based system
      // Check if recipe exists
      const recipe = await getRecipeById(id);
      if (!recipe) {
        return NextResponse.json(
          { error: "Recipe not found" },
          { status: 404 }
        );
      }
      
      // Delete the recipe
      const success = await deleteRecipe(id);
      
      if (!success) {
        return NextResponse.json(
          { error: "Failed to delete recipe" },
          { status: 500 }
        );
      }
      
      return NextResponse.json({ 
        success: true, 
        message: `Recipe "${recipe.title}" has been deleted` 
      });
    }
  } catch (error) {
    console.error("Error deleting recipe:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Use Supabase if configured, otherwise fall back to file-based system
    if (isSupabaseConfigured()) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
      );
      const db = new SupabaseDB();
      
      const recipe = await db.getRecipe(id);
      
      if (!recipe) {
        return NextResponse.json(
          { error: "Recipe not found" },
          { status: 404 }
        );
      }
      
      const legacyRecipe = convertToLegacyRecipe(recipe);
      return NextResponse.json(legacyRecipe);
    } else {
      // Fall back to file-based system
      const recipe = await getRecipeById(id);
      
      if (!recipe) {
        return NextResponse.json(
          { error: "Recipe not found" },
          { status: 404 }
        );
      }
      
      return NextResponse.json(recipe);
    }
  } catch (error) {
    console.error("Error fetching recipe:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Create a user version from a base recipe
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const { title, content_json, images, is_public } = body || {}

    // Auth user (optional but required for version creation)
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    )
    const authHeader = req.headers.get('authorization')
    let userId: string | null = null
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user } } = await supabase.auth.getUser(token)
      userId = user?.id || null
    }

    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const db = new SupabaseDB()
    const version = await db.createUserVersion(id, userId, { title, content_json, images, is_public })
    const legacy = convertToLegacyRecipe(version)
    return NextResponse.json(legacy)
  } catch (error) {
    console.error('Error creating version:', error)
    return NextResponse.json({ error: 'Failed to create version' }, { status: 500 })
  }
}
