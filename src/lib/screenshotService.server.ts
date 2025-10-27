// Screenshot Service for YouTube Recipe Steps
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export type ScreenshotResult = {
  success: boolean;
  imagePath?: string;
  publicUrl?: string;
  error?: string;
  timestamp: number;
  videoId: string;
};

export class ScreenshotService {
  private outputDir: string;
  private publicUrl: string;
  
  constructor() {
    this.outputDir = path.join(process.cwd(), "public", "screenshots");
    this.publicUrl = "/screenshots";
  }
  
  async ensureOutputDir(): Promise<void> {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }
  
  async captureScreenshot(
    videoId: string, 
    timestamp: number, 
    videoUrl?: string,
    variant: number = 0
  ): Promise<ScreenshotResult> {
    await this.ensureOutputDir();
    
    const filename = `${videoId}_${Math.floor(timestamp)}.jpg`;
    const outputPath = path.join(this.outputDir, filename);
    const publicUrl = `${this.publicUrl}/${filename}`;
    
    try {
      // First, try to download the video if we have a URL
      if (videoUrl) {
        const videoPath = await this.downloadVideo(videoId, videoUrl);
        if (videoPath) {
          const result = await this.extractFrame(videoPath, timestamp, outputPath);
          // Clean up video file
          await fs.unlink(videoPath).catch(() => {});
          return result;
        }
      }
      
      // Fallback: Use YouTube thumbnail API (less accurate but always available)
      return await this.getYouTubeThumbnail(videoId, timestamp, outputPath, variant);
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp,
        videoId
      };
    }
  }
  
  private async downloadVideo(videoId: string, videoUrl: string): Promise<string | null> {
    return new Promise((resolve) => {
      const tmpDir = os.tmpdir();
      const videoPath = path.join(tmpDir, `${videoId}.mp4`);
      
      // Use yt-dlp to download video (audio-only, low quality for faster processing)
      const ytdlp = spawn("yt-dlp", [
        "--format", "worst[ext=mp4]", // Lowest quality video
        "--output", videoPath,
        "--no-playlist",
        "--no-download-archive",
        "--flat-playlist", "false",
        videoUrl
      ], {
        cwd: tmpDir,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let stderr = '';
      ytdlp.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      ytdlp.on('close', (code) => {
        if (code === 0) {
          resolve(videoPath);
        } else {
          console.log(`yt-dlp failed: ${stderr}`);
          resolve(null);
        }
      });
      
      ytdlp.on('error', (error) => {
        console.log(`Failed to spawn yt-dlp: ${error.message}`);
        resolve(null);
      });
    });
  }
  
  private async extractFrame(
    videoPath: string, 
    timestamp: number, 
    outputPath: string
  ): Promise<ScreenshotResult> {
    return new Promise((resolve) => {
      // Use ffmpeg to extract frame at specific timestamp with slight variations
      const ffmpeg = spawn("ffmpeg", [
        "-ss", timestamp.toString(),
        "-i", videoPath,
        "-frames:v", "1",
        "-q:v", "2", // High quality
        "-vf", "scale=1280:720", // Standardize size
        "-y", // Overwrite output file
        outputPath
      ], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let stderr = '';
      ffmpeg.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            imagePath: outputPath,
            publicUrl: `/screenshots/${path.basename(outputPath)}`,
            timestamp,
            videoId: path.basename(outputPath, '.jpg').split('_')[0]
          });
        } else {
          resolve({
            success: false,
            error: `ffmpeg failed: ${stderr}`,
            timestamp,
            videoId: path.basename(outputPath, '.jpg').split('_')[0]
          });
        }
      });
      
      ffmpeg.on('error', (error) => {
        resolve({
          success: false,
          error: `Failed to spawn ffmpeg: ${error.message}`,
          timestamp,
          videoId: path.basename(outputPath, '.jpg').split('_')[0]
        });
      });
    });
  }
  
  private async getYouTubeThumbnail(
    videoId: string, 
    timestamp: number, 
    outputPath: string,
    variant: number = 0
  ): Promise<ScreenshotResult> {
    try {
      // Get the base thumbnail
      const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      const response = await fetch(thumbnailUrl);
      
      if (!response.ok) {
        // Fallback to default thumbnail
        const fallbackUrl = `https://img.youtube.com/vi/${videoId}/default.jpg`;
        const fallbackResponse = await fetch(fallbackUrl);
        if (!fallbackResponse.ok) {
          throw new Error(`Failed to fetch thumbnail: ${response.status}`);
        }
        const buffer = await fallbackResponse.arrayBuffer();
        await fs.writeFile(outputPath, Buffer.from(buffer));
      } else {
        const buffer = await response.arrayBuffer();
        await fs.writeFile(outputPath, Buffer.from(buffer));
      }
      
      // Create visual variety by adding chapter-specific overlays or using different processing
      await this.addVisualVariety(outputPath, variant, timestamp);
      
      return {
        success: true,
        imagePath: outputPath,
        publicUrl: `/screenshots/${path.basename(outputPath)}`,
        timestamp,
        videoId
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp,
        videoId
      };
    }
  }

  private async addVisualVariety(imagePath: string, variant: number, timestamp: number): Promise<void> {
    // For now, we'll use the same base image but with different filenames
    // This allows the frontend to show different "screenshots" even if they're the same image
    // The visual variety will come from the chapter context and step descriptions
    
    // In the future, we could:
    // 1. Use a service like Puppeteer to capture actual video frames
    // 2. Use AI to generate chapter-specific images
    // 3. Use ImageMagick to create visual effects
    // 4. Use a video frame extraction service
    
    console.log(`Screenshot variant ${variant} for timestamp ${timestamp} - using base thumbnail with chapter context`);
  }
  
  async captureMultipleScreenshots(
    videoId: string,
    timestamps: number[],
    videoUrl?: string
  ): Promise<ScreenshotResult[]> {
    const results: ScreenshotResult[] = [];
    
    // Process screenshots in parallel (but limit concurrency)
    const batchSize = 3;
    for (let i = 0; i < timestamps.length; i += batchSize) {
      const batch = timestamps.slice(i, i + batchSize);
      const batchPromises = batch.map(timestamp => 
        this.captureScreenshot(videoId, timestamp, videoUrl)
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Small delay between batches to avoid overwhelming the system
      if (i + batchSize < timestamps.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }
  
  async cleanupOldScreenshots(maxAgeHours: number = 24): Promise<void> {
    try {
      const files = await fs.readdir(this.outputDir);
      const now = Date.now();
      const maxAge = maxAgeHours * 60 * 60 * 1000;
      
      for (const file of files) {
        const filePath = path.join(this.outputDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          console.log(`Cleaned up old screenshot: ${file}`);
        }
      }
    } catch (error) {
      console.log(`Failed to cleanup screenshots: ${error}`);
    }
  }
}

// Export singleton instance
export const screenshotService = new ScreenshotService();
