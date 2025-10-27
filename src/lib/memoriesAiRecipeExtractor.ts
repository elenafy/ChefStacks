// lib/memoriesAiRecipeExtractor.ts
// Integration layer between Memories.ai and our recipe system

import { MemoriesAiService, parseMemoriesAiRecipeResponse } from './memoriesAiService';
import { convertLegacyRecipe } from './supabase-db';

export interface MemoriesAiRecipeResult {
  success: boolean;
  recipe?: any; // Supabase-compatible recipe
  error?: string;
  processingTime?: number;
  videoNos?: string[];
}

export class MemoriesAiRecipeExtractor {
  private memoriesAi: MemoriesAiService;

  constructor(apiKey: string) {
    this.memoriesAi = new MemoriesAiService({ apiKey });
  }

  /**
   * Extract recipe from video URL and return Supabase-compatible format
   */
  async extractRecipeFromUrl(videoUrl: string, quality: '360' | '480' | '720' | '1080' | '1440' | '2160' = '720'): Promise<MemoriesAiRecipeResult> {
    try {
      console.log('🍳 Starting Memories.ai recipe extraction for:', videoUrl);
      
      // Extract recipe using Memories.ai
      const result = await this.memoriesAi.extractRecipeFromUrl(videoUrl, quality);
      
      // Parse the AI response
      const parsedRecipe = parseMemoriesAiRecipeResponse(result.recipeResponse);
      
      // Validate that we have the minimum required data
      if (!parsedRecipe.title || parsedRecipe.ingredients.length === 0 || parsedRecipe.steps.length === 0) {
        return {
          success: false,
          error: 'Insufficient recipe data extracted from video',
          processingTime: result.processingTime
        };
      }

      // Create Supabase-compatible recipe structure
      const supabaseRecipe = this.createSupabaseRecipe(videoUrl, parsedRecipe, result);
      
      console.log('✅ Memories.ai extraction successful:', {
        title: parsedRecipe.title,
        ingredients: parsedRecipe.ingredients.length,
        steps: parsedRecipe.steps.length,
        processingTime: result.processingTime
      });

      return {
        success: true,
        recipe: supabaseRecipe,
        processingTime: result.processingTime,
        videoNos: result.videoNos
      };

    } catch (error) {
      console.error('❌ Memories.ai extraction failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Create a Supabase-compatible recipe from parsed Memories.ai data
   */
  private createSupabaseRecipe(videoUrl: string, parsedRecipe: any, extractionResult: any) {
    const videoId = this.extractVideoId(videoUrl);
    const isYouTube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');
    const isTikTok = videoUrl.includes('tiktok.com');

    // Create the content_json structure for Supabase
    const contentJson = {
      subtitle: 'Extracted from video using Memories.ai',
      stats: {
        prep: parsedRecipe.times?.prep_min || null,
        cook: parsedRecipe.times?.cook_min || null,
        serves: parsedRecipe.servings || null,
        difficulty: parsedRecipe.difficulty || null
      },
      youtube: isYouTube ? {
        url: videoUrl,
        author: 'Video Creator',
        handle: '@creator',
        id: videoId
      } : null,
      tiktok: isTikTok ? {
        url: videoUrl,
        author: 'Video Creator',
        handle: '@creator'
      } : null,
      ingredients: parsedRecipe.ingredients.map((ing: any) => ({
        qty: ing.qty || '',
        item: ing.text,
        normalized: ing.text.toLowerCase(),
        source: 'memories-ai',
        confidence: 0.8
      })),
      steps: parsedRecipe.steps.map((step: any) => ({
        text: step.text,
        order: step.order,
        source: 'memories-ai',
        confidence: 0.8
      })),
      tips: parsedRecipe.tips,
      metadata: {
        quality: { score: 0.8 },
        channel: { title: 'Video Creator' },
        extraction: {
          method: 'memories-ai',
          processingTime: extractionResult.processingTime,
          videoNos: extractionResult.videoNos
        }
      },
      provenance: {
        extractionMethod: 'memories-ai',
        ingredientsFrom: 'memories-ai',
        stepsFrom: 'memories-ai',
        overallConfidence: 0.8
      }
    };

    // Create the legacy recipe format for backward compatibility
    const legacyRecipe = {
      id: `memories-ai-${Date.now()}`,
      title: parsedRecipe.title,
      subtitle: contentJson.subtitle,
      stats: contentJson.stats,
      youtube: contentJson.youtube,
      tiktok: contentJson.tiktok,
      ingredients: contentJson.ingredients.map((ing: any) => ({
        qty: ing.qty,
        item: ing.item,
        normalized: ing.normalized,
        source: ing.source,
        confidence: ing.confidence
      })),
      steps: contentJson.steps.map((step: any) => ({
        text: step.text,
        order: step.order,
        source: step.source,
        confidence: step.confidence
      })),
      tips: contentJson.tips,
      image: '', // Will be populated from video thumbnail if needed
      metadata: contentJson.metadata,
      provenance: contentJson.provenance
    };

    // Convert to Supabase format
    return convertLegacyRecipe(legacyRecipe);
  }

  /**
   * Extract video ID from URL
   */
  private extractVideoId(url: string): string | null {
    // YouTube
    const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    if (youtubeMatch) return youtubeMatch[1];

    // TikTok
    const tiktokMatch = url.match(/tiktok\.com\/@[^\/]+\/video\/(\d+)/);
    if (tiktokMatch) return tiktokMatch[1];

    return null;
  }
}

/**
 * Helper function to check if Memories.ai is configured
 */
export function isMemoriesAiConfigured(): boolean {
  return !!process.env.MEMORIES_AI_API_KEY;
}

/**
 * Create a MemoriesAiRecipeExtractor instance if API key is available
 */
export function createMemoriesAiExtractor(): MemoriesAiRecipeExtractor | null {
  const apiKey = process.env.MEMORIES_AI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ MEMORIES_AI_API_KEY not configured');
    return null;
  }
  return new MemoriesAiRecipeExtractor(apiKey);
}
