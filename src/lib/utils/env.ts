/**
 * Environment variable utilities
 * 
 * Ensures proper loading of environment variables from .env.local and .env files
 */

import dotenv from 'dotenv';
import path from 'path';

let envLoaded = false;

/**
 * Load environment variables with proper priority:
 * 1. .env.local (highest priority)
 * 2. .env (fallback)
 * 3. System environment variables
 */
export function loadEnvironmentVariables(): void {
  if (envLoaded) return;
  
  // Do not clear process.env in production; allow platform-injected vars to persist
  // Keep existing environment variables intact and only augment from files if present
  
  // Load .env.local first (highest priority) with override to ensure it takes precedence
  dotenv.config({ 
    path: path.resolve(process.cwd(), '.env.local'),
    override: true 
  });
  
  // Load .env as fallback (only if not already set)
  dotenv.config({ 
    path: path.resolve(process.cwd(), '.env'),
    override: false 
  });
  
  envLoaded = true;
  
  // Debug: Log which file was used
  console.log(`🔧 Environment loaded from .env.local: ${process.env.OPENAI_API_KEY ? '✅' : '❌'}`);
}

/**
 * Get environment variable with validation
 */
export function getEnvVar(name: string, required: boolean = true): string {
  loadEnvironmentVariables();
  
  const value = process.env[name];
  
  if (required && !value) {
    throw new Error(`Required environment variable ${name} is not set. Please check your .env.local or .env file.`);
  }
  
  return value || '';
}

/**
 * Check if all required API keys are available
 */
export function validateApiKeys(): { valid: boolean; missing: string[] } {
  loadEnvironmentVariables();
  
  const required = ['OPENAI_API_KEY', 'YOUTUBE_API_KEY'];
  const missing: string[] = [];
  
  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }
  
  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * Debug function to show which API keys are being used
 */
export function debugApiKeys(): void {
  loadEnvironmentVariables();
  
  console.log('🔍 API Key Debug Info:');
  console.log(`   OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.substring(0, 20)}...` : 'NOT SET'}`);
  console.log(`   YOUTUBE_API_KEY: ${process.env.YOUTUBE_API_KEY ? `${process.env.YOUTUBE_API_KEY.substring(0, 20)}...` : 'NOT SET'}`);
}
