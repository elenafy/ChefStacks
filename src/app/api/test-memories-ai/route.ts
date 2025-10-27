// src/app/api/test-memories-ai/route.ts
// Test endpoint for Memories.ai API integration

export const maxDuration = 300; // 5 minutes (Vercel free plan limit)
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { videoUrl, apiKey } = await req.json();
    
    if (!apiKey) {
      return NextResponse.json({ error: 'apiKey is required' }, { status: 400 });
    }
    
    if (!videoUrl) {
      return NextResponse.json({ error: 'videoUrl is required' }, { status: 400 });
    }
    
    console.log('🧪 Testing Memories.ai API with:', videoUrl);
    
    // Use our working implementation from the test script
    const result = await extractRecipeWithMemoriesAi(videoUrl, apiKey);
    
    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      recipe: result.recipe,
      processingTime: result.processingTime,
      videoNos: result.videoNos,
      thumbnail: result.thumbnail
    });
    
  } catch (error) {
    console.error('Memories.ai test failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
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
    console.log("🚀 Starting recipe extraction for:", videoUrl);
    
    // 1) Upload video
    console.log("📤 Step 1: Uploading video...");
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
    console.log("⏳ Step 2: Waiting for video processing...");
    const videoNumbers = await getVideoNumbersFromTaskId(taskId, apiKey);
    console.log("✅ Processing complete, video numbers:", videoNumbers);
    
    // 3) Extract recipe
    console.log("🧠 Step 3: Extracting recipe...");
    const prompt = buildRecipePrompt();
    const chat = await postJSON(`${API_BASE}/chat`, {
      video_nos: videoNumbers,
      prompt,
      session_id: Math.floor(Date.now()/1000),
      unique_id: "default"
    }, apiKey);
    
    // 4) Parse response
    console.log("📝 Step 4: Parsing recipe response...");
    const maybeAnswer = (chat as any)?.data?.content ?? (chat as any)?.answer ?? chat;
    const parsed = tryParseJSON(maybeAnswer);
    
    if (!parsed || typeof parsed !== 'object' || !('title' in parsed)) {
      console.error("❌ Invalid recipe response:", parsed);
      throw new Error("Invalid recipe response from Memories.ai");
    }
    
    // 5) Get thumbnail
    console.log("🖼️ Step 5: Getting thumbnail...");
    const videoId = extractVideoId(videoUrl);
    const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : null;
    
    // 6) Create Supabase-compatible recipe
    console.log("🔧 Step 6: Creating recipe object...");
    const recipe = {
      title: parsed.title,
      subtitle: 'Extracted from video using Memories.ai',
      stats: {
        prep: (parsed as any).prep_time || null,
        cook: (parsed as any).cook_time || null,
        serves: (parsed as any).servings || null,
        difficulty: null
      },
      youtube: {
        url: videoUrl,
        author: 'Video Creator',
        handle: '@creator',
        id: videoId
      },
      ingredients: (parsed as any).ingredients?.map((ing: any) => ({
        qty: ing.quantity || '',
        item: ing.name,
        normalized: ing.name?.toLowerCase() || '',
        source: 'memories-ai',
        confidence: 0.8
      })) || [],
      steps: (parsed as any).steps?.map((step: any, index: number) => ({
        text: step.instruction,
        order: index + 1,
        source: 'memories-ai',
        confidence: 0.8
      })) || [],
      tips: (parsed as any).tips || [],
      image: thumbnail || '',
      metadata: {
        quality: { score: 0.8 },
        channel: { title: 'Video Creator' },
        extraction: {
          method: 'memories-ai',
          processingTime: Date.now()
        }
      },
      provenance: {
        extractionMethod: 'memories-ai',
        ingredientsFrom: 'memories-ai',
        stepsFrom: 'memories-ai',
        overallConfidence: 0.8
      }
    };
    
    console.log("✅ Recipe extraction complete!");
    return {
      success: true,
      recipe,
      processingTime: Date.now(),
      videoNos: videoNumbers,
      thumbnail
    };
    
  } catch (error) {
    console.error("❌ Recipe extraction failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function postJSON(url: string, body: any, apiKey: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`POST ${url} failed: ${res.status} ${res.statusText} :: ${text}`);
  }
  try { return JSON.parse(text); } catch { return text; }
}

async function getJSON(url: string, apiKey: string) {
  const res = await fetch(url, {
    headers: { "Authorization": apiKey },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText} :: ${text}`);
  }
  try { return JSON.parse(text); } catch { return text; }
}

async function getVideoNumbersFromTaskId(taskId: string, apiKey: string, maxWaitSec = 600): Promise<string[]> {
  const started = Date.now();
  let attempts = 0;
  
  while (true) {
    attempts++;
    console.log(`🔍 Polling attempt ${attempts} for taskId: ${taskId}`);
    
    try {
      const resp = await getJSON(`https://api.memories.ai/serve/api/v1/get_video_ids_by_task_id?task_id=${encodeURIComponent(taskId)}&unique_id=default`, apiKey);
      console.log(`📊 Polling response:`, JSON.stringify(resp, null, 2));
      
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
      await sleep(10000); // reduced to 10s cadence
      
    } catch (error) {
      console.error(`❌ Polling attempt ${attempts} failed:`, error);
      const elapsed = (Date.now() - started) / 1000;
      if (elapsed > maxWaitSec) {
        throw error;
      }
      await sleep(5000); // shorter wait on error
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

export async function GET() {
  return NextResponse.json({
    name: "Memories.ai Test Endpoint",
    description: "Test endpoint for Memories.ai API integration",
    usage: {
      method: "POST",
      body: {
        videoUrl: "YouTube or TikTok video URL",
        apiKey: "Your Memories.ai API key"
      }
    },
    example: {
      videoUrl: "https://www.youtube.com/watch?v=VIDEO_ID",
      apiKey: "your-api-key-here"
    },
    testConnection: {
      method: "POST",
      body: {
        apiKey: "Your Memories.ai API key",
        testConnection: true
      }
    }
  });
}
