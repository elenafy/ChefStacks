/**
 * memories-recipe-test-with-screenshots.ts
 *
 * Enhanced test script that extracts recipes AND generates screenshots from keyframes
 * - Step 1: Ingest a public video URL (YouTube/TikTok/Instagram)
 * - Step 2: Poll until processed
 * - Step 3: Ask Video Chat for a structured recipe (JSON)
 * - Step 4: Extract keyframes from the response
 * - Step 5: Generate screenshots for each keyframe
 * - Step 6: Associate screenshots with recipe steps
 *
 * Run:
 *   MEMORIES_API_KEY=sk-xxx TEST_VIDEO_URL="https://www.youtube.com/watch?v=XXXX" npx tsx memories-recipe-test-with-screenshots.ts
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
config({ path: '.env.local' });

import { ScreenshotService } from './screenshotService.server';

type ScraperVideo = {
    video_no: string;
    status?: "processing" | "completed" | string;
    source?: string;
  };
  
  type ScraperResp = {
    videos?: ScraperVideo[];
    taskId?: string;
    data?: {
      taskId?: string;
    };
    code?: string;
    msg?: string;
    success?: boolean;
    failed?: boolean;
    [k: string]: unknown;
  };
  
  type PublicTxResp = {
    status?: "processing" | "completed" | string;
    [k: string]: unknown;
  };
  
  type ChatResp = {
    answer?: unknown;
    data?: {
      content?: string;
      thinkings?: Array<{
        refs?: Array<{
          video?: {
            video_no?: string;
            duration?: string;
          };
          refItems?: Array<{
            videoNo?: string;
            startTime?: number;
            type?: string;
          }>;
        }>;
      }>;
    };
    [k: string]: unknown;
  };

  type Keyframe = {
    timestamp: number;
    type: string;
    videoNo: string;
  };

  type RecipeStep = {
    instruction: string;
    order: number;
    screenshot?: {
      url: string;
      timestamp: number;
    };
  };
  
  const API_BASE = "https://api.memories.ai/serve/api/v1";
  const API_KEY = process.env.MEMORIES_API_KEY;
  const TEST_URL = process.env.TEST_VIDEO_URL || "https://www.youtube.com/watch?v=XXXX";
  
  if (!API_KEY) {
    console.error("❌ Missing MEMORIES_API_KEY env var.");
    process.exit(1);
  }
  
  async function postJSON<T>(path: string, body: any): Promise<T> {
    console.log("🔍 Request details:");
    console.log("  URL:", `${API_BASE}${path}`);
    console.log("  Headers:", {
      "Authorization": `${API_KEY?.substring(0, 10)}...`,
      "Content-Type": "application/json",
    });
    console.log("  Body:", JSON.stringify(body, null, 2));
    
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Authorization": API_KEY || '',
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log("🔍 Response details:");
    console.log("  Status:", res.status, res.statusText);
    if (!res.ok) {
      throw new Error(`POST ${path} failed: ${res.status} ${res.statusText} :: ${text}`);
    }
    try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
  }
  
  async function getJSON<T>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Authorization": API_KEY || '' },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`GET ${path} failed: ${res.status} ${res.statusText} :: ${text}`);
    }
    try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
  }
  
  function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
  
  // bump max wait from 180s -> 600s (10 min) and poll every ~15s
  async function getVideoNumbersFromTaskId(taskId: string, maxWaitSec = 600): Promise<string[]> {
    const started = Date.now();
    while (true) {
      const resp = await getJSON<any>(`/get_video_ids_by_task_id?task_id=${encodeURIComponent(taskId)}&unique_id=default`);
      console.log("🔍 Task status response:", JSON.stringify(resp, null, 2));

      const videos = resp?.data?.videos ?? [];
      if (videos.length > 0) return videos.map((v: any) => v.video_no);

      if ((Date.now() - started) / 1000 > maxWaitSec) {
        throw new Error(`Timed out after ${maxWaitSec}s (still downloading)`);
      }
      await sleep(15000); // fixed 15s cadence
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

  function extractKeyframes(chatResponse: ChatResp): Keyframe[] {
    const keyframes: Keyframe[] = [];
    
    if (chatResponse.data?.thinkings) {
      for (const thinking of chatResponse.data.thinkings) {
        if (thinking.refs) {
          for (const ref of thinking.refs) {
            if (ref.refItems) {
              for (const item of ref.refItems) {
                if (item.startTime !== undefined && item.type === "keyframe" && item.videoNo) {
                  keyframes.push({
                    timestamp: item.startTime,
                    type: item.type,
                    videoNo: item.videoNo
                  });
                }
              }
            }
          }
        }
      }
    }
    
    // Sort by timestamp and remove duplicates
    const uniqueKeyframes = keyframes
      .filter((kf, index, self) => 
        index === self.findIndex(k => k.timestamp === kf.timestamp)
      )
      .sort((a, b) => a.timestamp - b.timestamp);
    
    return uniqueKeyframes;
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

  async function generateScreenshotsForSteps(
    steps: any[], 
    keyframes: Keyframe[], 
    videoId: string, 
    videoUrl: string
  ): Promise<RecipeStep[]> {
    const screenshotService = new ScreenshotService();
    const enhancedSteps: RecipeStep[] = [];
    
    console.log(`📸 Generating screenshots for ${steps.length} steps using ${keyframes.length} keyframes...`);
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      // Find the best keyframe for this step
      // For now, we'll distribute keyframes evenly across steps
      const keyframeIndex = Math.floor((i / steps.length) * keyframes.length);
      const keyframe = keyframes[keyframeIndex];
      
      let screenshotResult;
      if (keyframe) {
        console.log(`📸 Capturing screenshot for step ${i + 1} at timestamp ${keyframe.timestamp}s...`);
        screenshotResult = await screenshotService.captureScreenshot(
          videoId,
          keyframe.timestamp,
          videoUrl,
          i // variant for visual variety
        );
      }
      
      enhancedSteps.push({
        instruction: step.instruction,
        order: i + 1,
        screenshot: screenshotResult?.success ? {
          url: screenshotResult.publicUrl || '',
          timestamp: keyframe?.timestamp || 0
        } : undefined
      });
    }
    
    return enhancedSteps;
  }
  
  async function main() {
    console.log("▶️ Testing Memories.ai Video Chat recipe extraction with screenshots");
    console.log("Video URL:", TEST_URL);
    console.log("API Key format:", API_KEY ? `${API_KEY.substring(0, 10)}...` : "NOT SET");

    // 1) Ingest the URL
    console.log("📤 Sending request to /scraper_url...");
    const scrape = await postJSON<ScraperResp>("/scraper_url", { 
      video_urls: [TEST_URL],
      unique_id: "default",
      quality: 720
    });
    console.log("📥 Raw scraper response:", JSON.stringify(scrape, null, 2));
    
    // Handle different response formats
    let video_numbers: string[] = [];
    
    if (scrape?.data?.taskId || scrape?.taskId) {
      // New format with taskId
      const taskId = scrape.data?.taskId || scrape.taskId;
      console.log("✅ Video upload initiated with taskId:", taskId);
      
      // Get actual video numbers from taskId
      if (taskId) {
        video_numbers = await getVideoNumbersFromTaskId(taskId);
      }
    } else if (scrape?.videos?.length) {
      // Old format with videos array
      video_numbers = scrape.videos.map(video => video.video_no);
      console.log("video_numbers:", video_numbers);
    } else {
      console.error("❌ No videos or taskId in response. Full response:", scrape);
      throw new Error("No videos or taskId returned from /scraper_url");
    }

    // 3) Video Chat → request a structured recipe
    const prompt = buildRecipePrompt();
    const chat = await postJSON<ChatResp>("/chat", {
      videoNos: video_numbers,
      prompt,
    });

    // 4) Print raw and parsed outputs
    console.log("\n--- Raw Chat Response ---");
    console.log(JSON.stringify(chat, null, 2));

    const maybeAnswer = (chat as any)?.data?.content ?? (chat as any)?.answer ?? chat;
    const parsed = tryParseJSON(maybeAnswer);

    console.log("\n--- Parsed Recipe JSON (best-effort) ---");
    console.log(JSON.stringify(parsed, null, 2));

    // 5) Extract keyframes from the response
    console.log("\n🔍 Extracting keyframes from response...");
    const keyframes = extractKeyframes(chat);
    console.log(`📸 Found ${keyframes.length} keyframes:`, keyframes);

    // 6) Generate screenshots if we have a valid recipe and keyframes
    if (parsed && typeof parsed === 'object' && 'steps' in parsed && Array.isArray(parsed.steps) && keyframes.length > 0) {
      const videoId = extractVideoId(TEST_URL);
      if (videoId) {
        console.log(`\n📸 Generating screenshots for video ${videoId}...`);
        
        const enhancedSteps = await generateScreenshotsForSteps(
          parsed.steps,
          keyframes,
          videoId,
          TEST_URL
        );
        
        // Update the parsed recipe with enhanced steps
        parsed.steps = enhancedSteps;
        
        console.log("\n--- Enhanced Recipe with Screenshots ---");
        console.log(JSON.stringify(parsed, null, 2));
        
        // Display the final recipe with screenshots
        console.log("\n🍽️ FINAL RECIPE WITH SCREENSHOTS");
        console.log("=================================");
        console.log(`📝 ${(parsed as any).title}`);
        console.log(`⏱️  Prep: ${(parsed as any).prep_time} | Cook: ${(parsed as any).cook_time} | Total: ${(parsed as any).total_time}`);
        console.log(`👥 Serves: ${(parsed as any).servings}`);
        console.log();
        
        console.log("👨‍🍳 INSTRUCTIONS WITH SCREENSHOTS:");
        enhancedSteps.forEach((step, i) => {
          console.log(`  ${i + 1}. ${step.instruction}`);
          if (step.screenshot) {
            console.log(`     📸 Screenshot: ${step.screenshot.url} (at ${step.screenshot.timestamp}s)`);
          }
        });
      } else {
        console.log("⚠️ Could not extract video ID from URL, skipping screenshots");
      }
    } else {
      console.log("⚠️ No valid recipe steps or keyframes found, skipping screenshots");
    }
  }
  
  main().catch((err) => {
    console.error("💥 Error:", err);
    process.exit(1);
  });
