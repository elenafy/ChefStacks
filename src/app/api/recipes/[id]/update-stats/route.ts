import { NextRequest, NextResponse } from 'next/server';
import { SupabaseDB } from '@/lib/supabase-db';
import { extractRecipeFromWeb } from '@/lib/webRecipeExtractor.server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recipeId } = await params;
    
    if (!SupabaseDB.isConfigured()) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const db = new SupabaseDB();
    
    // Get the existing recipe
    const existingRecipe = await db.getRecipe(recipeId);
    if (!existingRecipe) {
      return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });
    }

    // Get the source URL
    const sourceUrl = existingRecipe.source_url;
    if (!sourceUrl) {
      return NextResponse.json({ error: 'Recipe has no source URL' }, { status: 400 });
    }

    console.log('🔄 Re-extracting stats for recipe:', existingRecipe.title);
    console.log('📄 Source URL:', sourceUrl);

    // Extract fresh data
    const freshData = await extractRecipeFromWeb(sourceUrl);
    
    console.log('📊 Fresh data extracted:');
    console.log('  Times:', freshData.times);
    console.log('  Servings:', freshData.servings);
    console.log('  Difficulty:', freshData.difficulty);

    // Update the recipe with fresh stats
    const updatedContentJson = {
      ...existingRecipe.content_json,
      stats: {
        prep: freshData.times?.prep_min || null,
        cook: freshData.times?.cook_min || null,
        serves: freshData.servings || null,
        difficulty: freshData.difficulty || null
      }
    };

    console.log('💾 Updating recipe in Supabase...');
    const updatedRecipe = await db.updateRecipe(recipeId, {
      content_json: updatedContentJson
    });

    console.log('✅ Recipe updated successfully!');
    console.log('New stats:', updatedRecipe.content_json.stats);

    return NextResponse.json({
      success: true,
      message: 'Recipe stats updated successfully',
      recipe: updatedRecipe,
      newStats: updatedRecipe.content_json.stats
    });

  } catch (error) {
    console.error('❌ Error updating recipe stats:', error);
    return NextResponse.json(
      { error: 'Failed to update recipe stats', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
