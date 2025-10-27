/**
 * YouTubeMetadataExtractor (Nano-only) v2
 *
 * Description-first extractor that uses YouTube Data API metadata (title + full description)
 * and GPT-5-nano via the **Responses API** to produce a structured Recipe Card.
 *
 * Fixes vs v1:
 * - Switches to Responses API (nano-friendly). No temperature/top_p/response_format.
 * - Strong anti-summarization prompt: **DO NOT CONDENSE**; preserve step granularity.
 * - Auto-detects compressed output; retries with a stricter verbatim prompt variant.
 * - Robust JSON brace-slice parser from `response.output_text`.
 * - Same schema + normalization utils as before; deterministic chapters parsing.
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
// Types
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
  descriptionCharOffsets: boolean;
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
  videoTimestampUrl?: string | null;
  formattedTimestamp?: string | null;
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
const EXTRACTOR_VERSION = 'yt_meta_nano_v2';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_DESC_CHARS = 8000;
const RETRY_MIN_STEPS = 6;

function fnv1a(str: string): string { let h=0x811c9dc5; for (let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h+=(h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24);} return (h>>>0).toString(16) }
const memoryCache = new Map<string, { createdAt: number; result: MetadataExtractionResult }>();

export class YouTubeMetadataExtractorV2 {
  private youtubeAPI: YouTubeDataAPI | null;
  private openai: OpenAI;
  constructor() {
    loadEnvironmentVariables();
    this.youtubeAPI = createYouTubeAPI();
    this.openai = new OpenAI({ apiKey: getEnvVar('OPENAI_API_KEY') });
  }

  async extractRecipe(url: string, opts: { forceWideRetry?: boolean } = {}): Promise<MetadataExtractionResult> {
    const vc = await this.getVideoContext(url);
    if (!vc) throw new Error('Failed to get video metadata');

    const desc = vc.sourceContext.descriptionText || '';
    const filtered = this.extractRecipeExcerpt(desc, MAX_DESC_CHARS);

    // Fast-return: if no meaningful description content, skip AI and return insufficient result
    if (!filtered.raw || !filtered.raw.trim()) {
      return {
        recipe: {
          title: vc.title || null,
          servings: null,
          totalTimeMin: null,
          prepTimeMin: null,
          cookTimeMin: null,
          difficulty: null,
          ingredients: [],
          steps: [],
          notes: [],
          chapters: this.extractChaptersFromDescription(desc),
          media: { videoId: vc.videoId, thumbnails: vc.thumbnails, deepLinks: [] },
          channel: vc.channel,
          conf: { fields: {}, overall: 0 },
          prov: {}
        },
        extractionConfidence: 0,
        warnings: ['no-description-excerpt']
      };
    }

    const input: MetadataExtractionInput = {
      videoContext: {
        videoId: vc.videoId,
        title: vc.title,
        durationSec: vc.durationSec,
        chapters: (vc.chapters || []).slice(0, 12),
        channel: vc.channel,
        thumbnails: []
      },
      sourceContext: { descriptionText: filtered.raw, descriptionCharOffsets: true }
    };

    const cacheKey = `${vc.videoId}:${EXTRACTOR_VERSION}:${fnv1a(input.sourceContext.descriptionText)}`;
    const cached = memoryCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.result;

    // Pass 1 (excerpt)
    let aiResult = await this.extractWithAI(input);

    // Optional widen
    const needRetry = opts.forceWideRetry || ((aiResult.recipe.steps?.length || 0) < RETRY_MIN_STEPS && filtered.raw.length < desc.length);
    if (needRetry) {
      const retryInput: MetadataExtractionInput = {
        videoContext: input.videoContext,
        sourceContext: { descriptionText: desc.slice(0, MAX_DESC_CHARS), descriptionCharOffsets: true }
      };
      const retry = await this.extractWithAI(retryInput);
      if ((retry.recipe.steps?.length || 0) > (aiResult.recipe.steps?.length || 0)) aiResult = retry;
    }

    // Media + chapters
    aiResult.recipe.media = {
      videoId: vc.videoId,
      thumbnails: vc.thumbnails,
      deepLinks: aiResult.recipe.steps.filter(s => s.startTimeSec != null).map(s => `https://youtu.be/${vc.videoId}?t=${Math.max(0, Math.floor(s.startTimeSec!))}`)
    };
    aiResult.recipe.chapters = vc.chapters.map(c => ({ title: c.title, startTimeSec: c.startTimeSec }));

    // Add channel information to the result
    aiResult.recipe.channel = {
      name: vc.channel.name,
      subs: vc.channel.subs
    };

    // Map steps to chapters and extract timestamps
    aiResult.recipe.steps = aiResult.recipe.steps.map((step, index) => {
      // Try to extract timestamp from step text first
      let stepTimestamp = step.startTimeSec;
      if (!stepTimestamp || stepTimestamp === 0) {
        const timestampMatch = step.text.match(/@(\d{1,2}:\d{2}(?::\d{2})?)/);
        if (timestampMatch) {
          stepTimestamp = this.parseTimestamp(timestampMatch[1]);
        }
      }
      
      // Find the best matching chapter for this step based on step order and chapter timing
      let bestChapter: { title: string; startTimeSec: number } | null = null;
      if (vc.chapters.length > 0) {
        // Map steps to chapters based on their position in the recipe
        const stepRatio = index / Math.max(1, aiResult.recipe.steps.length - 1);
        const totalDuration = vc.durationSec;
        const estimatedStepTime = Math.floor(stepRatio * totalDuration);
        
        // Find the chapter that best matches this estimated time
        for (let i = 0; i < vc.chapters.length; i++) {
          const currentChapter = vc.chapters[i];
          const nextChapter = vc.chapters[i + 1];
          
          if (estimatedStepTime >= currentChapter.startTimeSec && 
              (!nextChapter || estimatedStepTime < nextChapter.startTimeSec)) {
            bestChapter = currentChapter;
            break;
          }
        }
        
        // If no chapter found, use the first one for early steps or last one for later steps
        if (!bestChapter) {
          if (stepRatio < 0.3) {
            bestChapter = vc.chapters[0];
          } else if (stepRatio > 0.7) {
            bestChapter = vc.chapters[vc.chapters.length - 1];
          } else {
            bestChapter = vc.chapters[Math.floor(stepRatio * vc.chapters.length)];
          }
        }
        
        // If we still don't have a timestamp, use the chapter's timestamp
        if (!stepTimestamp && bestChapter) {
          stepTimestamp = bestChapter.startTimeSec;
        }
      }
      
      return {
        ...step,
        startTimeSec: stepTimestamp,
        chapterTitle: bestChapter?.title || null
      };
    });

    // Add clickable timestamp links for each step
    for (const step of aiResult.recipe.steps) {
      if (step.startTimeSec && step.startTimeSec > 0) {
        step.videoTimestampUrl = `https://youtu.be/${vc.videoId}?t=${Math.floor(step.startTimeSec)}`;
        step.formattedTimestamp = this.formatTimestamp(step.startTimeSec);
      }
    }

    // Always ensure title/author come from YouTube Data API if AI omitted them
    if (!aiResult.recipe.title || !aiResult.recipe.title.trim()) {
      aiResult.recipe.title = vc.title;
    }
    if (!aiResult.recipe.channel || !aiResult.recipe.channel.name) {
      aiResult.recipe.channel = { name: vc.channel.name, subs: vc.channel.subs };
    }

    memoryCache.set(cacheKey, { createdAt: Date.now(), result: aiResult });
    return aiResult;
  }

  // =========================
  // OpenAI helpers (Responses API)
  // =========================
  private getSystemPrompt(): string {
    return 'You are a precise recipe extractor. Output ONLY strict JSON parsable by JSON.parse(). Never invent values. Do NOT summarize or condense steps. Preserve step granularity (one listed item = one step). If a listed line contains multiple distinct actions, split it into multiple steps in the same order. Keep durations, temperatures, and quantities.';
  }

  private buildUserPrompt(input: MetadataExtractionInput): string {
    return `VIDEO_CONTEXT:\n${JSON.stringify({
      videoId: input.videoContext.videoId,
      title: input.videoContext.title,
      durationSec: input.videoContext.durationSec,
      chapters: input.videoContext.chapters
    }, null, 2)}\n\nSOURCE_CONTEXT (DESCRIPTION EXCERPT):\n<<<\n${input.sourceContext.descriptionText}\n>>>\n\nTASK:\n- Extract ONLY what is explicitly present in SOURCE_CONTEXT or the provided VIDEO_CONTEXT.\n- For every item, include confidences (0..1) and description provenance spans [start_char, end_char].\n- Ingredients: normalize (name/quantity/unit/preparation), keep exact 'raw' text. For quantities, keep fractions as text (e.g., "1/3", "1/2", "2/3") - do not convert to decimals.\n- Steps: Create 8-15 logical cooking steps that group related actions. Each step should be a complete phase of cooking (e.g., "Make the dough: In bowl, stir yeast into water. Add oil, salt, sugar, and flours and stir until no dry bits remain. Knead lightly with a squeezing motion for 2 min, then continue kneading with your hand/palm for another minute and shape into a rough ball. Dough temp should be 76F/25C."). Include timing, temperature, and technique details within each step. Do NOT create separate steps for minor actions like "cover" or "rest" - incorporate these into the main action step.\n- Extract timestamps from step text (e.g., @3:33, @4:27) and convert to startTimeSec.\n- Times/Servings/Difficulty: include ONLY if explicit.\n- Chapters: leave empty here.\n- If nothing is found, return empty arrays/nulls.\n\nRETURN JSON ONLY (no prose):\n{\n  \"recipe\": {\n    \"title\": null,\n    \"servings\": null,\n    \"totalTimeMin\": null,\n    \"prepTimeMin\": null,\n    \"cookTimeMin\": null,\n    \"difficulty\": null,\n    \"ingredients\": [],\n    \"steps\": [],\n    \"notes\": [],\n    \"chapters\": [],\n    \"media\": { \"videoId\": null, \"thumbnails\": [], \"deepLinks\": [] },\n    \"conf\": { \"fields\": {}, \"overall\": null },\n    \"prov\": {}\n  },\n  \"extractionConfidence\": 0.0\n}`;
  }

  private buildUserPromptVerbatim(input: MetadataExtractionInput): string {
    return `VIDEO_CONTEXT:\n${JSON.stringify({
      videoId: input.videoContext.videoId,
      title: input.videoContext.title,
      durationSec: input.videoContext.durationSec,
      chapters: input.videoContext.chapters
    }, null, 2)}\n\nSOURCE_CONTEXT (DESCRIPTION EXCERPT):\n<<<\n${input.sourceContext.descriptionText}\n>>>\n\nTASK (VERBATIM MODE):\n- Create logical, actionable cooking steps from the source material.\n- Group related actions into single steps (e.g., "Mix dry ingredients: flour, salt, sugar" not separate steps for each ingredient).\n- Each step should be a complete, executable action with timing and temperature details included.\n- Do NOT create steps for notes or parenthetical information - incorporate these into relevant steps.\n- Provide description provenance spans [start_char, end_char] for each step.\n- Ingredients: extract exactly as listed (normalize fields only). For quantities, keep fractions as text (e.g., "1/3", "1/2", "2/3") - do not convert to decimals.\n- Times/Servings/Difficulty: include ONLY if explicit.\n- Chapters: leave empty here.\n\nRETURN JSON ONLY (no prose):\n{\n  \"recipe\": {\n    \"title\": null,\n    \"servings\": null,\n    \"totalTimeMin\": null,\n    \"prepTimeMin\": null,\n    \"cookTimeMin\": null,\n    \"difficulty\": null,\n    \"ingredients\": [],\n    \"steps\": [],\n    \"notes\": [],\n    \"chapters\": [],\n    \"media\": { \"videoId\": null, \"thumbnails\": [], \"deepLinks\": [] },\n    \"conf\": { \"fields\": {}, \"overall\": null },\n    \"prov\": {}\n  },\n  \"extractionConfidence\": 0.0\n}`;
  }

  private async extractWithAI(input: MetadataExtractionInput): Promise<MetadataExtractionResult> {
    // Use Responses API for gpt-5-nano (not Chat Completions)
    const resp1 = await Promise.race([
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
        setTimeout(() => reject(new Error('OpenAI API timeout after 45 seconds')), 45000)
      )
    ]);

    // Use the convenience text property from Responses API
    const text1 = (resp1 as any).output_text || '';

    console.log('🔍 AI Response (first 500 chars):', text1.substring(0, 500));
    
    const parsed1 = this.extractJsonObject(text1);
    if (!parsed1) {
      console.error('❌ No JSON object found in response');
      console.error('Raw response:', text1);
      throw new Error('AI returned non-JSON');
    }

    // Normalize the response before validation to fix common issues
    const normalized = this.normalizeAIResponse(parsed1);
    
    // Schema validation
    const validation1 = validateAIResponse(normalized);
    if (!validation1.valid) {
      console.warn('⚠️ Schema validation warnings:', validation1.errors?.join(', '));
      // Continue with normalized response instead of failing
    }

    let result = this.validateAndNormalizeResult(normalized);

    // Anti-compression guard -> verbatim retry
    const excerpt = input.sourceContext.descriptionText || '';
    if (this.looksCompressed(excerpt, result.recipe.steps)) {
      const resp2 = await Promise.race([
        this.openai.responses.create({
          model: 'gpt-5-nano',
          input: [
            { role: 'system', content: this.getSystemPrompt() },
            { role: 'user', content: this.buildUserPromptVerbatim(input) }
          ],
          text: {
            format: {
              type: 'text'
            },
            verbosity: 'medium'
          },
          reasoning: {
            effort: 'medium'
          },
          tools: [],
          store: true,
          include: [
            'reasoning.encrypted_content'
          ]
        }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('OpenAI verbatim retry timeout after 45 seconds')), 45000)
        )
      ]);

      const text2 = (resp2 as any).output_text || '';

      const parsed2 = this.extractJsonObject(text2);
      if (parsed2) {
        const validation2 = validateAIResponse(parsed2);
        if (validation2.valid) {
          const res2 = this.validateAndNormalizeResult(parsed2);
          if ((res2.recipe.steps?.length || 0) >= (result.recipe.steps?.length || 0)) {
            result = { ...res2, warnings: [...(res2.warnings ?? []), 'verbatim-retry-used'] } as MetadataExtractionResult;
          }
        }
      }
    }

    return result;
  }

  // =========================
  // Validation & normalization
  // =========================
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
        prov: Array.isArray(ing.prov) ? ing.prov : (Array.isArray(ing.span) ? [{ source: 'description' as const, span: ing.span, confidence: 0.1 }] : [])
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
          prov: Array.isArray(step.prov) ? step.prov : (Array.isArray(step.span) ? [{ source: 'description' as const, span: step.span, confidence: 0.1 }] : []),
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

    // Steps
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

    // Fill times if absent
    if (!recipe.totalTimeMin && !recipe.prepTimeMin && !recipe.cookTimeMin) {
      const t = extractTimeInfo([ ...recipe.notes, ...recipe.steps.map(s => s.text) ].join(' '));
      recipe.totalTimeMin = t.totalTimeMin || null;
      recipe.prepTimeMin = t.prepTimeMin || null;
      recipe.cookTimeMin = t.cookTimeMin || null;
    }

    // Confidence
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

    return { recipe, extractionConfidence: recipe.conf.overall ?? 0.0 };
  }

  // =========================
  // Description processing
  // =========================
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

  private extractChaptersFromDescription(description: string): Array<{ title: string; startTimeSec: number }> {
    if (!description) return [];
    const out: Array<{ title: string; startTimeSec: number }> = [];
    const lineRe = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(description)) !== null) {
      const ts = this.parseTimestamp(m[1]);
      const title = (m[2] || '').trim();
      if (ts >= 0 && title) out.push({ title, startTimeSec: ts });
    }
    const dedup = new Map<number, string>();
    for (const c of out) if (!dedup.has(c.startTimeSec)) dedup.set(c.startTimeSec, c.title);
    return Array.from(dedup.entries()).map(([startTimeSec, title]) => ({ title, startTimeSec })).sort((a,b)=>a.startTimeSec-b.startTimeSec);
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

  private formatTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }

  // =========================
  // JSON + compression helpers
  // =========================
  private extractJsonObject(txt: string): any | null {
    if (!txt) return null;
    const start = txt.indexOf('{'); const end = txt.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    const slice = txt.slice(start, end + 1).trim();
    try { return JSON.parse(slice); } catch {}
    try { return JSON.parse(slice.replace(/,(\s*[}\]])/g, '$1')); } catch { return null; }
  }

  private looksCompressed(excerpt: string, steps: Array<{ text: string }>): boolean {
    if (!excerpt) return false;
    const lines = excerpt.split(/\n+/).filter(l => /^(\s*(?:\d+[\).\-:]\s+|[\-•∙\*]\s+|step\s*\d+\s*[:\.\-]?\s+))/i.test(l));
    const bulletCount = lines.length;
    if (bulletCount >= 5 && steps.length < Math.ceil(bulletCount * 0.8)) return true;
    const longRunOns = steps.filter(s => (/;|\band then\b|\bthen\b/i.test(s.text) && s.text.length > 180)).length;
    return longRunOns >= Math.ceil(Math.max(1, steps.length * 0.4));
  }

  // =========================
  // Video meta
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

    let subs = 0;
    try { const channelData = await this.youtubeAPI.getChannelData(videoData.channelId); subs = parseInt(channelData?.subscriberCount || '0') || 0; } catch {}

    const description = videoData.description || '';
    const chapters = this.extractChaptersFromDescription(description);

    return {
      videoId,
      title: videoData.title,
      durationSec: YouTubeDataAPI.parseDuration(videoData.duration),
      chapters,
      channel: { name: videoData.channelTitle || '', subs },
      thumbnails: [videoData.thumbnailUrl].filter(Boolean),
      sourceContext: { descriptionText: description }
    };
  }
}

export const ytMetadataExtractorV2 = new YouTubeMetadataExtractorV2();
