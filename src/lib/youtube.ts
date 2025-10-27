// src/lib/youtube.ts

// Parse a YouTube video ID from common URL formats.
// Returns null if not a valid/recognized YouTube URL.
export function parseYouTubeId(input: string): string | null {
    try {
      const u = new URL(input);
  
      // Short links: https://youtu.be/VIDEOID?t=123
      if (u.hostname.includes("youtu.be")) {
        const id = u.pathname.replace("/", "");
        return id || null;
      }
  
      // Standard: https://www.youtube.com/watch?v=VIDEOID
      // Shorts:   https://www.youtube.com/shorts/VIDEOID
      if (u.hostname.includes("youtube.com")) {
        if (u.pathname.startsWith("/watch")) {
          const id = u.searchParams.get("v");
          return id || null;
        }
        if (u.pathname.startsWith("/shorts/")) {
          const id = u.pathname.split("/")[2];
          return id || null;
        }
      }
  
      return null;
    } catch {
      return null;
    }
  }
  