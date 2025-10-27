/**
 * YouTubeMetadataExtractor (Nano-only)
 *
 * Description-first extractor using the YouTube Data API metadata (title + full description)
 * and GPT-5-nano to produce a structured Recipe Card.
 *
 * - Always calls GPT-5-nano (no pattern gating). Optional single retry with a wider slice.
 * - Deterministically parses CHAPTERS/TIMESTAMPS from the description.
 * - Strict JSON output; provenance spans use description character offsets.
 * - Caches by (videoId, descriptionHash, extractorVersion) to avoid repeat costs.
 */

import OpenAI from 'openai';
import { createYouTubeAPI, YouTubeDataAPI } from '../youtubeDataApi';
import { parseYouTubeId } from '../youtube';
import { validateAIResponse } from '../schemas/apiExtractionSchema';
import {
  normalizeIngredient,
  extractTimeInfo,
  calculateConfidenceWithPrior,
  validateProvenance
} from '../normalization/normalizationUtils';
import { loadEnvironmentVariables, getEnvVar } from '../utils/env';

// =========================
// Types (mirrors unified schema used elsewhere)
// =========================
export interface VideoContext {
  videoId: string;
  title: string;
  durationSec: number;
  chapters: Array<{ title: string; startTimeSec: number }>;
  channel: { name: string; subs: number };
  thumbnails: string[];
}

export interface SourceContext {
  descriptionText: string;
  descriptionCharOffsets: boolean; // required for provenance spans
}

export interface MetadataExtractionInput {
  videoContext: VideoContext;
  sourceContext: SourceContext;
}

export interface ProvenanceSpan {
  source: 'description' | 'transcript';
  span: [number, number];
  confidence: number;
}

export interface UnifiedIngredient {
  raw: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  preparation: string | null;
  alternatives: string[];
  prov: ProvenanceSpan[];
}

export interface UnifiedStep {
  index: number;
  text: string;
  mentionsIngredients: string[];
  startTimeSec: number | null;
  endTimeSec: number | null;
  chapterTitle: string | null;
  prov: ProvenanceSpan[];
  confidence: number;
}

export interface UnifiedRecipeCard {
  title: string | null;
  servings: number | null;
  totalTimeMin: number | null;
  prepTimeMin: number | null;
  cookTimeMin: number | null;
  difficulty: string | null;
  ingredients: UnifiedIngredient[];
  steps: UnifiedStep[];
  notes: string[];
  chapters: Array<{ title: string; startTimeSec: number; endTimeSec?: number | null }>;
  media: { videoId: string | null; thumbnails: string[]; deepLinks: string[] };
  channel?: { name: string; subs: number };
  conf: { fields: Record<string, number>; overall: number | null };
  prov: Record<string, any>;
}

export interface MetadataExtractionResult {
  recipe: UnifiedRecipeCard;
  extractionConfidence: number;
  warnings?: string[];
  errors?: string[];
}

// =========================
// Config & utilities
// =========================
const EXTRACTOR_VERSION = 'yt_meta_nano_v1';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_DESC_CHARS = 8000; // generous but capped
const RETRY_MIN_STEPS = 6;   // retry wide if below this

// tiny FNV-1a hash for deterministic cache keys
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0).toString(16);
}
const memoryCache = new Map<string, { createdAt: number; result: MetadataExtractionResult }>();

// =========================
// Extractor
// =========================
export class YouTubeMetadataExtractor {
  private youtubeAPI: YouTubeDataAPI | null;
  private openai: OpenAI;

  constructor() {
    loadEnvironmentVariables();
    this.youtubeAPI = createYouTubeAPI();
    this.openai = new OpenAI({ apiKey: getEnvVar('OPENAI_API_KEY') });
  }

  /**
   * Main API-first method (Nano-only)
   */
  async extractRecipe(url: string, opts: { forceWideRetry?: boolean } = {}): Promise<MetadataExtractionResult> {
    const vc = await this.getVideoContext(url);
    if (!vc) throw new Error('Failed to get video metadata');

    const desc = vc.sourceContext.descriptionText || '';
    const filtered = this.extractRecipeExcerpt(desc, MAX_DESC_CHARS);

    const input: MetadataExtractionInput = {
      videoContext: {
        videoId: vc.videoId,
        title: vc.title,
        durationSec: vc.durationSec,
        chapters: (vc.chapters || []).slice(0, 12), // keep first 12 to save tokens
        channel: vc.channel,
        thumbnails: [] // thumbnails not needed for extraction
      },
      sourceContext: { descriptionText: filtered.raw, descriptionCharOffsets: true }
    };

    // Cache
    const cacheKey = `${vc.videoId}:${EXTRACTOR_VERSION}:${fnv1a(input.sourceContext.descriptionText)}`;
    const cached = memoryCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
      return cached.result;
    }

    // Nano call #1 (excerpt)
    let aiResult = await this.extractWithAI(input);

    // Optional retry with wider context if steps look thin
    const needRetry = opts.forceWideRetry || ((aiResult.recipe.steps?.length || 0) < RETRY_MIN_STEPS && filtered.raw.length < desc.length);
    if (needRetry) {
      const retryInput: MetadataExtractionInput = {
        videoContext: input.videoContext,
        sourceContext: { descriptionText: desc.slice(0, MAX_DESC_CHARS), descriptionCharOffsets: true }
      };
      const retry = await this.extractWithAI(retryInput);
      if ((retry.recipe.steps?.length || 0) > (aiResult.recipe.steps?.length || 0)) aiResult = retry;
    }

    // Decorate media and chapters (deterministic)
    aiResult.recipe.media = {
      videoId: vc.videoId,
      thumbnails: vc.thumbnails,
      deepLinks: aiResult.recipe.steps.filter(s => s.startTimeSec != null).map(s => `https://youtu.be/${vc.videoId}?t=${Math.max(0, Math.floor(s.startTimeSec!))}`)
    };
    // Always set parsed chapters from description
    aiResult.recipe.chapters = vc.chapters.map(c => ({ title: c.title, startTimeSec: c.startTimeSec }));

    // Add channel information to the result
    aiResult.recipe.channel = {
      name: vc.channel.name,
      subs: vc.channel.subs
    };


    memoryCache.set(cacheKey, { createdAt: Date.now(), result: aiResult });
    return aiResult;
  }

  // =========================
  // Low-level helpers
  // =========================
  async getVideoContext(url: string): Promise<{
    videoId: string;
    title: string;
    durationSec: number;
    chapters: Array<{ title: string; startTimeSec: number }>;
    channel: { name: string; subs: number };
    thumbnails: string[];
    sourceContext: { descriptionText: string };
  } | null> {
    if (!this.youtubeAPI) throw new Error('YouTube Data API not configured');

    const videoId = parseYouTubeId(url);
    if (!videoId) throw new Error('Invalid YouTube URL');

    const videoData = await this.youtubeAPI.getVideoData(videoId);
    if (!videoData) return null;
    

    // Channel fetch is optional; keep cheap
    let subs = 0;
    try {
      const channelData = await this.youtubeAPI.getChannelData(videoData.channelId);
      subs = parseInt(channelData?.subscriberCount || '0') || 0;
    } catch { /* ignore */ }

    const description = videoData.description || '';
    const chapters = this.extractChaptersFromDescription(description);

    const channelInfo = { name: videoData.channelTitle || '', subs };
    
    return {
      videoId,
      title: videoData.title,
      durationSec: YouTubeDataAPI.parseDuration(videoData.duration),
      chapters,
      channel: channelInfo,
      thumbnails: [videoData.thumbnailUrl].filter(Boolean),
      sourceContext: { descriptionText: description }
    };
  }

  private extractChaptersFromDescription(description: string): Array<{ title: string; startTimeSec: number }> {
    if (!description) return [];
    const out: Array<{ title: string; startTimeSec: number }> = [];

    // Pattern 1: Traditional chapter markers "0:00 Intro" | "00:00:00 Intro"
    const lineRe = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(description)) !== null) {
      const ts = this.parseTimestamp(m[1]);
      const title = (m[2] || '').trim();
      if (ts >= 0 && title) out.push({ title, startTimeSec: ts });
    }

    // Pattern 2: Section headers that could serve as chapters (BIGA, AUTOLYSE, etc.)
    const sectionHeaders = [
      'BIGA', 'AUTOLYSE', 'FINAL MIX', 'FERMENTING AND SHAPING', 'BAKING',
      'INGREDIENTS', 'INSTRUCTIONS', 'METHOD', 'STEPS', 'PREPARATION'
    ];
    
    const lines = description.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check if this line is a section header
      for (const header of sectionHeaders) {
        if (line.toUpperCase().includes(header) && line.length < 50) {
          // Look for timestamps in nearby lines (within 3 lines)
          let timestamp = -1;
          for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 3); j++) {
            const nearbyLine = lines[j];
            const timestampMatch = nearbyLine.match(/@?(\d{1,2}:\d{2}(?::\d{2})?)/);
            if (timestampMatch) {
              timestamp = this.parseTimestamp(timestampMatch[1]);
              break;
            }
          }
          
          // If no timestamp found, estimate based on position in description
          if (timestamp === -1) {
            const progress = i / lines.length;
            timestamp = Math.floor(progress * 1800); // Estimate max 30 minutes
          }
          
          if (timestamp >= 0) {
            out.push({ title: line, startTimeSec: timestamp });
          }
          break;
        }
      }
    }

    // Pattern 3: Look for embedded timestamps with context as chapter titles
    const embeddedTimestampRe = /@(\d{1,2}:\d{2}(?::\d{2})?)/g;
    let embeddedMatch: RegExpExecArray | null;
    while ((embeddedMatch = embeddedTimestampRe.exec(description)) !== null) {
      const ts = this.parseTimestamp(embeddedMatch[1]);
      if (ts >= 0) {
        // Find the context around this timestamp
        const contextStart = Math.max(0, embeddedMatch.index - 100);
        const contextEnd = Math.min(description.length, embeddedMatch.index + 100);
        const context = description.substring(contextStart, contextEnd);
        
        // Extract a meaningful title from the context
        const sentences = context.split(/[.!?]/);
        let title = 'Step';
        for (const sentence of sentences) {
          if (sentence.includes(embeddedMatch[0])) {
            const words = sentence.trim().split(/\s+/).slice(0, 6);
            if (words.length > 2) {
              title = words.join(' ');
              break;
            }
          }
        }
        
        out.push({ title, startTimeSec: ts });
      }
    }

    // Dedup by start time, keep earliest title
    const dedup = new Map<number, string>();
    for (const c of out) if (!dedup.has(c.startTimeSec)) dedup.set(c.startTimeSec, c.title);

    return Array.from(dedup.entries())
      .map(([startTimeSec, title]) => ({ title, startTimeSec }))
      .sort((a, b) => a.startTimeSec - b.startTimeSec);
  }

  private parseTimestamp(ts: string): number {
    const p = ts.split(':').map(Number);
    if (p.length === 2) {
      const minutes = p[0];
      const seconds = p[1];
      
      // Validate timestamp - reject unreasonable values
      if (minutes > 60 || seconds >= 60) {
        console.warn(`⚠️ Invalid timestamp format: "${ts}" - minutes: ${minutes}, seconds: ${seconds}`);
        return -1;
      }
      
      return minutes * 60 + seconds;
    }
    if (p.length === 3) {
      const hours = p[0];
      const minutes = p[1];
      const seconds = p[2];
      
      // Validate timestamp - reject unreasonable values
      if (hours > 10 || minutes >= 60 || seconds >= 60) {
        console.warn(`⚠️ Invalid timestamp format: "${ts}" - hours: ${hours}, minutes: ${minutes}, seconds: ${seconds}`);
        return -1;
      }
      
      return hours * 3600 + minutes * 60 + seconds;
    }
    return -1;
  }

  /**
   * Keep only the most relevant portion of the description: Instructions + Ingredients.
   * Works across English/Spanish/Chinese headings, falls back to a mid slice if not found.
   */
  private extractRecipeExcerpt(description: string, maxChars: number): { raw: string } {
    if (!description) return { raw: '' };

    let content = description
      .replace(/https?:\/\/\S+/g, '')
      .replace(/amazon\.[^\s]+/gi, '')
      .replace(/\n{3,}/g, '\n\n');

    const headersIng = /(ingredients?|ingredientes?|材料|配料)\s*[:：]?/i;
    const headersInstr = /(instructions?|method|directions?|preparation|preparaci[oó]n|how to make|步骤|做法)\s*[:：]?/i;

    const slice = (src: string, re: RegExp) => {
      const reLine = new RegExp(`(^|\\n)\\s*${re.source}.*`, 'i');
      const m = src.match(reLine);
      if (!m) return '';
      const startIdx = m.index ?? 0;
      const tail = src.slice(startIdx);
      const endMatch = tail.search(/\n[A-Z][A-Za-z\s]{2,}:|\n#{1,3}\s|\nCHAPTERS?/);
      const endIdx = endMatch > 0 ? startIdx + endMatch : src.length;
      return src.slice(startIdx, endIdx).trim();
    };

    const ingBlock = slice(content, headersIng);
    const instrBlock = slice(content, headersInstr);
    let excerpt = [instrBlock, ingBlock].filter(Boolean).join('\n\n');

    if (!excerpt) {
      const midStart = Math.max(0, Math.floor(content.length * 0.1));
      excerpt = content.slice(midStart, midStart + maxChars);
    }

    if (excerpt.length > maxChars) excerpt = excerpt.slice(0, maxChars);
    return { raw: excerpt.trim() };
  }

  private getSystemPrompt(): string {
    return 'Return ONLY a single JSON object. Start with \'{\' end with \'}\'. You are a precise recipe extractor. Never invent values.';
  }

  private buildUserPrompt(input: MetadataExtractionInput): string {
    return `VIDEO_CONTEXT:\n${JSON.stringify({
      videoId: input.videoContext.videoId,
      title: input.videoContext.title,
      durationSec: input.videoContext.durationSec,
      chapters: input.videoContext.chapters
    }, null, 2)}\n\nSOURCE_CONTEXT (DESCRIPTION EXCERPT):\n<<<\n${input.sourceContext.descriptionText}\n>>>\n\nTASK:\n- Extract ONLY what is explicitly present in SOURCE_CONTEXT or the provided VIDEO_CONTEXT.
- Title: extract from VIDEO_CONTEXT title if available.\n- For every item, include confidences (0..1) and description provenance spans [start_char, end_char].\n- Ingredients: normalize (name/quantity/unit/preparation), keep exact 'raw' text. For quantities, keep fractions as text (e.g., "1/3", "1/2", "2/3") - do not convert to decimals.\n- Steps: detailed, step-by-step instructions preserving all sub-steps and details from the source. Extract timestamps from text (e.g., @3:33, @4:27) and convert to startTimeSec. Do NOT summarize or condense - preserve the full detail of each instruction.\n- Times/Servings/Difficulty: include ONLY if explicit.\n- Chapters: extract from description text patterns like "0:00 Intro", section headers (BIGA, AUTOLYSE, etc.), or copy from VIDEO_CONTEXT.\n- If nothing is found, return empty arrays/nulls.\n\nRETURN JSON ONLY (no prose):\n{\n  \"recipe\": {\n    \"title\": null,\n    \"servings\": null,\n    \"totalTimeMin\": null,\n    \"prepTimeMin\": null,\n    \"cookTimeMin\": null,\n    \"difficulty\": null,\n    \"ingredients\": [],\n    \"steps\": [],\n    \"notes\": [],\n    \"chapters\": [],\n    \"media\": { \"videoId\": null, \"thumbnails\": [], \"deepLinks\": [] },\n    \"conf\": { \"fields\": {}, \"overall\": null },\n    \"prov\": {}\n  },\n  \"extractionConfidence\": 0.0\n}`;
  }

  private async extractWithAI(input: MetadataExtractionInput): Promise<MetadataExtractionResult> {
    // Use Responses API for gpt-5-nano (not Chat Completions) with timeout protection
    const response = await Promise.race([
      this.openai.responses.create({
        model: 'gpt-5-nano',
        input: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: this.buildUserPrompt(input) }
        ],
        text: {
          format: {
            type: 'text'
          },
          verbosity: 'low'
        },
        reasoning: {
          effort: 'low'
        },
        tools: [],
        store: false
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('OpenAI API timeout after 15 seconds')), 15000)
      )
    ]);

    // Use the convenience text property from Responses API
    const raw = response.output_text || '';
    console.log('🔍 AI Response (first 500 chars):', raw.substring(0, 500));
    
    // Extract JSON using brace-slice trick
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    
    if (start === -1 || end === -1 || start >= end) {
      console.error('❌ No JSON object found in response');
      console.error('Raw response:', raw);
      throw new Error('AI returned non-JSON');
    }
    
    const jsonText = raw.slice(start, end + 1);
    let parsed: any;
    try { 
      parsed = JSON.parse(jsonText); 
    } catch (e) {
      console.error('❌ JSON Parse Error:', e instanceof Error ? e.message : String(e));
      console.error('Raw response:', raw);
      console.error('Extracted JSON text:', jsonText);
      throw new Error('AI returned non-JSON');
    }

    // Normalize the response before validation to fix common issues
    const normalized = this.normalizeAIResponse(parsed);
    
    // Schema validation
    const validation = validateAIResponse(normalized);
    if (!validation.valid) {
      console.warn('⚠️ Schema validation warnings:', validation.errors?.join(', '));
      // Continue with normalized response instead of failing
    }

    return this.validateAndNormalizeResult(normalized);
  }

  private normalizeAIResponse(parsed: any): any {
    // Ensure recipe object exists
    if (!parsed.recipe) {
      parsed.recipe = {};
    }

    // Normalize ingredients
    if (parsed.recipe.ingredients && Array.isArray(parsed.recipe.ingredients)) {
      parsed.recipe.ingredients = parsed.recipe.ingredients.map((ing: any, i: number) => ({
        raw: typeof ing.raw === 'string' ? ing.raw : (ing.name || ''),
        name: ing.name || '',
        quantity: ing.quantity ?? null,
        unit: ing.unit ?? null,
        preparation: ing.preparation ?? null,
        alternatives: Array.isArray(ing.alternatives) ? ing.alternatives : [],
        prov: Array.isArray(ing.prov) ? ing.prov : []
      }));
    }

    // Normalize steps
    if (parsed.recipe.steps && Array.isArray(parsed.recipe.steps)) {
      parsed.recipe.steps = parsed.recipe.steps.map((step: any, i: number) => {
        // Try to extract text from various possible fields
        let stepText = '';
        if (typeof step.text === 'string' && step.text.trim()) {
          stepText = step.text;
        } else if (typeof step.description === 'string' && step.description.trim()) {
          stepText = step.description;
        } else if (typeof step.instruction === 'string' && step.instruction.trim()) {
          stepText = step.instruction;
        } else if (typeof step === 'string' && step.trim()) {
          stepText = step;
        } else if (step && typeof step === 'object') {
          // Try to find any string value in the step object
          const possibleText = Object.values(step).find(val => typeof val === 'string' && val.trim());
          if (possibleText) stepText = possibleText as string;
        }
        
        return {
          index: typeof step.index === 'number' ? step.index : i + 1,
          text: stepText,
          mentionsIngredients: Array.isArray(step.mentionsIngredients) ? step.mentionsIngredients : [],
          startTimeSec: step.startTimeSec ?? null,
          endTimeSec: step.endTimeSec ?? null,
          chapterTitle: step.chapterTitle ?? null,
          prov: Array.isArray(step.prov) ? step.prov : [],
          confidence: typeof step.confidence === 'number' ? step.confidence : 0.6
        };
      });
    }

    return parsed;
  }

  private validateAndNormalizeResult(result: any): MetadataExtractionResult {
    const recipe = result.recipe as UnifiedRecipeCard;

    recipe.ingredients ||= [];
    recipe.steps ||= [];
    recipe.notes ||= [];
    recipe.chapters ||= [];
    recipe.media ||= { videoId: null, thumbnails: [], deepLinks: [] };
    recipe.conf ||= { fields: {}, overall: null };
    recipe.prov ||= {};

    // Normalize ingredients
    recipe.ingredients = recipe.ingredients.map((ing, i) => {
      try {
        const n = normalizeIngredient({
          raw: ing.raw || '',
          name: ing.name || '',
          quantity: ing.quantity ?? null,
          unit: ing.unit ?? null,
          preparation: ing.preparation ?? null,
          prov: Array.isArray(ing.prov) ? ing.prov : []
        });
        return { ...n, alternatives: n.alternatives || [] };
      } catch {
        return {
          raw: ing.raw || '',
          name: ing.name || '',
          quantity: null,
          unit: null,
          preparation: null,
          alternatives: [],
          prov: [{ source: 'description' as const, span: [0, (ing.raw || '').length] as [number, number], confidence: 0.1 }]
        };
      }
    });

    // Validate steps
    recipe.steps = recipe.steps.map((s, idx) => {
      try { validateProvenance(s, `step ${idx}`); } catch {}
      return {
        index: s.index || idx + 1,
        text: s.text || '',
        mentionsIngredients: s.mentionsIngredients || [],
        startTimeSec: s.startTimeSec ?? null,
        endTimeSec: s.endTimeSec ?? null,
        chapterTitle: s.chapterTitle ?? null,
        prov: Array.isArray(s.prov) ? s.prov : [],
        confidence: calculateConfidenceWithPrior(Math.max(0, Math.min(1, s.confidence || 0.6)), 'description')
      };
    });

    // Fill times from text if absent
    if (!recipe.totalTimeMin && !recipe.prepTimeMin && !recipe.cookTimeMin) {
      const t = extractTimeInfo([ ...recipe.notes, ...recipe.steps.map(s => s.text) ].join(' '));
      recipe.totalTimeMin = t.totalTimeMin || null;
      recipe.prepTimeMin = t.prepTimeMin || null;
      recipe.cookTimeMin = t.cookTimeMin || null;
    }

    // Compute confidences
    const ingC = recipe.ingredients.length ? recipe.ingredients.reduce((a, ing) => a + (ing.prov?.[0]?.confidence || 0.6), 0) / recipe.ingredients.length : 0;
    const stepC = recipe.steps.length ? recipe.steps.reduce((a, s) => a + (s.confidence || 0.6), 0) / recipe.steps.length : 0;
    const overall = calculateConfidenceWithPrior((ingC + stepC) / 2, 'description');

    recipe.conf.overall = overall;
    recipe.conf.fields = {
      ingredients: calculateConfidenceWithPrior(ingC, 'description'),
      steps: calculateConfidenceWithPrior(stepC, 'description'),
      title: recipe.title ? calculateConfidenceWithPrior(0.8, 'description') : 0,
      servings: recipe.servings ? calculateConfidenceWithPrior(0.7, 'description') : 0,
      times: (recipe.totalTimeMin || recipe.prepTimeMin || recipe.cookTimeMin) ? calculateConfidenceWithPrior(0.6, 'description') : 0
    };

    return { recipe, extractionConfidence: recipe.conf.overall || (result.extractionConfidence ?? 0.0) };
  }
}

export const ytMetadataExtractor = new YouTubeMetadataExtractor();
