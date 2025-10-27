// src/app/api/ingest/route.ts
export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes (Vercel free plan limit)
import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';
import { upsertRecipeFromWebUrl, getRecipeByUrl } from "@/lib/db";
import { SupabaseDB, convertToLegacyRecipe } from "@/lib/supabase-db";
import { loadEnvironmentVariables } from "@/lib/utils/env";
import { preflightChecker } from "@/lib/preflightChecker";

// Lazy imports to prevent build-time evaluation
async function getExtractors() {
  const [
    { extractRecipeFromWeb }
  ] = await Promise.all([
    import("@/lib/webRecipeExtractor.server")
  ]);
  
  return { extractRecipeFromWeb };
}

// Helper function to format timestamp in seconds to HH:MM:SS or MM:SS format
function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}

// Circuit breaker state for Memories.ai API
let memoriesAiCircuitBreaker = {
  failures: 0,
  lastFailureTime: 0,
  isOpen: false,
  threshold: 5, // Open circuit after 5 consecutive failures
  timeout: 300000, // 5 minutes timeout before trying again
};

// Memories.ai integration functions
async function extractRecipeWithMemoriesAi(videoUrl: string, apiKey: string) {
  const API_BASE = "https://api.memories.ai/serve/api/v1";
  const startTime = Date.now();
  const uniqueId = process.env.MEMORIES_UNIQUE_ID || "default";
  const uploadModeEnv = (process.env.MEMORIES_UPLOAD_MODE || "public").toLowerCase();
  const uploadMode: "private" | "public" | "auto" =
    uploadModeEnv === "private" ? "private" : uploadModeEnv === "auto" ? "auto" : "public";
  const callbackUrl = process.env.MEMORIES_CALLBACK_URL;
  
  // Check circuit breaker
  const now = Date.now();
  if (memoriesAiCircuitBreaker.isOpen) {
    if (now - memoriesAiCircuitBreaker.lastFailureTime < memoriesAiCircuitBreaker.timeout) {
      throw new Error(`Memories.ai service is temporarily unavailable due to recent failures. Please try again in ${Math.ceil((memoriesAiCircuitBreaker.timeout - (now - memoriesAiCircuitBreaker.lastFailureTime)) / 1000)} seconds.`);
    } else {
      // Reset circuit breaker
      memoriesAiCircuitBreaker.isOpen = false;
      memoriesAiCircuitBreaker.failures = 0;
      console.log("🔄 Circuit breaker reset - attempting Memories.ai request");
    }
  }
  
  try {
    console.log("🚀 Starting Memories.ai recipe extraction for:", videoUrl);
    console.log("📊 Circuit breaker state:", {
      failures: memoriesAiCircuitBreaker.failures,
      isOpen: memoriesAiCircuitBreaker.isOpen,
      lastFailureTime: memoriesAiCircuitBreaker.lastFailureTime
    });
    
    const videoId = extractVideoId(videoUrl);
    const platform = detectPlatform(videoUrl);
    
    // Start thumbnail extraction in parallel with video upload
    console.log("🖼️ Starting thumbnail extraction in parallel...");
    const thumbnailPromise = getThumbnailForPlatform(videoUrl, platform, videoId);
    
    // 1) Upload video: try private library first when enabled, else fallback to public
    let scrape: any = null;
    const tryOrder: Array<"private" | "public"> = uploadMode === "private"
      ? ["private", "public"]
      : uploadMode === "auto" ? ["private", "public"] : ["public", "private"];

    for (const mode of tryOrder) {
      try {
        if (mode === "private") {
          const body: Record<string, unknown> = {
            video_urls: [videoUrl],
            quality: 720,
            unique_id: uniqueId,
          };
          if (callbackUrl) body["callback_url"] = callbackUrl;
          console.log("📤 Uploading to private library...", { uniqueId, callback: Boolean(callbackUrl) });
          scrape = await postJSON(`${API_BASE}/scraper_url`, body, apiKey);
        } else {
          const body: Record<string, unknown> = {
            video_urls: [videoUrl],
            quality: 720,
            unique_id: uniqueId,
          };
          console.log("📤 Uploading to public library...", { uniqueId });
          scrape = await postJSON(`${API_BASE}/scraper_url_public`, body, apiKey);
        }
        // If API signaled a permission error, try next mode
        if (scrape?.failed === true && String(scrape?.code) === '9009') {
          console.log(`⚠️ Upload via ${mode} failed with code 9009 (permission). Trying next mode...`);
          continue;
        }
        break; // success path
      } catch (e) {
        console.log(`⚠️ Upload via ${mode} threw error, trying next mode if available...`, e);
        continue;
      }
    }
    
    if (!scrape?.data?.taskId && !scrape?.taskId) {
      throw new Error("No taskId returned from upload");
    }
    
    const taskId = scrape.data?.taskId || scrape.taskId;
    console.log("✅ Upload successful, taskId:", taskId);
    
    // 2) Wait for processing
    // Smart timeout based on estimated duration (applies to all platforms)
    const estimatedDurationSec = await estimateVideoDurationSeconds(videoUrl, platform, videoId);
    // Budget: keep headroom for chat and response; hard cap under Vercel 5m
    const POLL_CAP_SEC = 240; // 4 minutes max for polling to keep time for chat
    const MIN_POLL_SEC = 120; // at least 2 minutes
    const estBased = estimatedDurationSec != null ? Math.round(estimatedDurationSec * 1.2) : 180;
    const maxWaitTime = Math.min(POLL_CAP_SEC, Math.max(MIN_POLL_SEC, estBased));
    console.log(`⏳ Waiting for ${platform} video processing (max ${maxWaitTime}s, est=${estimatedDurationSec ?? 'unknown'}s)...`);
    const videoNumbers = await getVideoNumbersFromTaskId(taskId, apiKey, maxWaitTime, uniqueId);
    console.log("✅ Processing complete, video numbers:", videoNumbers);
    
    // 2.5) Extra delay to ensure video is fully ready for chat (dynamic)
    const extraDelaySec = estimatedDurationSec && estimatedDurationSec > 600 ? 10 : 20;
    console.log(`⏳ Waiting ${extraDelaySec}s for video to be fully ready for chat...`);
    await sleep(extraDelaySec * 1000);
    
    // 2.6) Verify video numbers are still available (sometimes they can change)
    console.log("🔍 Verifying video numbers are still available...");
    try {
      const verifyResp = await getJSON(`https://api.memories.ai/serve/api/v1/get_video_ids_by_task_id?task_id=${encodeURIComponent(taskId)}&unique_id=${encodeURIComponent(uniqueId)}`, apiKey);
      const verifyVideos = verifyResp?.data?.videos ?? [];
      if (verifyVideos.length > 0) {
        const currentVideoNumbers = verifyVideos.map((v: any) => v.video_no);
        console.log(`🔍 Current video numbers:`, currentVideoNumbers);
        if (JSON.stringify(currentVideoNumbers) !== JSON.stringify(videoNumbers)) {
          console.log(`⚠️ Video numbers changed, updating from ${videoNumbers} to ${currentVideoNumbers}`);
          videoNumbers.splice(0, videoNumbers.length, ...currentVideoNumbers);
        }
      }
    } catch (verifyError) {
      console.log(`⚠️ Video verification failed, proceeding with original numbers:`, verifyError);
    }
    
    // 3) Extract recipe with resilient retries (network and API-level transient errors)
    const prompt = buildRecipePrompt();
    let parsed: any = null;
    let retryCount = 0;
    const maxRetries = 3;
    // Use a stable numeric session id within this extraction
    const sessionId = Math.floor(startTime / 1000);

    while (retryCount <= maxRetries) {
      try {
        const chatRequest = {
          video_nos: videoNumbers,
          prompt,
          session_id: sessionId, // stable numeric session id per docs
          unique_id: uniqueId
        };
        console.log(`🔍 Chat request details:`, JSON.stringify(chatRequest, null, 2));
        
        const chat = await postJSON(`${API_BASE}/chat`, chatRequest, apiKey);

        // Try multiple response parsing strategies
        const maybeAnswer = (chat as any)?.data?.content ?? (chat as any)?.answer ?? (chat as any)?.data ?? chat;
        console.log("🔍 Raw Memories.ai response:", JSON.stringify(maybeAnswer, null, 2));
        console.log("🔍 Full chat response structure:", JSON.stringify(chat, null, 2));
        
        const parsedCandidate = tryParseJSON(maybeAnswer);
        console.log("🔍 Parsed response:", JSON.stringify(parsedCandidate, null, 2));

        // Detect API-level failures that should be retried
        if (parsedCandidate && typeof parsedCandidate === 'object' && parsedCandidate !== null) {
          const failed = (parsedCandidate as any).failed === true;
          const successFalse = (parsedCandidate as any).success === false;
          const msg = String((parsedCandidate as any).msg || '').toLowerCase();
          const code = String((parsedCandidate as any).code || '');
          
          // Check if this is actually a success message in Chinese that we're misinterpreting
          const isChineseSuccessMsg = msg.includes('video message q&a confirms') || 
                                     msg.includes('confirms the incoming video number');
          
          if (isChineseSuccessMsg) {
            console.log("🔍 Detected Chinese success message, treating as success");
            // This might actually be a success response, let's try to extract the actual content
            const actualContent = (chat as any)?.data?.content || (chat as any)?.answer || (chat as any)?.data;
            if (actualContent && actualContent !== parsedCandidate) {
              console.log("🔍 Found actual content in response:", JSON.stringify(actualContent, null, 2));
              const realParsed = tryParseJSON(actualContent);
              if (realParsed && typeof realParsed === 'object' && 'title' in realParsed) {
                console.log("✅ Successfully extracted recipe from Chinese success response");
                parsed = realParsed;
                break; // Success
              }
            }
            
            // If we still don't have a valid recipe, this might be a different type of success response
            // Let's check if the response itself contains recipe data
            if (chat && typeof chat === 'object') {
              console.log("🔍 Checking if chat response contains recipe data directly");
              // Look for common recipe fields in the response
              const hasRecipeFields = 'title' in chat || 'ingredients' in chat || 'steps' in chat;
              if (hasRecipeFields) {
                console.log("✅ Found recipe data directly in chat response");
                parsed = chat;
                break; // Success
              }
            }
          }
          
          // Enhanced transient error detection
          const transientMsg = msg.includes('network') || msg.includes('abnormal') || msg.includes('timeout') || 
                              msg.includes('no videos found') || msg.includes('processing') || 
                              msg.includes('temporarily unavailable') || msg.includes('service unavailable');
          const transientCode = code === '0001' || code === '0002' || code === '0003'; // Common transient error codes
          
          if (failed || successFalse) {
            if ((transientMsg || transientCode) && retryCount < maxRetries) {
              retryCount++;
              console.log(`🔄 API reported transient error (${code}): ${msg}, retrying ${retryCount}/${maxRetries}...`);
              
              // Use longer delay for "no videos found" errors as they might need more processing time
              let baseDelay = 5000 * retryCount;
              if (msg.includes('no videos found')) {
                baseDelay = 10000 * retryCount; // 10s, 20s, 30s for video not found errors
                console.log(`⏳ Using extended delay for video availability issue: ${baseDelay/1000}s`);
              }
              
              const jitter = Math.random() * 2000; // Add up to 2s jitter
              await sleep(baseDelay + jitter);
              continue;
            }
            throw new Error((parsedCandidate as any).msg || 'API request failed');
          }
        }

        // Validate structure; if invalid, retry once as transient
        if (!parsedCandidate || typeof parsedCandidate !== 'object' || !('title' in (parsedCandidate as any))) {
          if (retryCount < maxRetries) {
            retryCount++;
            console.log(`🔄 Invalid structure, retrying ${retryCount}/${maxRetries}...`);
            await sleep(4000 * retryCount);
            continue;
          }
          throw new Error('Invalid recipe response from Memories.ai');
        }

        parsed = parsedCandidate;
        break; // Success
      } catch (error) {
        const errorMsg = (error instanceof Error ? error.message : String(error)).toLowerCase();
        const transient = errorMsg.includes('network') || errorMsg.includes('abnormal') || errorMsg.includes('timeout');
        if (transient && retryCount < maxRetries) {
          retryCount++;
          console.log(`🔄 Network/transient error, retrying ${retryCount}/${maxRetries}...`);
          await sleep(5000 * retryCount);
          continue;
        }
        throw error; // Non-retriable or retries exhausted
      }
    }
    
    // 5) Wait for thumbnail extraction to complete
    console.log("🖼️ Waiting for thumbnail extraction to complete...");
    const thumbnail = await thumbnailPromise;
    console.log("🖼️ Thumbnail extraction result:", thumbnail ? "✅ Success" : "❌ Failed");
    
    // Reset circuit breaker on success
    memoriesAiCircuitBreaker.failures = 0;
    memoriesAiCircuitBreaker.isOpen = false;
    
    const totalTime = Date.now() - startTime;
    console.log(`✅ Memories.ai extraction completed successfully in ${(totalTime/1000).toFixed(1)}s`);
    
    return {
      success: true,
      recipe: parsed,
      videoId,
      thumbnail,
      videoNumbers
    };
    
  } catch (error) {
    // Track failure in circuit breaker
    memoriesAiCircuitBreaker.failures++;
    memoriesAiCircuitBreaker.lastFailureTime = Date.now();
    
    if (memoriesAiCircuitBreaker.failures >= memoriesAiCircuitBreaker.threshold) {
      memoriesAiCircuitBreaker.isOpen = true;
      console.log(`🚨 Circuit breaker opened after ${memoriesAiCircuitBreaker.failures} consecutive failures`);
    }
    
    const totalTime = Date.now() - startTime;
    console.error(`❌ Memories.ai extraction failed after ${(totalTime/1000).toFixed(1)}s:`, error);
    console.error("📊 Failure details:", {
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      circuitBreakerFailures: memoriesAiCircuitBreaker.failures,
      circuitBreakerOpen: memoriesAiCircuitBreaker.isOpen
    });
    
    // Even if Memories.ai fails, we can still return the thumbnail if we got it
    try {
      const videoId = extractVideoId(videoUrl);
      const platform = detectPlatform(videoUrl);
      const thumbnail = await getThumbnailForPlatform(videoUrl, platform, videoId);
      
      if (thumbnail) {
        console.log("🖼️ Returning thumbnail despite Memories.ai failure");
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          thumbnail,
          videoId,
          fallback: true
        };
      }
    } catch (thumbnailError) {
      console.error("❌ Thumbnail fallback also failed:", thumbnailError);
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Optimized thumbnail extraction for different platforms
async function getThumbnailForPlatform(videoUrl: string, platform: string, videoId: string | null): Promise<string | null> {
  try {
    console.log(`🖼️ Extracting thumbnail for ${platform} video:`, videoUrl);
    
    if (platform === 'YouTube' && videoId) {
      // YouTube thumbnails are instant - no async needed
      return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    } else if (platform === 'TikTok') {
      return await getTikTokThumbnail(videoUrl);
    } else if (platform === 'Instagram') {
      return await getInstagramThumbnail(videoUrl);
    }
    
    console.log(`⚠️ Unknown platform: ${platform}`);
    return null;
  } catch (error) {
    console.error(`❌ Thumbnail extraction failed for ${platform}:`, error);
    return null;
  }
}

async function postJSON(url: string, body: any, apiKey: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 second timeout
  
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
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
      throw new Error(`Request timeout after 120 seconds: ${url}`);
    }
    throw error;
  }
}

async function getJSON(url: string, apiKey: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout
  
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
      throw new Error(`Request timeout after 90 seconds: ${url}`);
    }
    throw error;
  }
}

async function getVideoNumbersFromTaskId(taskId: string, apiKey: string, maxWaitSec = 60, uniqueId: string = "default"): Promise<string[]> {
  const started = Date.now();
  let attempts = 0;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 3;
  
  while (true) {
    attempts++;
    console.log(`🔍 Polling attempt ${attempts} for taskId: ${taskId}`);
    
    try {
      const resp = await getJSON(`https://api.memories.ai/serve/api/v1/get_video_ids_by_task_id?task_id=${encodeURIComponent(taskId)}&unique_id=${encodeURIComponent(uniqueId)}`, apiKey);
      
      console.log(`📊 Polling response:`, JSON.stringify(resp, null, 2));
      
      // Reset consecutive error counter on successful API call
      consecutiveErrors = 0;
      
      const videos = resp?.data?.videos ?? [];
      if (videos.length > 0) {
        // Log raw video entries
        console.log(`✅ Found ${videos.length} videos after ${attempts} attempts`);
        console.log(`🔍 Video details:`, JSON.stringify(videos, null, 2));

        // Extract candidate IDs and statuses
        const entries = videos.map((v: any) => {
          const id = String(
            v.videoNo || v.video_no || v.video_no?.toString?.() || v.video_number || v.videoId || v.video_id || ''
          );
          const status = String((v.status || v.video_status || v.parse_status || '') || '').toUpperCase();
          return { id, status };
        });

        // If any status fields exist, require PARSE status before proceeding
        const haveStatuses = entries.some((e: { id: string; status: string }) => e.status);
        if (haveStatuses) {
          const notParsed = entries.filter((e: { id: string; status: string }) => e.status && !e.status.includes('PARSE'));
          if (notParsed.length > 0) {
            console.log(`⏳ Waiting for PARSE status. Current statuses:`, entries);
            const elapsedWait = (Date.now() - started) / 1000;
            if (elapsedWait > maxWaitSec) {
              throw new Error(`Timed out waiting for PARSE status after ${elapsedWait.toFixed(1)}s`);
            }
            await sleep(5000);
            continue;
          }
        }

        // Prefer IDs that look like Memories AI VI identifiers
        const viIds = entries.map((e: { id: string; status: string }) => e.id).filter((id: string) => /^VI\d+/.test(id));
        const ids = viIds.length > 0 ? viIds : entries.map((e: { id: string; status: string }) => e.id).filter(Boolean as unknown as (v: string) => v is string);
        console.log(`🔍 Extracted video numbers (preferred VI*):`, ids);
        if (ids.length > 0) return ids;
      }

      const elapsed = (Date.now() - started) / 1000;
      if (elapsed > maxWaitSec) {
        console.log(`⏰ Timeout reached: ${elapsed.toFixed(1)}s elapsed, ${attempts} attempts made`);
        throw new Error(`Timed out after ${maxWaitSec}s (${attempts} attempts) - still processing`);
      }
      
      // Use progressive backoff: start with 5s, increase to 10s after 6 attempts, 15s after 12 attempts
      const baseDelay = attempts <= 6 ? 5000 : attempts <= 12 ? 10000 : 15000;
      const jitter = Math.random() * 1000; // Add up to 1s jitter
      const delay = baseDelay + jitter;
      
      console.log(`⏳ Waiting ${(delay/1000).toFixed(1)}s before next attempt (${elapsed.toFixed(1)}s elapsed)...`);
      await sleep(delay);
      
    } catch (error) {
      consecutiveErrors++;
      console.error(`❌ Polling attempt ${attempts} failed (consecutive errors: ${consecutiveErrors}):`, error);
      
      // If we have too many consecutive errors, fail fast
      if (consecutiveErrors >= maxConsecutiveErrors) {
        throw new Error(`Too many consecutive polling errors (${consecutiveErrors}). Last error: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      const elapsed = (Date.now() - started) / 1000;
      if (elapsed > maxWaitSec) {
        throw error;
      }
      
      // Use longer delay on errors
      const errorDelay = 10000 + (consecutiveErrors * 5000); // 10s, 15s, 20s
      console.log(`⏳ Error backoff: waiting ${(errorDelay/1000).toFixed(1)}s before retry...`);
      await sleep(errorDelay);
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
    '  "tips": string[] | [],',
    '  "creator": {',
    '    "name": string | null,  // Channel/creator name',
    '    "handle": string | null  // @handle if available',
    '  }',
    "}",
    "Rules:",
    "- If the video omits something, infer conservatively or set null.",
    "- Prefer standard units (g, ml, tsp, tbsp, cup, °C/°F).",
    "- Keep steps concise, ordered, and aligned to timestamps when available.",
    "- Extract creator/channel information from the video if visible or mentioned.",
  ].join("\n");
}

function tryParseJSON(text: unknown): unknown {
  if (typeof text !== "string") return text;
  
  // Handle markdown code blocks
  let cleanText = text.trim();
  if (cleanText.startsWith('```json') && cleanText.endsWith('```')) {
    cleanText = cleanText.slice(7, -3).trim();
  } else if (cleanText.startsWith('```') && cleanText.endsWith('```')) {
    cleanText = cleanText.slice(3, -3).trim();
  }
  
  try { 
    return JSON.parse(cleanText); 
  } catch { 
    console.log("Failed to parse JSON, returning original text");
    return text; 
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Parse ISO8601 YouTube duration (e.g., PT9M15S) to seconds
function parseISODurationToSeconds(iso: string | undefined): number | null {
  if (!iso) return null;
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

// Estimate video duration in seconds using platform-specific methods (YouTube only for now)
async function estimateVideoDurationSeconds(
  videoUrl: string,
  platform: string,
  videoId: string | null
): Promise<number | null> {
  try {
    if (platform === 'YouTube' && videoId) {
      const youtubeApiKey = process.env.YOUTUBE_API_KEY || process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
      if (!youtubeApiKey) return null;
      const resp = await getJSONNoAuth(
        `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(youtubeApiKey)}`,
        8000
      );
      const durationIso: string | undefined = resp?.items?.[0]?.contentDetails?.duration;
      const secs = parseISODurationToSeconds(durationIso);
      return secs ?? null;
    }
    // TODO: Add TikTok/Instagram duration estimation if reliable sources are available
    return null;
  } catch (err) {
    console.log('Duration estimation failed:', err);
    return null;
  }
}

// Lightweight GET with timeout and no auth header, for public APIs (e.g. YouTube Data API)
async function getJSONNoAuth(url: string, timeoutMs = 10000): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`GET ${url} failed: ${res.status} ${res.statusText} :: ${text}`);
    }
    try { return JSON.parse(text); } catch { return text; }
  } catch (error) {
    clearTimeout(timeoutId);
    throw error as Error;
  }
}

// Extract thumbnail from TikTok using official oEmbed API
async function getTikTokThumbnail(videoUrl: string): Promise<string | null> {
  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
    const response = await getJSONNoAuth(oembedUrl, 10000);
    return response.thumbnail_url || null;
  } catch (error) {
    console.log("❌ TikTok oEmbed failed:", error);
    return null;
  }
}

// Extract thumbnail from Instagram using crawler approach (no API key required)
async function getInstagramThumbnailCrawler(videoUrl: string): Promise<string | null> {
  try {
    console.log("🔍 Extracting Instagram thumbnail via crawler for:", videoUrl);
    
    // Set crawler-style headers to mimic a preview bot
    const headers = {
      'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    try {
      const response = await fetch(videoUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
        redirect: 'follow'
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const html = await response.text();
      console.log("✅ Successfully fetched Instagram page HTML");
      
      // Parse og:image from HTML
      const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
      
      if (ogImageMatch && ogImageMatch[1]) {
        const thumbnailUrl = ogImageMatch[1];
        console.log("✅ Found og:image:", thumbnailUrl);
        // Decode HTML entities in the URL
        const cleanUrl = thumbnailUrl.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        return cleanUrl;
      }
      
      // Try alternative meta tag formats
      const altOgImageMatch = html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
      if (altOgImageMatch && altOgImageMatch[1]) {
        const thumbnailUrl = altOgImageMatch[1];
        console.log("✅ Found og:image (alt format):", thumbnailUrl);
        // Decode HTML entities in the URL
        const cleanUrl = thumbnailUrl.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        return cleanUrl;
      }
      
      console.log("❌ No og:image meta tag found in HTML");
      return null;
      
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
    
  } catch (error) {
    console.error("❌ Instagram crawler approach failed:", error);
    return null;
  }
}


// Extract thumbnail from Instagram using crawler approach only
async function getInstagramThumbnail(videoUrl: string): Promise<string | null> {
  const startTime = Date.now();
  console.log("🖼️ Starting Instagram thumbnail extraction for:", videoUrl);
  
  try {
    const crawlerThumbnail = await getInstagramThumbnailCrawler(videoUrl);
    if (crawlerThumbnail) {
      const duration = Date.now() - startTime;
      console.log(`✅ Instagram crawler approach succeeded in ${duration}ms`);
      return crawlerThumbnail;
    }
    
    const duration = Date.now() - startTime;
    console.log(`❌ Instagram thumbnail extraction failed after ${duration}ms`);
    return null;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`❌ Instagram thumbnail extraction failed after ${duration}ms:`, error);
    return null;
  }
}

// Attempt to enrich YouTube author/channel info via YouTube Data API v3
async function fetchYouTubeAuthorInfoByVideoId(videoId: string, apiKey?: string): Promise<{ channelTitle?: string | null, handle?: string | null } | null> {
  if (!apiKey) return null;
  try {
    const videoResp = await getJSONNoAuth(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`);
    const item = videoResp?.items?.[0];
    if (!item) return null;
    const channelTitle: string | undefined = item.snippet?.channelTitle;
    const channelId: string | undefined = item.snippet?.channelId;
    let handle: string | null = null;
    if (channelId) {
      const channelResp = await getJSONNoAuth(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(apiKey)}`);
      const channel = channelResp?.items?.[0];
      // Prefer snippet.customUrl if present; derive an @handle-like string
      const customUrl: string | undefined = channel?.snippet?.customUrl;
      if (customUrl) {
        const clean = customUrl.replace(/^\//, "");
        handle = clean.startsWith('@') ? clean : `@${clean}`;
      }
    }
    return { channelTitle: channelTitle ?? null, handle };
  } catch (err) {
    console.error('YouTube Data API enrichment failed:', err);
    return null;
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

  // Instagram (posts and reels)
  const instagramMatch = url.match(/instagram\.com\/(?:p|reel)\/([^\/\?]+)/);
  if (instagramMatch) return instagramMatch[1];

  return null;
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

function parseTimeToMinutes(timeStr: string): number | undefined {
  if (!timeStr) return undefined;
  
  // Extract number from strings like "30 min", "1 hour", "2 hours 30 min"
  const match = timeStr.match(/(\d+)\s*(?:hour|hr|h)/i);
  if (match) {
    return parseInt(match[1]) * 60;
  }
  
  const minMatch = timeStr.match(/(\d+)\s*(?:min|minute)/i);
  if (minMatch) {
    return parseInt(minMatch[1]);
  }
  
  // Try to parse as just a number (assume minutes)
  const numMatch = timeStr.match(/(\d+)/);
  if (numMatch) {
    return parseInt(numMatch[1]);
  }
  
  return undefined;
}

function isVideoUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    return hostname.includes('youtube.com') || 
           hostname.includes('youtu.be') ||
           hostname.includes('tiktok.com') ||
           hostname.includes('instagram.com');
  } catch {
    return false;
  }
}

function detectPlatform(url: string): 'YouTube' | 'TikTok' | 'Instagram' | 'unknown' {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      return 'YouTube';
    } else if (hostname.includes('tiktok.com')) {
      return 'TikTok';
    } else if (hostname.includes('instagram.com')) {
      return 'Instagram';
    }
    
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// Build a deep-link to a given timestamp (seconds) for any platform URL.
// Uses URLSearchParams to add/update `t` and preserves existing query parameters.
function buildDeepLinkWithTimestamp(baseUrl: string, seconds?: number): string | undefined {
  if (seconds == null) return undefined;
  const clamped = Math.max(0, Math.floor(seconds));
  try {
    const u = new URL(baseUrl);
    u.searchParams.set('t', String(clamped));
    return u.toString();
  } catch {
    const sep = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${sep}t=${clamped}`;
  }
}

// Build a normalized Supabase recipe insert payload from extracted data and platform context
function buildSupabaseInsertPayload(
  extractedData: any,
  normalizedUrl: string,
  platformData: any,
  options: {
    subtitleDefault: string,
    preferPlatformChannelInMetadata: boolean,
    extractionMethodLabel: string,
    defaultConfidence: number,
    defaultOverallConfidence: number,
  }
): any {
  const subtitleAuthor = platformData.youtube?.author || platformData.tiktok?.author || platformData.instagram?.author || options.subtitleDefault;

  const mapIngredient = (ing: any) => ({
    text: String(ing.text || ing.name || ing.line || ''),
    qty: String(ing.qty || ing.quantity || ''),
    unit: String(ing.unit || ''),
    normalized: String(ing.normalized || ing.name || ''),
    from: String(ing.from || options.extractionMethodLabel),
    confidence: Number(ing.confidence ?? options.defaultConfidence),
  });

  const mapStep = (step: any) => ({
    order: Number(step.order || 0),
    title: String(step.title || ''),
    instructions: Array.isArray(step.instructions) ? step.instructions.map((i: any) => String(i)) : [String(step.text || '')],
    text: String(step.text || ''),
    timestamp: step.timestamp != null ? Number(step.timestamp) : null,
    timestampFormatted: step.timestampFormatted != null ? String(step.timestampFormatted) : null,
    deepLink: step.deepLink ? String(step.deepLink) : null,
    from: String(step.from || options.extractionMethodLabel),
    confidence: Number(step.confidence ?? options.defaultConfidence),
    image: step.image ? String(step.image) : undefined,
  });

  const channelFromPlatform = {
    title: String(
      platformData.youtube?.author ||
      platformData.tiktok?.author ||
      platformData.instagram?.author ||
      extractedData.metadata?.channel?.title || ''
    ),
    name: String(
      platformData.youtube?.author ||
      platformData.tiktok?.author ||
      platformData.instagram?.author ||
      extractedData.metadata?.channel?.name || ''
    ),
  };

  const channelFromMetadata = {
    title: String(extractedData.metadata?.channel?.title || ''),
    name: String(extractedData.metadata?.channel?.name || ''),
  };

  return {
    title: String(extractedData.title || 'Untitled Recipe'),
    source_url: String(normalizedUrl),
    is_base: true,
    content_json: {
      subtitle: String(subtitleAuthor),
      stats: {
        prep: extractedData.times?.prep_min != null ? Number(extractedData.times.prep_min) : null,
        cook: extractedData.times?.cook_min != null ? Number(extractedData.times.cook_min) : null,
        serves: extractedData.times?.serves != null ? Number(extractedData.times.serves) : null,
        difficulty: null,
      },
      ...platformData,
      ingredients: (extractedData.ingredients || []).map(mapIngredient),
      steps: (extractedData.steps || []).map(mapStep),
      tips: Array.isArray(extractedData.tips) ? extractedData.tips.map((t: any) => String(t)) : [],
      image: extractedData.image ? String(extractedData.image) : null,
      metadata: {
        ...extractedData.metadata,
        channel: options.preferPlatformChannelInMetadata ? channelFromPlatform : channelFromMetadata,
      },
      provenance: {
        extractionMethod: String(extractedData.provenance?.extractionMethod || options.extractionMethodLabel),
        ingredientsFrom: String(extractedData.provenance?.ingredientsFrom || options.extractionMethodLabel),
        stepsFrom: String(extractedData.provenance?.stepsFrom || options.extractionMethodLabel),
        overallConfidence: Number(
          extractedData.provenance?.overallConfidence ?? options.defaultOverallConfidence
        ),
      },
    },
    images: extractedData.image ? [String(extractedData.image)] : [],
    is_public: true,
  } as any;
}

export async function POST(req: NextRequest) {
  // Ensure env vars (.env.local) are loaded for server runtime
  loadEnvironmentVariables();

  const { url, force = false } = await req.json();
  
  // Get extractors at runtime to prevent build-time evaluation
  const { extractRecipeFromWeb } = await getExtractors();
  
  // Get user from auth header if available
  const authHeader = req.headers.get('authorization');
  let user = null;
  if (authHeader) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
      );
      const { data: { user: authUser } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      user = authUser;
    } catch (error) {
      console.log('Auth error:', error);
    }
  }

  try {
    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Check if recipe already exists (unless force is true)
    let existingRecipe = null;
    
    if (!force) {
      console.log(`🔍 Checking for existing recipe with URL: ${url}`);
      // Check Supabase first if configured
      if (SupabaseDB.isConfigured()) {
        const db = new SupabaseDB();
        const supabaseRecipe = await db.getRecipeBySourceUrl(url);
        console.log(`🔍 Supabase lookup result:`, supabaseRecipe ? 'FOUND' : 'NOT FOUND');
        if (supabaseRecipe) {
          existingRecipe = convertToLegacyRecipe(supabaseRecipe);
        }
      }
      
      // Fallback to file database if not found in Supabase
      if (!existingRecipe) {
        existingRecipe = await getRecipeByUrl(url);
      }
      
      if (existingRecipe) {
        return NextResponse.json({
          success: true,
          existing: true,
          message: "Recipe already exists",
          title: existingRecipe.title,
          id: existingRecipe.id,
          recipe: existingRecipe,
          video: {
            id: extractVideoId(url) || '',
            url,
            title: existingRecipe.title || 'Unknown Title',
            duration: 0,
            thumbnail: ''
          }
        });
      }
    }

    const normalizedUrl = url.trim();

    if (isVideoUrl(normalizedUrl)) {
      const platform = detectPlatform(normalizedUrl);
      console.log(`🎬 Processing ${platform} URL:`, normalizedUrl);
      
      // Run preflight check for all video platforms (YouTube, TikTok, Instagram)
      console.log(`🔍 Running preflight check for ${platform} video...`);
      const preflightStart = Date.now();
      const preflightResult = await preflightChecker.checkVideo(normalizedUrl);
      const preflightDuration = Date.now() - preflightStart;
      
      console.log(`⏱️ Preflight completed in ${preflightDuration}ms: ${preflightResult.pass ? 'PASS' : 'FAIL'} (score: ${preflightResult.score})`);
      
      if (!preflightResult.pass) {
        return NextResponse.json({
          success: false,
          error: preflightResult.userMessage?.title || "Preflight check failed",
          reason: preflightResult.reason,
          score: preflightResult.score,
          borderline: preflightResult.borderline,
          allowOverride: preflightResult.allowOverride,
          checks: preflightResult.checks,
          costEstimate: preflightResult.costEstimate,
          userMessage: preflightResult.userMessage,
          message: preflightResult.userMessage?.description || 
            (preflightResult.borderline 
              ? "This video doesn't appear to be a recipe. You can try anyway by adding 'skipPreflight: true' to your request."
              : "This video failed preflight checks and is unlikely to contain a recipe.")
        }, { status: 400 });
      }

      // Log cost estimate if available
      if (preflightResult.costEstimate) {
        console.log(`💰 Cost estimate: ${preflightResult.costEstimate.tier} tier, ~${preflightResult.costEstimate.estimatedProcessingTime}s processing time`);
        if (preflightResult.costEstimate.warningMessage) {
          console.log(`⚠️ Warning: ${preflightResult.costEstimate.warningMessage}`);
        }
      }
      
      // Use Memories.ai for all video platforms (YouTube, TikTok, Instagram)
      console.log(`📺 ${platform} video - using Memories.ai for extraction`);
      
      // Check for Memories.ai API key
      const apiKey = process.env.MEMORIES_API_KEY;
      console.log(`🔑 Using Memories.ai API key: ${apiKey ? `${apiKey.substring(0, 20)}...` : 'NOT SET'}`);
      if (!apiKey) {
        return NextResponse.json({
          success: false,
          error: 'Memories.ai API key not configured',
          video: {
            id: extractVideoId(normalizedUrl) || '',
            url: normalizedUrl,
            title: 'Unknown Title',
            duration: 0,
            thumbnail: ''
          }
        }, { status: 500 });
      }
      
      
      try {
        const memoriesResult = await extractRecipeWithMemoriesAi(normalizedUrl, apiKey);
        
        if (!memoriesResult.success) {
          // Check if we have a thumbnail fallback
          const hasThumbnail = memoriesResult.thumbnail && memoriesResult.fallback;
          
          
          // Create more specific error message based on the error type
          let specificMessage = "Recipe extraction failed. Please try again later or use a different video.";
          if (memoriesResult.error?.includes('Timed out')) {
            specificMessage = `Recipe extraction timed out. This ${platform.toLowerCase()} video may be too long or complex to process right now. Please try again shortly or use a different video.`;
          } else if (memoriesResult.error?.includes('Permission issues') || memoriesResult.error?.includes('9009')) {
            specificMessage = `Video access restricted. This ${platform.toLowerCase()} video cannot be processed due to permission restrictions. Please try a different video.`;
          } else if (memoriesResult.error?.includes('network is abnormal') || memoriesResult.error?.includes('0001')) {
            specificMessage = `Network connectivity issue with video processing service. This is a temporary issue on the service provider's side. Please try again in a few minutes.`;
          } else if (memoriesResult.error?.includes('API error')) {
            specificMessage = `Memories.ai API error: ${memoriesResult.error}. Please try again later.`;
          } else if (hasThumbnail) {
            specificMessage = "Recipe extraction failed, but thumbnail was retrieved. Please try again later or use a different video.";
          }
          
          // Get basic metadata for error response (title, author, thumbnail)
          let basicMetadata = {
            title: 'Unknown Title',
            author: 'Unknown Author',
            thumbnail: memoriesResult.thumbnail || ''
          };
          
          if (platform === 'YouTube') {
            try {
              const { ytMetadataExtractorV2 } = await import("@/lib/extractors/yt_metadata_v_2");
              const meta = await ytMetadataExtractorV2.extractRecipe(normalizedUrl);
              const recipe = meta.recipe;
              const videoId = extractVideoId(normalizedUrl) || '';
              const thumbnail = recipe.media?.thumbnails?.[0] || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
              
              basicMetadata = {
                title: recipe.title || 'Unknown Title',
                author: recipe.channel?.name || 'Unknown Author',
                thumbnail: thumbnail
              };
            } catch (err) {
              console.error('Failed to get basic YouTube metadata:', err);
            }
          }
          
          return NextResponse.json({
            success: false,
            error: `Memories.ai extraction failed: ${memoriesResult.error}`,
            video: {
              id: extractVideoId(normalizedUrl) || '',
              url: normalizedUrl,
              title: basicMetadata.title,
              duration: 0,
              thumbnail: basicMetadata.thumbnail
            },
            fallback: hasThumbnail,
            message: specificMessage,
            basicMetadata: basicMetadata
          }, { status: 500 });
        }
        
        const { recipe, videoId, thumbnail } = memoriesResult;
        console.log("🔍 Thumbnail from Memories.ai:", thumbnail);
        console.log("🔍 Platform:", platform);
        
        if (!recipe || typeof recipe !== 'object') {
          return NextResponse.json({
            success: false,
            error: 'Invalid recipe data from Memories.ai',
            video: {
              id: extractVideoId(normalizedUrl) || '',
              url: normalizedUrl,
              title: 'Unknown Title',
              duration: 0,
              thumbnail: ''
            }
          }, { status: 500 });
        }
        
        const recipeData = recipe as any;
        console.log("🔍 Raw Memories.ai recipe data:", JSON.stringify(recipeData, null, 2));
        
        const extractedData = {
          title: recipeData.title || 'Untitled Recipe',
          channel: { 
            name: recipeData.creator?.name || recipeData.creator?.handle || null,
            title: recipeData.creator?.name || recipeData.creator?.handle || null
          },
          ingredients: (recipeData.ingredients || []).map((ing: any) => ({
            text: `${ing.quantity || ''} ${ing.unit || ''} ${ing.name}`.trim(),
            qty: ing.quantity?.toString() || '',
            unit: ing.unit || '',
            normalized: ing.name || '',
            from: 'memories-ai',
            confidence: 0.8
          })),
          steps: (recipeData.steps || []).map((step: any, index: number) => ({
            order: index + 1,
            title: step.instruction?.split('.')[0] || `Step ${index + 1}`,
            instructions: [step.instruction || ''],
            text: step.instruction || '',
            timestamp: step.t_in ? parseTimeToSeconds(step.t_in) : undefined,
            timestampFormatted: step.t_in || null,
            deepLink: buildDeepLinkWithTimestamp(normalizedUrl, parseTimeToSeconds(step.t_in || '')),
            from: 'memories-ai',
            confidence: 0.8
          })),
          image: thumbnail,
          chapters: [],
          times: {
            prep_min: recipeData.prep_time ? parseTimeToMinutes(recipeData.prep_time) : null,
            cook_min: recipeData.cook_time ? parseTimeToMinutes(recipeData.cook_time) : null,
            serves: recipeData.servings || null
          },
          provenance: {
            extractionMethod: 'memories-ai',
            ingredientsFrom: 'memories-ai',
            stepsFrom: 'memories-ai',
            overallConfidence: 0.8
          },
          metadata: {
            quality: { score: 0.8 },
            channel: { 
              title: recipeData.creator?.name || recipeData.creator?.handle || null,
              name: recipeData.creator?.name || recipeData.creator?.handle || null
            },
            video: {
              views: undefined,
              likes: undefined,
              comments: undefined,
              published: undefined,
              duration: undefined,
              tags: undefined,
              category: undefined
            }
          }
        };

        // Save the extracted data to Supabase when configured, else fallback to file DB
        if (SupabaseDB.isConfigured()) {
          const db = new SupabaseDB();
          // reuse previously detected platform and memoriesResult.videoId
          let platformData: any = {};
          const videoIdDetected = videoId || extractVideoId(normalizedUrl) || '';
          
          if (platform === 'YouTube') {
            platformData.youtube = {
              url: normalizedUrl,
              id: videoIdDetected,
              // Use creator info from Memories.ai if available (filled below with fallback)
              author: recipeData.creator?.name || recipeData.creator?.handle || null,
              handle: recipeData.creator?.handle || recipeData.creator?.name || null,
            };
          } else if (platform === 'TikTok') {
            // Extract TikTok username from URL as fallback
            const tiktokUsername = normalizedUrl.match(/tiktok\.com\/@([^\/]+)/)?.[1] || null;
            platformData.tiktok = {
              url: normalizedUrl,
              id: videoIdDetected,
              author: recipeData.creator?.name || recipeData.creator?.handle || tiktokUsername,
              handle: recipeData.creator?.handle || recipeData.creator?.name || (tiktokUsername ? `@${tiktokUsername}` : null),
            };
          } else if (platform === 'Instagram') {
            // Extract Instagram username from URL as fallback (avoid post IDs)
            const instagramUsername = normalizedUrl.match(/instagram\.com\/([^\/\?]+)/)?.[1] || null;
            console.log("🔍 Instagram username extraction:", {
              url: normalizedUrl,
              username: instagramUsername,
              creatorName: recipeData.creator?.name,
              creatorHandle: recipeData.creator?.handle
            });
            platformData.instagram = {
              url: normalizedUrl,
              id: videoIdDetected,
              author: recipeData.creator?.name || recipeData.creator?.handle || instagramUsername,
              handle: recipeData.creator?.handle || recipeData.creator?.name || (instagramUsername ? `@${instagramUsername}` : null),
            };
            console.log("🔍 Instagram platform data:", platformData.instagram);
          }

          // YouTube author enrichment fallback via YouTube Data API if Memories.ai did not provide it
          if (platform === 'YouTube' && (!platformData.youtube.author || !platformData.youtube.handle)) {
            const youtubeApiKey = process.env.YOUTUBE_API_KEY || process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
            if (youtubeApiKey && videoIdDetected) {
              const enriched = await fetchYouTubeAuthorInfoByVideoId(videoIdDetected, youtubeApiKey);
              if (enriched) {
                platformData.youtube.author = platformData.youtube.author || enriched.channelTitle || null;
                platformData.youtube.handle = platformData.youtube.handle || enriched.handle || null;
              }
            }
          }

          // Build Supabase Insert shape
          const supabaseInsert = buildSupabaseInsertPayload(
            extractedData,
            normalizedUrl,
            platformData,
            {
              subtitleDefault: 'Extracted from video using Memories.ai',
              preferPlatformChannelInMetadata: true,
              extractionMethodLabel: 'memories-ai',
              defaultConfidence: 0.8,
              defaultOverallConfidence: 0.8,
            }
          );

          console.log("🔍 Platform data:", JSON.stringify(platformData, null, 2));
          console.log("🔍 Supabase insert data:", JSON.stringify(supabaseInsert, null, 2));
          const saved = await db.createRecipe(supabaseInsert, user?.id || undefined);
          console.log("🔍 Saved recipe:", JSON.stringify({ id: saved.id, is_public: saved.is_public, title: saved.title }, null, 2));
          const legacy = convertToLegacyRecipe(saved);

          return NextResponse.json({
            success: true,
            id: legacy.id,
            title: legacy.title,
            video: {
              id: videoIdDetected || '',
              url: normalizedUrl,
              title: extractedData.title || 'Unknown Title',
              duration: 0,
              thumbnail: extractedData.image || null
            },
            recipe: legacy,
            extractionMethod: 'memories-ai',
            extractionConfidence: 0.8,
            warnings: [],
            errors: []
          });
        } else {
          // Fallback to file DB for local/dev without Supabase
          const { upsertRecipeFromYouTubeId } = await import("@/lib/db");
          const videoId = extractVideoId(normalizedUrl) || '';
          const saved = await upsertRecipeFromYouTubeId(videoId, extractedData);
          return NextResponse.json({
            success: true,
            id: saved.recipe.id,
            title: saved.recipe.title,
            video: {
              id: videoId,
              url: normalizedUrl,
              title: extractedData.title || 'Unknown Title',
              duration: 0,
              thumbnail: extractedData.image || null
            },
            recipe: saved.recipe,
            extractionMethod: 'memories-ai',
            extractionConfidence: 0.8,
            warnings: [],
            errors: []
          });
        }

      } catch (error) {
        console.error('Memories.ai extraction failed:', error);
        return NextResponse.json({
          success: false,
          error: `Memories.ai extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          video: {
            id: extractVideoId(normalizedUrl) || '',
            url: normalizedUrl,
            title: 'Unknown Title',
            duration: 0,
            thumbnail: ''
          }
        }, { status: 500 });
      }
    } else {
      // WEB URL FLOW: Use web recipe extractor
      console.log('🌐 Processing web URL:', normalizedUrl);
      try {
        const webRecipe = await extractRecipeFromWeb(normalizedUrl);
        
        if (webRecipe.ingredients.length === 0 && webRecipe.steps.length === 0) {
          return NextResponse.json({
            success: false,
            error: 'No recipe found on this webpage',
            video: {
              id: '',
              url: normalizedUrl,
              title: 'Unknown Title',
              duration: 0,
              thumbnail: ''
            }
          }, { status: 404 });
        }

        // Save the extracted data to Supabase when configured, else fallback to file DB
        if (SupabaseDB.isConfigured()) {
          const db = new SupabaseDB();
          
          // Build platform-specific content for web recipes
          const platformData: any = {
            web: {
              url: normalizedUrl,
              domain: new URL(normalizedUrl).hostname.replace('www.', ''),
              author: webRecipe.author || "Web Source"
            }
          };

          // Build Supabase Insert shape
          const supabaseInsert = {
            title: webRecipe.title || 'Untitled Recipe',
            source_url: normalizedUrl,
            is_base: true,
            content_json: {
              subtitle: platformData.web.author || 'Extracted from web page',
              stats: {
                prep: webRecipe.times?.prep_min ? Number(webRecipe.times.prep_min) : null,
                cook: webRecipe.times?.cook_min ? Number(webRecipe.times.cook_min) : null,
                serves: webRecipe.servings ? Number(webRecipe.servings) : null,
                difficulty: webRecipe.difficulty || null
              },
              ...platformData,
              ingredients: (webRecipe.ingredients || []).map((ing: any) => ({
                text: String(ing.text || ing.name || ing.line || ''),
                qty: String(ing.qty || ing.quantity || ''),
                unit: String(ing.unit || ''),
                normalized: String(ing.normalized || ing.name || ''),
                from: 'web',
                confidence: Number(ing.confidence || 0.8)
              })),
              steps: (webRecipe.steps || []).map((step: any, index: number) => ({
                order: Number(index + 1),
                title: String(step.title || `Step ${index + 1}`),
                instructions: [String(step.text || '')],
                text: String(step.text || ''),
                image: step.image ? String(step.image) : undefined,
                from: 'web',
                confidence: Number(step.confidence || 0.8)
              })),
              tips: (webRecipe.tips || []).map((tip: any) => String(tip)),
              image: webRecipe.image ? String(webRecipe.image) : null,
              metadata: {
                quality: { 
                  score: Number((webRecipe.confidence.ingredients + webRecipe.confidence.steps) / 2) 
                },
                channel: { 
                  title: String(platformData.web.author || ''), 
                  name: String(platformData.web.author || '') 
                }
              },
              provenance: {
                extractionMethod: 'web',
                ingredientsFrom: 'web',
                stepsFrom: 'web',
                overallConfidence: Number((webRecipe.confidence.ingredients + webRecipe.confidence.steps) / 2)
              }
            },
            images: webRecipe.image ? [String(webRecipe.image)] : [],
            is_public: true,
          } as any;

          console.log("🔍 Web recipe Supabase insert data:", JSON.stringify(supabaseInsert, null, 2));
          const saved = await db.createRecipe(supabaseInsert, user?.id || undefined);
          console.log("🔍 Saved web recipe:", JSON.stringify({ id: saved.id, is_public: saved.is_public, title: saved.title }, null, 2));
          const legacy = convertToLegacyRecipe(saved);

          return NextResponse.json({
            success: true,
            id: legacy.id,
            title: legacy.title,
            video: {
              id: '',
              url: normalizedUrl,
              title: webRecipe.title || 'Unknown Title',
              duration: 0,
              thumbnail: webRecipe.image || null
            },
            recipe: legacy,
            extractionMethod: 'web',
            extractionConfidence: (webRecipe.confidence.ingredients + webRecipe.confidence.steps) / 2,
            warnings: [],
            errors: []
          });
        } else {
          // Fallback to file DB for local/dev without Supabase
          const savedRecipe = await upsertRecipeFromWebUrl(normalizedUrl, webRecipe);

          return NextResponse.json({
            success: true,
            video: {
              id: '',
              url: normalizedUrl,
              title: webRecipe.title || 'Unknown Title',
              duration: 0,
              thumbnail: webRecipe.image || null
            },
            recipe: savedRecipe,
            extractionMethod: 'web',
            extractionConfidence: (webRecipe.confidence.ingredients + webRecipe.confidence.steps) / 2,
            warnings: [],
            errors: []
          });
        }

      } catch (error) {
        console.error('Web recipe extraction failed:', error);
        return NextResponse.json({
          success: false,
          error: 'Web recipe extraction failed',
          video: {
            id: '',
            url: normalizedUrl,
            title: 'Unknown Title',
            duration: 0,
            thumbnail: ''
          }
        }, { status: 500 });
      }
    }

  } catch (error) {
    console.error('Ingest error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      video: {
        id: '',
        url: url || '',
        title: 'Unknown Title',
        duration: 0,
        thumbnail: ''
      }
    }, { status: 500 });
  }
}
