// src/app/api/extract/route.ts - UPDATED TO USE NEW PIPELINE
export const runtime = "nodejs"; // needed for child_process
export const maxDuration = 300; // 5 minutes (Vercel free plan limit)
import { NextResponse } from "next/server";
import { loadEnvironmentVariables } from "@/lib/utils/env";

// Lazy imports to prevent build-time evaluation
async function getExtractors() {
  const [
    { extractRecipeFromWeb },
    { preflightChecker }
  ] = await Promise.all([
    import("@/lib/webRecipeExtractor.server"),
    import("@/lib/preflightChecker")
  ]);
  
  return { extractRecipeFromWeb, preflightChecker };
}

function isYouTubeUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be');
  } catch {
    return false;
  }
}

function extractVideoId(url: string): string | null {
  // YouTube
  const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
  if (youtubeMatch) return youtubeMatch[1];

  // YouTube Shorts
  const shortsMatch = url.match(/youtube\.com\/shorts\/([^&\n?#]+)/);
  if (shortsMatch) return shortsMatch[1];

  // TikTok
  const tiktokMatch = url.match(/tiktok\.com\/@[^\/]+\/video\/(\d+)/);
  if (tiktokMatch) return tiktokMatch[1];

  return null;
}

async function extractRecipeWithMemoriesAi(videoUrl: string, apiKey: string) {
  const API_BASE = "https://api.memories.ai/serve/api/v1";
  
  try {
    console.log("🚀 Starting Memories.ai recipe extraction for:", videoUrl);
    
    // 1) Upload video
    const scrape = await postJSON(`${API_BASE}/scraper_url_public`, { 
      video_urls: [videoUrl],
      quality: 720
    }, apiKey);
    
    if (!scrape?.data?.taskId && !scrape?.taskId) {
      throw new Error("No taskId returned from upload");
    }
    
    const taskId = scrape.data?.taskId || scrape.taskId;
    console.log("✅ Upload successful, taskId:", taskId);
    
    // 2) Wait for processing
    const videoNumbers = await getVideoNumbersFromTaskId(taskId, apiKey);
    console.log("✅ Processing complete, video numbers:", videoNumbers);
    
    // 3) Extract recipe
    const prompt = buildRecipePrompt();
    const chat = await postJSON(`${API_BASE}/chat`, {
      video_nos: videoNumbers,
      prompt,
      session_id: Math.floor(Date.now()/1000),
      unique_id: "default"
    }, apiKey);
    
    // 4) Parse response
    const maybeAnswer = (chat as any)?.data?.content ?? (chat as any)?.answer ?? chat;
    const parsed = tryParseJSON(maybeAnswer);
    
    if (!parsed || typeof parsed !== 'object' || !('title' in parsed)) {
      throw new Error("Invalid recipe response from Memories.ai");
    }
    
    // 5) Get thumbnail
    const videoId = extractVideoId(videoUrl);
    const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : null;
    
    return {
      success: true,
      recipe: parsed,
      videoId,
      thumbnail,
      videoNumbers
    };
    
  } catch (error) {
    console.error("❌ Memories.ai extraction failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function postJSON(url: string, body: any, apiKey: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`POST ${url} failed: ${res.status} ${res.statusText} :: ${text}`);
    }
    try { return JSON.parse(text); } catch { return text; }
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after 90 seconds: ${url}`);
    }
    throw error;
  }
}

async function getJSON(url: string, apiKey: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
  try {
    const res = await fetch(url, {
      headers: { "Authorization": apiKey },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`GET ${url} failed: ${res.status} ${res.statusText} :: ${text}`);
    }
    try { return JSON.parse(text); } catch { return text; }
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after 60 seconds: ${url}`);
    }
    throw error;
  }
}

async function getVideoNumbersFromTaskId(taskId: string, apiKey: string, maxWaitSec = 600): Promise<string[]> {
  const started = Date.now();
  let attempts = 0;
  
  while (true) {
    attempts++;
    console.log(`🔍 Polling attempt ${attempts} for taskId: ${taskId}`);
    
    try {
      const resp = await getJSON(`https://api.memories.ai/serve/api/v1/get_video_ids_by_task_id?task_id=${encodeURIComponent(taskId)}&unique_id=default`, apiKey);
      
      const videos = resp?.data?.videos ?? [];
      if (videos.length > 0) {
        console.log(`✅ Found ${videos.length} videos after ${attempts} attempts`);
        return videos.map((v: any) => v.video_no);
      }

      const elapsed = (Date.now() - started) / 1000;
      if (elapsed > maxWaitSec) {
        throw new Error(`Timed out after ${maxWaitSec}s (${attempts} attempts) - still processing`);
      }
      
      console.log(`⏳ Waiting 10s before next attempt (${elapsed.toFixed(1)}s elapsed)...`);
      await sleep(10000);
      
    } catch (error) {
      console.error(`❌ Polling attempt ${attempts} failed:`, error);
      const elapsed = (Date.now() - started) / 1000;
      if (elapsed > maxWaitSec) {
        throw error;
      }
      await sleep(5000);
    }
  }
}

function buildRecipePrompt(): string {
  return [
    "Extract a complete cooking recipe from this video.",
    "Return STRICT, VALID JSON with this shape:",
    "{",
    '  "title": string,',
    '  "servings": number | null,',
    '  "prep_time": string | null,  // e.g., "15 min"',
    '  "cook_time": string | null,  // e.g., "30 min"',
    '  "total_time": string | null,',
    '  "ingredients": [',
    '    { "name": string, "quantity": string | number | null, "unit": string | null, "notes": string | null }',
    "  ],",
    '  "steps": [',
    '    { "t_in": "HH:MM:SS" | null, "t_out": "HH:MM:SS" | null, "instruction": string }',
    "  ],",
    '  "tools": string[] | [],',
    '  "tips": string[] | []',
    "}",
    "Rules:",
    "- If the video omits something, infer conservatively or set null.",
    "- Prefer standard units (g, ml, tsp, tbsp, cup, °C/°F).",
    "- Keep steps concise, ordered, and aligned to timestamps when available.",
  ].join("\n");
}

function tryParseJSON(text: unknown): unknown {
  if (typeof text !== "string") return text;
  try { return JSON.parse(text); } catch { return text; }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: Request) {
  // Load environment variables first
  loadEnvironmentVariables();
  
  // Get extractors at runtime to prevent build-time evaluation
  const { extractRecipeFromWeb, preflightChecker } = await getExtractors();
  
  const { url, skipPreflight } = await req.json();
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  try {
    if (isYouTubeUrl(url)) {
      // Extract video ID for compatibility
      const urlObj = new URL(url);
      const vid = urlObj.searchParams.get("v") || urlObj.pathname.split("/").pop() || "";
      
      // Check for Memories.ai API key
      const apiKey = process.env.MEMORIES_API_KEY;
      if (!apiKey) {
        return NextResponse.json({ 
          error: 'Memories.ai API key not configured',
          vid,
          recipe: null
        }, { status: 500 });
      }
      
      // Run preflight check first (unless skipped)
      if (!skipPreflight) {
        console.log('🔍 Running preflight check...');
        const preflightStart = Date.now();
        const preflightResult = await preflightChecker.checkVideo(url);
        const preflightDuration = Date.now() - preflightStart;
        
        console.log(`⏱️ Preflight completed in ${preflightDuration}ms: ${preflightResult.pass ? 'PASS' : 'FAIL'} (score: ${preflightResult.score})`);
        
        if (!preflightResult.pass) {
          return NextResponse.json({
            error: preflightResult.userMessage?.title || "Preflight check failed",
            reason: preflightResult.reason,
            score: preflightResult.score,
            borderline: preflightResult.borderline,
            allowOverride: preflightResult.allowOverride,
            checks: preflightResult.checks,
            userMessage: preflightResult.userMessage,
            message: preflightResult.userMessage?.description || 
              (preflightResult.borderline 
                ? "This video doesn't appear to be a recipe. You can try anyway by adding 'skipPreflight: true' to your request."
                : "This video failed preflight checks and is unlikely to contain a recipe.")
          }, { status: 400 });
        }
      }
      
      // Use Memories.ai for extraction
      console.log('🧠 Using Memories.ai for recipe extraction...');
      const memoriesResult = await extractRecipeWithMemoriesAi(url, apiKey);
      
      if (!memoriesResult.success) {
        return NextResponse.json({ 
          error: `Memories.ai extraction failed: ${memoriesResult.error}`,
          vid,
          recipe: null
        }, { status: 500 });
      }
      
      const { recipe, videoId, thumbnail } = memoriesResult;
      
      if (!recipe || typeof recipe !== 'object') {
        return NextResponse.json({ 
          error: 'Invalid recipe data from Memories.ai',
          vid,
          recipe: null
        }, { status: 500 });
      }
      
      const recipeData = recipe as any;
      
      // Transform to expected format for backward compatibility
      const transformedResult = {
        vid: videoId || vid,
        recipe: {
          title: recipeData.title || 'Untitled Recipe',
          ingredients: (recipeData.ingredients || []).map((ing: any) => ({
            line: `${ing.quantity || ''} ${ing.unit || ''} ${ing.name}`.trim(),
            name: ing.name || '',
            qty: ing.quantity?.toString() || '',
            unit: ing.unit || '',
            from: 'memories-ai',
            ts: undefined
          })),
          steps: (recipeData.steps || []).map((step: any, index: number) => ({
            step_no: index + 1,
            text: step.instruction || '',
            video_ts_seconds: step.t_in ? parseTimeToSeconds(step.t_in) : undefined,
            formatted_timestamp: step.t_in || null,
            from: 'memories-ai',
            image: null
          })),
          confidence: 0.8, // High confidence for Memories.ai
          image: thumbnail,
          debug: {
            method: 'memories-ai',
            extractionConfidence: 0.8,
            ingredientsCount: (recipeData.ingredients || []).length,
            stepsCount: (recipeData.steps || []).length,
            tipsCount: (recipeData.tips || []).length
          }
        }
      };
      
      return NextResponse.json(transformedResult);
    } else {
      // Handle web URLs
      const result = await extractRecipeFromWeb(url);
      const { hostname } = new URL(url);
      const domain = hostname.replace('www.', '');
      
      // Transform to expected format for backward compatibility
      const transformedResult = {
        url,
        recipe: {
          title: result.title,
          author: result.author,
          // Explicit source and link metadata
          source: 'web',
          source_url: url,
          web: {
            url,
            domain,
            author: result.author,
          },
          ingredients: result.ingredients.map(ing => ({
            line: ing.text,
            name: ing.text,
            qty: ing.qty,
            unit: ing.unit,
            from: ing.from
          })),
          steps: result.steps.map(step => ({
            step_no: step.order,
            text: step.text,
            from: step.from,
            image: step.image
          })),
          times: result.times,
          servings: result.servings,
          image: result.image,
          confidence: result.confidence,
          debug: result.debug
        }
      };
      
      return NextResponse.json(transformedResult);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

function parseTimeToSeconds(timeStr: string): number | undefined {
  if (!timeStr) return undefined;
  
  // Parse HH:MM:SS format
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  
  return undefined;
}
