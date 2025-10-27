/**
 * YouTube Data API Integration
 * 
 * This module provides a clean interface to the YouTube Data API v3
 * for fetching video metadata, channel information, and search results.
 */

export interface YouTubeChapter {
  title: string;
  start_time: number;
}

export interface YouTubeVideoData {
  id: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  duration: string; // ISO 8601 duration format
  viewCount: string;
  likeCount: string;
  commentCount: string;
  thumbnailUrl: string;
  tags: string[];
  categoryId: string;
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
  privacyStatus: string;
  license: string;
  embeddable: boolean;
  publicStatsViewable: boolean;
  chapters?: YouTubeChapter[];
}

export interface YouTubeChannelData {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  subscriberCount: string;
  videoCount: string;
  viewCount: string;
  country?: string;
  customUrl?: string;
  thumbnailUrl: string;
}

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string;
}

export class YouTubeDataAPI {
  private apiKey: string;
  private baseUrl = 'https://www.googleapis.com/youtube/v3';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Get detailed video information
   */
  async getVideoData(videoId: string): Promise<YouTubeVideoData | null> {
    try {
      const url = `${this.baseUrl}/videos?id=${videoId}&key=${this.apiKey}&part=snippet,statistics,contentDetails,status`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      const data = await response.json();

      if (data.error) {
        console.error('YouTube API Error:', data.error);
        return null;
      }

      if (!data.items || data.items.length === 0) {
        return null;
      }

      const video = data.items[0];
      const snippet = video.snippet;
      const statistics = video.statistics;
      const contentDetails = video.contentDetails;
      const status = video.status;

      // Get the highest quality thumbnail
      const thumbnails = snippet.thumbnails;
      const thumbnailUrl = thumbnails?.maxres?.url || 
                          thumbnails?.high?.url || 
                          thumbnails?.medium?.url || 
                          thumbnails?.default?.url || '';

      // Extract chapters from description
      const chapters = this.extractChaptersFromDescription(snippet.description || '');

      return {
        id: videoId,
        title: snippet.title || '',
        description: snippet.description || '',
        channelId: snippet.channelId || '',
        channelTitle: snippet.channelTitle || '',
        publishedAt: snippet.publishedAt || '',
        duration: contentDetails.duration || '',
        viewCount: statistics.viewCount || '0',
        likeCount: statistics.likeCount || '0',
        commentCount: statistics.commentCount || '0',
        thumbnailUrl,
        tags: snippet.tags || [],
        categoryId: snippet.categoryId || '',
        defaultLanguage: snippet.defaultLanguage,
        defaultAudioLanguage: snippet.defaultAudioLanguage,
        privacyStatus: status.privacyStatus || '',
        license: status.license || '',
        embeddable: status.embeddable || false,
        publicStatsViewable: status.publicStatsViewable || false,
        chapters,
      };
    } catch (error) {
      console.error('Failed to fetch video data:', error);
      return null;
    }
  }

  /**
   * Get channel information
   */
  async getChannelData(channelId: string): Promise<YouTubeChannelData | null> {
    try {
      const url = `${this.baseUrl}/channels?id=${channelId}&key=${this.apiKey}&part=snippet,statistics`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      const data = await response.json();

      if (data.error) {
        console.error('YouTube API Error:', data.error);
        return null;
      }

      if (!data.items || data.items.length === 0) {
        return null;
      }

      const channel = data.items[0];
      const snippet = channel.snippet;
      const statistics = channel.statistics;

      // Get the highest quality thumbnail
      const thumbnails = snippet.thumbnails;
      const thumbnailUrl = thumbnails?.high?.url || 
                          thumbnails?.medium?.url || 
                          thumbnails?.default?.url || '';

      return {
        id: channelId,
        title: snippet.title || '',
        description: snippet.description || '',
        publishedAt: snippet.publishedAt || '',
        subscriberCount: statistics.subscriberCount || '0',
        videoCount: statistics.videoCount || '0',
        viewCount: statistics.viewCount || '0',
        country: snippet.country,
        customUrl: snippet.customUrl,
        thumbnailUrl,
      };
    } catch (error) {
      console.error('Failed to fetch channel data:', error);
      return null;
    }
  }

  /**
   * Search for videos
   */
  async searchVideos(query: string, maxResults: number = 10): Promise<YouTubeSearchResult[]> {
    try {
      const url = `${this.baseUrl}/search?part=snippet&type=video&q=${encodeURIComponent(query)}&key=${this.apiKey}&maxResults=${maxResults}`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      const data = await response.json();

      if (data.error) {
        console.error('YouTube API Error:', data.error);
        return [];
      }

      if (!data.items) {
        return [];
      }

      return data.items.map((item: any) => {
        const snippet = item.snippet;
        const thumbnails = snippet.thumbnails;
        const thumbnailUrl = thumbnails?.high?.url || 
                            thumbnails?.medium?.url || 
                            thumbnails?.default?.url || '';

        return {
          videoId: item.id.videoId,
          title: snippet.title || '',
          description: snippet.description || '',
          channelId: snippet.channelId || '',
          channelTitle: snippet.channelTitle || '',
          publishedAt: snippet.publishedAt || '',
          thumbnailUrl,
        };
      });
    } catch (error) {
      console.error('Failed to search videos:', error);
      return [];
    }
  }

  /**
   * Get multiple videos at once (more efficient than individual calls)
   */
  async getMultipleVideos(videoIds: string[]): Promise<YouTubeVideoData[]> {
    if (videoIds.length === 0) return [];

    try {
      const ids = videoIds.join(',');
      const url = `${this.baseUrl}/videos?id=${ids}&key=${this.apiKey}&part=snippet,statistics,contentDetails,status`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      const data = await response.json();

      if (data.error) {
        console.error('YouTube API Error:', data.error);
        return [];
      }

      if (!data.items) {
        return [];
      }

      return data.items.map((video: any) => {
        const snippet = video.snippet;
        const statistics = video.statistics;
        const contentDetails = video.contentDetails;
        const status = video.status;

        const thumbnails = snippet.thumbnails;
        const thumbnailUrl = thumbnails?.maxres?.url || 
                            thumbnails?.high?.url || 
                            thumbnails?.medium?.url || 
                            thumbnails?.default?.url || '';

        return {
          id: video.id,
          title: snippet.title || '',
          description: snippet.description || '',
          channelId: snippet.channelId || '',
          channelTitle: snippet.channelTitle || '',
          publishedAt: snippet.publishedAt || '',
          duration: contentDetails.duration || '',
          viewCount: statistics.viewCount || '0',
          likeCount: statistics.likeCount || '0',
          commentCount: statistics.commentCount || '0',
          thumbnailUrl,
          tags: snippet.tags || [],
          categoryId: snippet.categoryId || '',
          defaultLanguage: snippet.defaultLanguage,
          defaultAudioLanguage: snippet.defaultAudioLanguage,
          privacyStatus: status.privacyStatus || '',
          license: status.license || '',
          embeddable: status.embeddable || false,
          publicStatsViewable: status.publicStatsViewable || false,
        };
      });
    } catch (error) {
      console.error('Failed to fetch multiple videos:', error);
      return [];
    }
  }

  /**
   * Parse duration from ISO 8601 format to seconds
   */
  static parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Format duration from seconds to human readable format
   */
  static formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Format large numbers (views, likes, etc.)
   */
  static formatNumber(num: string | number): string {
    const n = typeof num === 'string' ? parseInt(num, 10) : num;
    if (isNaN(n)) return '0';

    if (n >= 1000000) {
      return (n / 1000000).toFixed(1) + 'M';
    } else if (n >= 1000) {
      return (n / 1000).toFixed(1) + 'K';
    } else {
      return n.toString();
    }
  }

  /**
   * Extract chapters from description text
   */
  private extractChaptersFromDescription(description: string): YouTubeChapter[] {
    const chapters: YouTubeChapter[] = [];
    
    if (!description) return chapters;
    
    // Pattern 1: "0:00 Introduction" or "0:00:00 Introduction"
    const timestampPattern = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/gm;
    
    let match;
    while ((match = timestampPattern.exec(description)) !== null) {
      const [, timestamp, title] = match;
      const startTime = this.parseTimestamp(timestamp);
      if (startTime >= 0 && title.trim() && !chapters.some(ch => ch.start_time === startTime)) {
        chapters.push({ 
          title: title.trim(), 
          start_time: startTime 
        });
      }
    }

    // Pattern 2: "CHAPTERS" section with timestamps
    const chaptersSection = description.match(/CHAPTERS?\s*:?\s*\n([\s\S]*?)(?:\n\n|\n[A-Z]|$)/i);
    if (chaptersSection) {
      const chapterLines = chaptersSection[1].split('\n');
      for (const line of chapterLines) {
        const chapterMatch = line.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)/);
        if (chapterMatch) {
          const [, timestamp, title] = chapterMatch;
          const startTime = this.parseTimestamp(timestamp);
          if (startTime >= 0 && title.trim() && !chapters.some(ch => ch.start_time === startTime)) {
            chapters.push({ 
              title: title.trim(), 
              start_time: startTime 
            });
          }
        }
      }
    }

    // Pattern 3: Look for timestamps in the middle of lines
    const inlineTimestampPattern = /(\d{1,2}:\d{2}(?::\d{2})?)\s+([^\n]+)/g;
    while ((match = inlineTimestampPattern.exec(description)) !== null) {
      const [, timestamp, title] = match;
      const startTime = this.parseTimestamp(timestamp);
      if (startTime >= 0 && title.trim() && !chapters.some(ch => ch.start_time === startTime)) {
        chapters.push({ 
          title: title.trim(), 
          start_time: startTime 
        });
      }
    }

    return chapters.sort((a, b) => a.start_time - b.start_time);
  }

  /**
   * Parse timestamp string to seconds
   */
  private parseTimestamp(timestamp: string): number {
    const parts = timestamp.split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return -1;
  }
}

/**
 * Create a YouTube Data API instance
 */
export function createYouTubeAPI(): YouTubeDataAPI | null {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.warn('YOUTUBE_API_KEY environment variable not set');
    return null;
  }
  return new YouTubeDataAPI(apiKey);
}
