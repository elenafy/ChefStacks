/**
 * File Watcher for Automatic Cleanup
 * Watches for player-script.js files and automatically removes them
 */

import { watch } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';

export class PlayerScriptWatcher {
  private watcher: any = null;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Start watching for player-script.js files
   */
  start(): void {
    if (this.watcher) {
      return; // Already watching
    }

    try {
      this.watcher = watch(this.projectRoot, (eventType, filename) => {
        if (filename && filename.match(/^\d+-player-script\.js$/)) {
          console.log(`🗑️  Auto-removing player-script.js file: ${filename}`);
          this.removeFile(filename);
        }
      });
      
      console.log('👀 Watching for player-script.js files...');
    } catch (error) {
      console.error('Failed to start file watcher:', error);
    }
  }

  /**
   * Stop watching
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('🛑 Stopped watching for player-script.js files');
    }
  }

  /**
   * Remove a specific file
   */
  private async removeFile(filename: string): Promise<void> {
    try {
      const filePath = path.join(this.projectRoot, filename);
      await unlink(filePath);
      console.log(`✅ Removed: ${filename}`);
    } catch (error) {
      console.error(`❌ Failed to remove ${filename}:`, error);
    }
  }
}

// Auto-start watcher in development
if (process.env.NODE_ENV === 'development') {
  const watcher = new PlayerScriptWatcher(process.cwd());
  watcher.start();
  
  // Clean up on exit
  process.on('SIGINT', () => {
    watcher.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    watcher.stop();
    process.exit(0);
  });
}
