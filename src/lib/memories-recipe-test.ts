/**
 * memories-recipe-test.ts
 *
 * Minimal TS script to test Memories.ai Video Chat for recipe extraction.
 * - Step 1: Ingest a public video URL (YouTube/TikTok/Instagram)
 * - Step 2: Poll until processed
 * - Step 3: Ask Video Chat for a structured recipe (JSON)
 *
 * Run:
 *   MEMORIES_API_KEY=sk-xxx TEST_VIDEO_URL="https://www.youtube.com/watch?v=XXXX" npx tsx memories-recipe-test.ts
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
config({ path: '.env.local' });

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
    answer?: unknown; // API may return free-form text or structured JSON; we’ll try to parse
    [k: string]: unknown;
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
    console.log("  Headers:", Object.fromEntries(res.headers.entries()));
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
  
  async function main() {
    console.log("▶️ Testing Memories.ai Video Chat recipe extraction");
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
  
    const maybeAnswer = (chat as any)?.answer ?? chat;
    const parsed = tryParseJSON(maybeAnswer);
  
    console.log("\n--- Parsed Recipe JSON (best-effort) ---");
    console.log(JSON.stringify(parsed, null, 2));
  }
  
  main().catch((err) => {
    console.error("💥 Error:", err);
    process.exit(1);
  });
  