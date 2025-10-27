/**
 * Preflight Checker for YouTube Recipe Videos
 * 
 * Blocks obvious non-recipe videos before heavy extraction.
 * Implements fast checks with ≤1s median response time.
 */

import { YouTubeDataAPI, createYouTubeAPI } from './youtubeDataApi';
import { parseYouTubeId } from './youtube';

export interface PreflightResult {
  pass: boolean;
  score: number;
  reason: string;
  borderline: boolean;
  allowOverride: boolean;
  checks: {
    duration: { pass: boolean; value: number; reason: string; costTier?: string };
    category: { score: number; categoryId: string };
    caption: { score: number; hasCaption: boolean };
    topic: { score: number; topics: string[] };
    patterns: { score: number; hits: number; patterns: string[] };
    antiSignals: { score: number; signals: string[] };
  };
  tinyClassifier?: {
    attempted: boolean;
    isRecipe: boolean;
    confidence: number;
  };
  costEstimate?: {
    tier: 'low' | 'moderate' | 'high' | 'very_high';
    estimatedProcessingTime: number;
    warningMessage?: string;
  };
  userMessage?: {
    title: string;
    description: string;
    suggestions: string[];
    canRetry: boolean;
  };
}

export class PreflightChecker {
  private youtubeAPI: YouTubeDataAPI | null;

  constructor() {
    this.youtubeAPI = createYouTubeAPI();
  }

  /**
   * Universal duration limits for all platforms
   */
  private getPlatformDurationLimits(platform: string): {
    maxDuration: number;
    warningDuration: number;
    moderateDuration: number;
    minDuration: number;
  } {
    // Universal limits for all platforms
    const UNIVERSAL_MAX_DURATION = 1200; // 20 minutes
    const UNIVERSAL_MIN_DURATION = 10; // 10 seconds
    
    // Return universal limits for all platforms
    return {
      maxDuration: UNIVERSAL_MAX_DURATION, // 20 minutes (universal limit)
      warningDuration: 600, // 10 minutes (warning threshold)
      moderateDuration: 300, // 5 minutes (moderate threshold)
      minDuration: UNIVERSAL_MIN_DURATION // 10 seconds minimum (universal limit)
    };
  }

  /**
   * Detect platform from URL
   */
  private detectPlatform(url: string): 'YouTube' | 'TikTok' | 'Instagram' | 'unknown' {
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

  /**
   * Universal preflight check for all platforms
   */
  async checkVideo(url: string): Promise<PreflightResult> {
    const startTime = Date.now();
    const platform = this.detectPlatform(url);
    
    if (platform === 'unknown') {
      return {
        pass: false,
        score: -100,
        reason: 'Unsupported platform',
        borderline: false,
        allowOverride: false,
        checks: this.getEmptyChecks()
      };
    }

    let result: PreflightResult;
    
    // For YouTube, use existing detailed checks
    if (platform === 'YouTube') {
      result = await this.checkYouTubeVideo(url);
    } else {
      // For TikTok and Instagram, use platform-specific checks
      result = await this.checkNonYouTubeVideo(url, platform);
    }
    
    // Add user-friendly message for failed checks
    if (!result.pass) {
      result.userMessage = this.generateUserMessage(result, platform);
    }
    
    return result;
  }

  /**
   * YouTube-specific preflight check (existing logic)
   */
  private async checkYouTubeVideo(url: string): Promise<PreflightResult> {
    const videoId = parseYouTubeId(url);
    
    if (!videoId) {
      return {
        pass: false,
        score: -100,
        reason: 'Invalid YouTube URL',
        borderline: false,
        allowOverride: false,
        checks: this.getEmptyChecks()
      };
    }

    // Stage 1: YouTube API call + light checks
    const stage1Result = await this.runStage1Checks(videoId);
    
    if (!stage1Result.checks.duration.pass) {
      return {
        ...stage1Result,
        reason: `Duration check failed: ${stage1Result.checks.duration.reason}`,
        allowOverride: false
      };
    }

    // Check if we can pass immediately
    if (stage1Result.pass) {
      return {
        ...stage1Result,
        reason: 'Passed all preflight checks',
        costEstimate: this.calculateCostEstimate(stage1Result.checks.duration.costTier || 'low', stage1Result.score)
      };
    }

    // Stage 2: Tiny classifier for borderline cases
    if (stage1Result.borderline) {
      const stage2Result = await this.runStage2TinyClassifier(url, stage1Result);
      return {
        ...stage2Result,
        reason: stage2Result.pass ? 'Passed with tiny classifier' : 'Failed all checks'
      };
    }

    return {
      ...stage1Result,
      reason: 'Failed preflight checks'
    };
  }

  /**
   * Non-YouTube video preflight check (TikTok, Instagram)
   */
  private async checkNonYouTubeVideo(url: string, platform: 'TikTok' | 'Instagram'): Promise<PreflightResult> {
    const limits = this.getPlatformDurationLimits(platform);
    
    // For non-YouTube platforms, we can't get duration without processing
    // So we use URL-based heuristics and platform-specific rules
    
    const urlAnalysis = this.analyzeUrlForRecipeIndicators(url, platform);
    
    // Platform-specific content analysis
    const contentAnalysis = this.analyzePlatformContent(url, platform);
    
    // Combine URL and content analysis
    const totalScore = urlAnalysis.score + contentAnalysis.score;
    
    // Decision logic based on platform
    let pass = false;
    let reason = '';
    let borderline = false;
    
    if (platform === 'TikTok') {
      // TikTok videos are generally short, so be more permissive
      pass = totalScore >= 0; // Allow neutral or positive scores
      borderline = totalScore >= -1 && totalScore < 0; // Allow slightly negative scores as borderline
      reason = pass ? 'TikTok video appears to be a recipe' : 
               borderline ? 'TikTok video may contain a recipe' : 
               'TikTok video unlikely to be a recipe';
    } else if (platform === 'Instagram') {
      // Instagram videos are very short, so be more permissive too
      pass = totalScore >= 0; // Allow neutral or positive scores
      borderline = totalScore >= -1 && totalScore < 0; // Allow slightly negative scores as borderline
      reason = pass ? 'Instagram video appears to be a recipe' : 
               borderline ? 'Instagram video may contain a recipe' : 
               'Instagram video unlikely to be a recipe';
    }
    
    // Determine cost estimate based on platform and score
    let costTier: 'low' | 'moderate' | 'high' | 'very_high' = 'low';
    let estimatedProcessingTime = 60; // Default 1 minute
    let warningMessage: string | undefined;

    if (platform === 'TikTok') {
      if (totalScore < 0) {
        costTier = 'high';
        estimatedProcessingTime = 120;
        warningMessage = 'TikTok video has low recipe confidence - processing may be expensive';
      } else if (totalScore < 1) {
        costTier = 'moderate';
        estimatedProcessingTime = 90;
      }
    } else if (platform === 'Instagram') {
      if (totalScore < 0) {
        costTier = 'high';
        estimatedProcessingTime = 120;
        warningMessage = 'Instagram video has low recipe confidence - processing may be expensive';
      } else if (totalScore < 1) {
        costTier = 'moderate';
        estimatedProcessingTime = 90;
      }
    }

    return {
      pass,
      score: totalScore,
      reason,
      borderline,
      allowOverride: true, // Always allow override for non-YouTube
      checks: {
        duration: { pass: true, value: 0, reason: 'Duration check not available for this platform', costTier: 'low' },
        category: { score: 0, categoryId: platform },
        caption: { score: 0, hasCaption: false },
        topic: { score: 0, topics: [] },
        patterns: { score: urlAnalysis.score, hits: urlAnalysis.hits, patterns: urlAnalysis.patterns },
        antiSignals: { score: contentAnalysis.antiScore, signals: contentAnalysis.antiSignals }
      },
      costEstimate: {
        tier: costTier,
        estimatedProcessingTime,
        warningMessage
      }
    };
  }

  /**
   * Stage 1: YouTube API call + light checks (no LLM)
   */
  private async runStage1Checks(videoId: string): Promise<PreflightResult> {
    if (!this.youtubeAPI) {
      return {
        pass: false,
        score: -100,
        reason: 'YouTube API not configured',
        borderline: false,
        allowOverride: true,
        checks: this.getEmptyChecks()
      };
    }

    try {
      // Enhanced API call with topicDetails
      const baseUrl = 'https://www.googleapis.com/youtube/v3';
      const apiKey = process.env.YOUTUBE_API_KEY;
      const url = `${baseUrl}/videos?id=${videoId}&key=${apiKey}&part=snippet,contentDetails,topicDetails`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.error || !data.items || data.items.length === 0) {
        return {
          pass: false,
          score: -100,
          reason: 'Failed to fetch video metadata',
          borderline: false,
          allowOverride: true,
          checks: this.getEmptyChecks()
        };
      }

      const video = data.items[0];
      const snippet = video.snippet;
      const contentDetails = video.contentDetails;
      const topicDetails = video.topicDetails;

      // Duration check (hard gate)
      const duration = YouTubeDataAPI.parseDuration(contentDetails.duration);
      const durationCheck = this.checkDuration(duration, 'YouTube');

      // Category check
      const categoryCheck = this.checkCategory(snippet.categoryId);

      // Caption check
      const captionCheck = this.checkCaption(contentDetails.caption);

      // Topic check
      const topicCheck = this.checkTopics(topicDetails?.topicCategories || []);

      // Pattern matching on description
      const description = snippet.description || '';
      const title = snippet.title || '';
      const patternCheck = this.checkPatterns(description);

      // Anti-signals check
      const antiSignalCheck = this.checkAntiSignals(title, description);

      const totalScore = categoryCheck.score + captionCheck.score + topicCheck.score + 
                        patternCheck.score + antiSignalCheck.score;

      const hasPatternHits = patternCheck.hits > 0;
      const hasAntiSignals = antiSignalCheck.score < 0;
      
      // More balanced scoring - don't require pattern hits if no anti-signals
      // Pass if: duration OK AND (has patterns OR no anti-signals with decent score)
      const pass = durationCheck.pass && (hasPatternHits || (!hasAntiSignals && totalScore >= 1));
      const borderline = durationCheck.pass && !pass && totalScore >= 0;

      return {
        pass,
        score: totalScore,
        reason: '',
        borderline,
        allowOverride: borderline,
        checks: {
          duration: durationCheck,
          category: categoryCheck,
          caption: captionCheck,
          topic: topicCheck,
          patterns: patternCheck,
          antiSignals: antiSignalCheck
        }
      };

    } catch (error) {
      return {
        pass: false,
        score: -100,
        reason: `API call failed: ${error}`,
        borderline: false,
        allowOverride: true,
        checks: this.getEmptyChecks()
      };
    }
  }

  /**
   * Stage 2: Tiny classifier for borderline cases
   */
  private async runStage2TinyClassifier(url: string, stage1Result: PreflightResult): Promise<PreflightResult> {
    const tinyClassifier = {
      attempted: true,
      isRecipe: false,
      confidence: 0
    };

    try {
      // Get video context for classifier input
      const videoId = parseYouTubeId(url);
      if (!this.youtubeAPI || !videoId) {
        return { ...stage1Result, tinyClassifier };
      }

      const videoData = await this.youtubeAPI.getVideoData(videoId);
      if (!videoData) {
        return { ...stage1Result, tinyClassifier };
      }

      // Prepare input: title + first 800 chars of description
      let content = videoData.title || '';
      content += ' ' + (videoData.description || '').substring(0, 800);

      // Simple rule-based classifier (can be replaced with actual tiny model)
      const isRecipe = this.runTinyClassifier(content);
      const confidence = isRecipe ? 0.8 : 0.2; // Mock confidence

      tinyClassifier.isRecipe = isRecipe;
      tinyClassifier.confidence = confidence;

      const pass = isRecipe && confidence >= 0.7;

      return {
        ...stage1Result,
        pass,
        score: stage1Result.score + (pass ? 1 : -1),
        borderline: false,
        tinyClassifier
      };

    } catch (error) {
      // Classifier failed - continue with stage1 result
    }

    return {
      ...stage1Result,
      tinyClassifier
    };
  }

  // =========================
  // Individual Check Methods
  // =========================

  private checkDuration(duration: number, platform: string = 'YouTube'): { pass: boolean; value: number; reason: string; costTier: string } {
    const limits = this.getPlatformDurationLimits(platform);
    
    if (duration < limits.minDuration) {
      return { 
        pass: false, 
        value: duration, 
        reason: `Too short (< ${limits.minDuration}s)`,
        costTier: 'low'
      };
    }
    if (duration > limits.maxDuration) {
      return { 
        pass: false, 
        value: duration, 
        reason: `Too long (> ${Math.round(limits.maxDuration/60)}min)`,
        costTier: 'very_high'
      };
    }
    if (duration > limits.warningDuration) {
      return { 
        pass: true, 
        value: duration, 
        reason: `Very long video - high processing cost (${Math.round(duration/60)}min)`,
        costTier: 'high'
      };
    }
    if (duration > limits.moderateDuration) {
      return { 
        pass: true, 
        value: duration, 
        reason: `Long video - moderate processing cost (${Math.round(duration/60)}min)`,
        costTier: 'moderate'
      };
    }
    return { 
      pass: true, 
      value: duration, 
      reason: 'Duration OK',
      costTier: 'low'
    };
  }

  private checkCategory(categoryId: string): { score: number; categoryId: string } {
    const foodCategories = ['26', '27']; // Howto & Style, Education
    const negativeCategories = ['17', '20']; // Sports, Gaming
    
    if (foodCategories.includes(categoryId)) {
      return { score: 1, categoryId };
    }
    if (negativeCategories.includes(categoryId)) {
      return { score: -1, categoryId };
    }
    return { score: 0, categoryId };
  }

  private checkCaption(caption: string): { score: number; hasCaption: boolean } {
    const hasCaption = caption === 'true';
    return { score: hasCaption ? 1 : 0, hasCaption };
  }

  private checkTopics(topicCategories: string[]): { score: number; topics: string[] } {
    const foodTopics = topicCategories.filter(topic => 
      topic.includes('/Food') || topic.includes('/Cooking')
    );
    return { score: foodTopics.length * 2, topics: foodTopics };
  }

  private checkPatterns(text: string): { score: number; hits: number; patterns: string[] } {
    const patterns = [];
    let hits = 0;
    let score = 0;

    // Enhanced recipe pattern detection with weighted scoring
    const recipePatterns = {
      // Strong recipe indicators (high confidence)
      strong: {
        patterns: [
          // Quantities and measurements
          { regex: /\b\d+(\.\d+)?\s?(cup|cups|tbsp|tsp|g|grams?|kg|ml|l|oz|lb|pounds?)\b/gi, name: 'quantities' },
          // Cooking temperatures
          { regex: /\b(°F|°C|preheat(ed)?|degrees?)\b/gi, name: 'temperature' },
          // Cooking times
          { regex: /\b\d+\s?(min|mins|minutes?|hr|hour|hours?)\b/gi, name: 'cooking_time' },
          // Recipe structure
          { regex: /(ingredients?|recipe|instructions?|steps?|directions?)/gi, name: 'recipe_structure' },
          // Cooking methods
          { regex: /(bake|roast|fry|sauté|boil|simmer|grill|steam|blend|mix|stir|whisk)/gi, name: 'cooking_methods' },
          // Kitchen equipment
          { regex: /(oven|stove|pan|pot|bowl|knife|cutting board|mixer|blender)/gi, name: 'kitchen_equipment' }
        ],
        weight: 2
      },
      
      // Medium recipe indicators
      medium: {
        patterns: [
          // Step markers
          { regex: /^\s*(\d+\.|[-*•])\s+/m, name: 'step_markers' },
          // Food preparation terms
          { regex: /(chop|dice|slice|mince|grate|peel|wash|drain|season)/gi, name: 'preparation' },
          // Food categories
          { regex: /(appetizer|main course|dessert|side dish|soup|salad|pasta|bread)/gi, name: 'food_categories' },
          // Serving information
          { regex: /(serves?|servings?|portions?|people|guests?)/gi, name: 'serving_info' },
          // Difficulty levels
          { regex: /(easy|medium|hard|difficult|beginner|advanced|simple|quick)/gi, name: 'difficulty' }
        ],
        weight: 1
      },
      
      // Weak recipe indicators
      weak: {
        patterns: [
          // General food terms
          { regex: /(delicious|tasty|flavorful|yummy|amazing|perfect|best)/gi, name: 'food_descriptors' },
          // Meal times
          { regex: /(breakfast|lunch|dinner|snack|brunch|appetizer)/gi, name: 'meal_times' },
          // Cuisine types
          { regex: /(italian|mexican|chinese|indian|french|american|asian|mediterranean)/gi, name: 'cuisine_types' }
        ],
        weight: 0.5
      }
    };

    // Check each category
    Object.entries(recipePatterns).forEach(([category, config]) => {
      config.patterns.forEach(pattern => {
        if (pattern.regex.test(text)) {
          patterns.push(pattern.name);
      hits++;
          score += config.weight;
        }
      });
    });

    // Additional contextual recipe detection
    const contextualPatterns = this.detectContextualRecipePatterns(text);
    if (contextualPatterns.length > 0) {
      patterns.push(...contextualPatterns);
      hits += contextualPatterns.length;
      score += contextualPatterns.length * 1.5; // Higher weight for contextual patterns
    }

    return { score: Math.min(score, 10), hits, patterns }; // Cap score at 10
  }

  /**
   * Detect contextual recipe patterns based on combinations
   */
  private detectContextualRecipePatterns(text: string): string[] {
    const contextualPatterns: string[] = [];
    
    // Recipe title patterns
    if (text.includes('recipe') && (text.includes('for') || text.includes('how to'))) {
      contextualPatterns.push('recipe_title_pattern');
    }
    
    // Ingredient list patterns
    if (text.includes('ingredients') && (text.includes('list') || text.includes('needed'))) {
      contextualPatterns.push('ingredient_list_pattern');
    }
    
    // Step-by-step patterns
    if (text.includes('step') && (text.includes('by') || text.includes('instructions'))) {
      contextualPatterns.push('step_by_step_pattern');
    }
    
    // Cooking tutorial patterns
    if (text.includes('how to') && (text.includes('cook') || text.includes('make') || text.includes('prepare'))) {
      contextualPatterns.push('cooking_tutorial_pattern');
    }
    
    // Recipe sharing patterns
    if (text.includes('share') && (text.includes('recipe') || text.includes('favorite'))) {
      contextualPatterns.push('recipe_sharing_pattern');
    }
    
    // Food review patterns (can be recipe-related)
    if (text.includes('taste') && (text.includes('recipe') || text.includes('dish'))) {
      contextualPatterns.push('food_review_pattern');
    }
    
    return contextualPatterns;
  }

  private checkAntiSignals(title: string, description: string): { score: number; signals: string[] } {
    const text = `${title} ${description}`.toLowerCase();
    
    // Comprehensive anti-signal categories with weighted scoring
    const antiSignalCategories = {
      // High confidence non-recipe content (strong negative signals)
      strong: {
        signals: [
          'mukbang', 'asmr eating', 'eating challenge', 'food challenge',
          'vlog', 'daily vlog', 'lifestyle vlog', 'travel vlog',
          'reaction', 'reaction video', 'reacting to', 'first time watching',
          'prank', 'prank video', 'prank call', 'social experiment',
          'trailer', 'movie trailer', 'game trailer', 'teaser',
          'highlights', 'best moments', 'funny moments', 'compilation',
          'gaming', 'gameplay', 'let\'s play', 'walkthrough', 'speedrun',
          'music', 'song', 'music video', 'cover song', 'remix',
          'dance', 'dancing', 'choreography', 'dance challenge',
          'fashion', 'outfit', 'style', 'clothing haul', 'fashion week',
          'beauty', 'makeup', 'skincare', 'beauty routine', 'tutorial',
          'fitness', 'workout', 'gym', 'exercise', 'training',
          'travel', 'vacation', 'trip', 'adventure', 'exploring',
          'art', 'drawing', 'painting', 'craft', 'diy art',
          'comedy', 'funny', 'joke', 'meme', 'comedy skit',
          'tech', 'review', 'unboxing', 'tech news', 'gadget',
          'news', 'breaking news', 'current events', 'politics',
          'sports', 'football', 'basketball', 'soccer', 'tennis',
          'education', 'tutorial', 'how to', 'learn', 'course',
          'entertainment', 'show', 'series', 'episode', 'season'
        ],
        weight: -3
      },
      
      // Medium confidence non-recipe content
      medium: {
        signals: [
          'challenge', 'trend', 'viral', 'popular',
          'review', 'rating', 'opinion', 'thoughts',
          'unboxing', 'haul', 'shopping', 'buying',
          'lifestyle', 'day in my life', 'routine',
          'storytime', 'story time', 'personal story',
          'q&a', 'questions', 'ask me anything',
          'collab', 'collaboration', 'with',
          'live', 'streaming', 'live stream',
          'podcast', 'interview', 'conversation',
          'documentary', 'investigation', 'expose',
          'parody', 'satire', 'mockumentary',
          'animation', 'cartoon', 'animated',
          'gaming setup', 'room tour', 'house tour',
          'pet', 'animal', 'cat', 'dog', 'pets',
          'family', 'kids', 'children', 'baby',
          'relationship', 'dating', 'love', 'romance',
          'motivation', 'inspiration', 'mindset',
          'business', 'entrepreneur', 'startup',
          'finance', 'money', 'investment', 'budget'
        ],
        weight: -2
      },
      
      // Low confidence but still suspicious
      weak: {
        signals: [
          'subscribe', 'follow', 'like', 'share',
          'comment', 'turn on notifications',
          'sponsored', 'ad', 'advertisement',
          'partnership', 'brand deal',
          'giveaway', 'contest', 'win',
          'merch', 'merchandise', 'store',
          'patreon', 'support', 'donate',
          'discord', 'community', 'server',
          'social media', 'instagram', 'tiktok',
          'youtube', 'platform', 'creator',
          'influencer', 'content creator',
          'viral video', 'trending', 'popular',
          'new', 'latest', 'recent', 'update',
          'announcement', 'news', 'information'
        ],
        weight: -1
      }
    };
    
    let totalScore = 0;
    const foundSignals: string[] = [];
    
    // Check each category
    Object.entries(antiSignalCategories).forEach(([category, config]) => {
      const categorySignals = config.signals.filter(signal => text.includes(signal));
      if (categorySignals.length > 0) {
        foundSignals.push(...categorySignals);
        totalScore += categorySignals.length * config.weight;
      }
    });
    
    // Additional context-based detection
    const contextSignals = this.detectContextualAntiSignals(text);
    if (contextSignals.length > 0) {
      foundSignals.push(...contextSignals);
      totalScore += contextSignals.length * -2;
    }
    
    return { score: totalScore, signals: foundSignals };
  }

  /**
   * Detect contextual anti-signals based on patterns and combinations
   */
  private detectContextualAntiSignals(text: string): string[] {
    const contextualSignals: string[] = [];
    
    // Gaming-related patterns
    if (text.includes('game') && (text.includes('play') || text.includes('stream'))) {
      contextualSignals.push('gaming_content');
    }
    
    // Music-related patterns
    if (text.includes('song') || text.includes('music')) {
      if (text.includes('cover') || text.includes('remix') || text.includes('lyrics')) {
        contextualSignals.push('music_content');
      }
    }
    
    // Fashion/Beauty patterns
    if ((text.includes('outfit') || text.includes('style')) && 
        (text.includes('haul') || text.includes('try on'))) {
      contextualSignals.push('fashion_content');
    }
    
    // Vlog patterns
    if (text.includes('day') && (text.includes('life') || text.includes('routine'))) {
      contextualSignals.push('lifestyle_vlog');
    }
    
    // Reaction patterns
    if (text.includes('react') && (text.includes('first time') || text.includes('watching'))) {
      contextualSignals.push('reaction_content');
    }
    
    // Challenge patterns
    if (text.includes('challenge') && !text.includes('cooking') && !text.includes('recipe')) {
      contextualSignals.push('challenge_content');
    }
    
    // Educational non-cooking patterns
    if (text.includes('how to') && !text.includes('cook') && !text.includes('bake') && 
        !text.includes('recipe') && !text.includes('food')) {
      contextualSignals.push('non_cooking_tutorial');
    }
    
    return contextualSignals;
  }


  /**
   * Analyze URL for recipe indicators (for non-YouTube platforms)
   */
  private analyzeUrlForRecipeIndicators(url: string, platform: string): {
    score: number;
    hits: number;
    patterns: string[];
  } {
    const patterns = [];
    let hits = 0;
    let score = 0;

    // Extract username/handle from URL for analysis
    let username = '';
    if (platform === 'TikTok') {
      const match = url.match(/tiktok\.com\/@([^\/]+)/);
      username = match ? match[1] : '';
    } else if (platform === 'Instagram') {
      const match = url.match(/instagram\.com\/([^\/\?]+)/);
      username = match ? match[1] : '';
    }

    // Recipe-related username patterns
    const recipeUsernamePatterns = [
      'cook', 'chef', 'bake', 'recipe', 'food', 'kitchen', 'cooking', 'baking',
      'meal', 'dinner', 'lunch', 'breakfast', 'snack', 'dessert'
    ];

    if (username) {
      const lowerUsername = username.toLowerCase();
      const recipeUsernameHits = recipeUsernamePatterns.filter(pattern => 
        lowerUsername.includes(pattern)
      ).length;
      
      if (recipeUsernameHits > 0) {
        patterns.push('recipe_username');
        hits += recipeUsernameHits;
        score += Math.min(recipeUsernameHits, 2); // Cap at 2 points
      }
    }

    // URL path analysis
    const urlLower = url.toLowerCase();
    const urlRecipePatterns = [
      'recipe', 'cook', 'bake', 'food', 'kitchen', 'meal', 'cooking'
    ];

    const urlHits = urlRecipePatterns.filter(pattern => urlLower.includes(pattern)).length;
    if (urlHits > 0) {
      patterns.push('recipe_url');
      hits += urlHits;
      score += Math.min(urlHits, 1); // Cap at 1 point
    }

    return { score, hits, patterns };
  }

  /**
   * Analyze platform-specific content patterns
   */
  private analyzePlatformContent(url: string, platform: string): {
    score: number;
    antiScore: number;
    antiSignals: string[];
  } {
    let score = 0;
    let antiScore = 0;
    const antiSignals: string[] = [];

    // Enhanced platform-specific anti-signals
    const platformAntiSignals: Record<string, string[]> = {
      TikTok: [
        // Strong negative signals
        'dance', 'dancing', 'choreography', 'dance challenge', 'tiktok dance',
        'trend', 'trending', 'viral', 'viral video', 'popular',
        'challenge', 'food challenge', 'eating challenge', 'not a recipe',
        'prank', 'prank video', 'comedy', 'funny', 'joke', 'meme',
        'gaming', 'gameplay', 'let\'s play', 'streaming',
        'music', 'song', 'music video', 'cover', 'remix', 'lyrics',
        'fashion', 'outfit', 'style', 'clothing haul', 'fashion week',
        'beauty', 'makeup', 'skincare', 'beauty routine',
        'fitness', 'workout', 'gym', 'exercise', 'training',
        'travel', 'vacation', 'trip', 'adventure',
        'art', 'drawing', 'painting', 'craft', 'diy',
        'pets', 'animals', 'cat', 'dog', 'cute animals',
        'family', 'kids', 'children', 'baby', 'parenting',
        'relationship', 'dating', 'love', 'romance',
        'motivation', 'inspiration', 'mindset', 'life advice',
        'business', 'entrepreneur', 'startup', 'finance',
        'tech', 'review', 'unboxing', 'gadget',
        'news', 'current events', 'politics',
        'sports', 'football', 'basketball', 'soccer',
        'education', 'tutorial', 'how to', 'learn',
        'entertainment', 'show', 'series', 'episode',
        'storytime', 'story time', 'personal story',
        'q&a', 'questions', 'ask me anything',
        'collab', 'collaboration', 'with',
        'live', 'streaming', 'live stream',
        'podcast', 'interview', 'conversation',
        'documentary', 'investigation',
        'parody', 'satire', 'mockumentary',
        'animation', 'cartoon', 'animated',
        'gaming setup', 'room tour', 'house tour',
        'subscribe', 'follow', 'like', 'share',
        'sponsored', 'ad', 'advertisement',
        'giveaway', 'contest', 'win',
        'merch', 'merchandise', 'store'
      ],
      Instagram: [
        // Strong negative signals
        'fashion', 'outfit', 'style', 'clothing haul', 'fashion week',
        'beauty', 'makeup', 'skincare', 'beauty routine', 'tutorial',
        'travel', 'vacation', 'trip', 'adventure', 'exploring',
        'lifestyle', 'day in my life', 'routine', 'lifestyle vlog',
        'fitness', 'workout', 'gym', 'exercise', 'training',
        'gaming', 'gameplay', 'let\'s play', 'streaming',
        'music', 'song', 'music video', 'cover', 'remix',
        'art', 'drawing', 'painting', 'craft', 'diy art',
        'pets', 'animals', 'cat', 'dog', 'cute animals',
        'family', 'kids', 'children', 'baby', 'parenting',
        'relationship', 'dating', 'love', 'romance',
        'motivation', 'inspiration', 'mindset', 'life advice',
        'business', 'entrepreneur', 'startup', 'finance',
        'tech', 'review', 'unboxing', 'gadget',
        'news', 'current events', 'politics',
        'sports', 'football', 'basketball', 'soccer',
        'education', 'tutorial', 'how to', 'learn',
        'entertainment', 'show', 'series', 'episode',
        'storytime', 'story time', 'personal story',
        'q&a', 'questions', 'ask me anything',
        'collab', 'collaboration', 'with',
        'live', 'streaming', 'live stream',
        'podcast', 'interview', 'conversation',
        'documentary', 'investigation',
        'parody', 'satire', 'mockumentary',
        'animation', 'cartoon', 'animated',
        'gaming setup', 'room tour', 'house tour',
        'subscribe', 'follow', 'like', 'share',
        'sponsored', 'ad', 'advertisement',
        'giveaway', 'contest', 'win',
        'merch', 'merchandise', 'store'
      ]
    };

    const urlLower = url.toLowerCase();
    const username = this.extractUsernameFromUrl(url, platform);
    const textToAnalyze = `${urlLower} ${username}`.toLowerCase();

    // Check for anti-signals
    const relevantAntiSignals = platformAntiSignals[platform] || [];
    const foundAntiSignals = relevantAntiSignals.filter(signal => 
      textToAnalyze.includes(signal)
    );

    if (foundAntiSignals.length > 0) {
      antiScore = foundAntiSignals.length * -1;
      antiSignals.push(...foundAntiSignals);
    }

    // Platform-specific positive signals
    if (platform === 'TikTok') {
      // TikTok recipe creators often use specific hashtags or patterns
      const tiktokRecipePatterns = ['#recipe', '#cooking', '#food', '#bake', '#cook'];
      const tiktokHits = tiktokRecipePatterns.filter(pattern => 
        textToAnalyze.includes(pattern)
      ).length;
      score += tiktokHits;
    } else if (platform === 'Instagram') {
      // Instagram recipe content often has food-related indicators
      const instagramRecipePatterns = ['#recipe', '#food', '#cooking', '#baking', '#chef'];
      const instagramHits = instagramRecipePatterns.filter(pattern => 
        textToAnalyze.includes(pattern)
      ).length;
      score += instagramHits;
    }

    return { score, antiScore, antiSignals };
  }

  /**
   * Extract username from URL
   */
  private extractUsernameFromUrl(url: string, platform: string): string {
    try {
      if (platform === 'TikTok') {
        const match = url.match(/tiktok\.com\/@([^\/]+)/);
        return match ? match[1] : '';
      } else if (platform === 'Instagram') {
        const match = url.match(/instagram\.com\/([^\/\?]+)/);
        return match ? match[1] : '';
      }
      return '';
    } catch {
      return '';
    }
  }

  // Simple rule-based classifier (placeholder for tiny model)
  private runTinyClassifier(content: string): boolean {
    const text = content.toLowerCase();
    
    // Simple heuristics
    const recipeIndicators = [
      'ingredients', 'recipe', 'cook', 'bake', 'mix', 'stir', 'cup', 'tablespoon', 'teaspoon',
      'preheat', 'oven', 'pan', 'bowl', 'minutes', 'degrees'
    ];
    
    const antiIndicators = [
      'mukbang', 'vlog', 'reaction', 'prank', 'trailer', 'highlights', 'asmr'
    ];
    
    const positiveCount = recipeIndicators.filter(indicator => text.includes(indicator)).length;
    const negativeCount = antiIndicators.filter(indicator => text.includes(indicator)).length;
    
    return positiveCount >= 3 && negativeCount === 0;
  }

  /**
   * Calculate cost estimate based on duration tier and recipe confidence
   */
  private calculateCostEstimate(costTier: string, recipeScore: number): {
    tier: 'low' | 'moderate' | 'high' | 'very_high';
    estimatedProcessingTime: number;
    warningMessage?: string;
  } {
    let tier: 'low' | 'moderate' | 'high' | 'very_high' = 'low';
    let estimatedProcessingTime = 60; // Default 1 minute
    let warningMessage: string | undefined;

    // Base estimate on duration tier
    switch (costTier) {
      case 'very_high':
        tier = 'very_high';
        estimatedProcessingTime = 180; // 3 minutes
        warningMessage = 'Very long video - high processing cost expected';
        break;
      case 'high':
        tier = 'high';
        estimatedProcessingTime = 120; // 2 minutes
        warningMessage = 'Long video - moderate to high processing cost';
        break;
      case 'moderate':
        tier = 'moderate';
        estimatedProcessingTime = 90; // 1.5 minutes
        break;
      default:
        tier = 'low';
        estimatedProcessingTime = 60; // 1 minute
    }

    // Adjust based on recipe confidence
    if (recipeScore < 2) {
      tier = tier === 'low' ? 'moderate' : tier === 'moderate' ? 'high' : 'very_high';
      estimatedProcessingTime += 30; // Add 30 seconds for low confidence
      warningMessage = warningMessage || 'Low recipe confidence - processing may be expensive';
    }

    return {
      tier,
      estimatedProcessingTime,
      warningMessage
    };
  }

  /**
   * Generate user-friendly error messages based on preflight results
   */
  private generateUserMessage(result: PreflightResult, platform: string): {
    title: string;
    description: string;
    suggestions: string[];
    canRetry: boolean;
  } {
    const { checks, score, borderline } = result;
    const antiSignals = checks.antiSignals.signals;
    const patterns = checks.patterns.patterns;
    
    // Duration-based messages
    if (!checks.duration.pass) {
      if (checks.duration.reason.includes('Too long')) {
        return {
          title: "📹 Video Too Long",
          description: "This video is longer than 20 minutes, which is beyond our processing limit for recipe extraction.",
          suggestions: [
            "Try a shorter cooking video (under 20 minutes)",
            "Look for recipe tutorials or cooking demos",
            "Check if there's a shorter version of this video"
          ],
          canRetry: false
        };
      } else if (checks.duration.reason.includes('Too short')) {
        return {
          title: "⏱️ Video Too Short",
          description: "This video is too short to contain a complete recipe.",
          suggestions: [
            "Try a longer cooking video (at least 30 seconds)",
            "Look for full recipe tutorials",
            "Check cooking channels for complete recipes"
          ],
          canRetry: false
        };
      }
    }
    
    // Content-based messages
    if (antiSignals.length > 0) {
      const primarySignal = antiSignals[0];
      
      // Gaming content
      if (primarySignal.includes('gaming') || primarySignal.includes('gameplay')) {
        return {
          title: "🎮 Gaming Content Detected",
          description: "This appears to be a gaming video, not a cooking recipe.",
          suggestions: [
            "Try searching for cooking or recipe videos",
            "Look for food channels on YouTube",
            "Check cooking websites for recipe content"
          ],
          canRetry: false
        };
      }
      
      // Music content
      if (primarySignal.includes('music') || primarySignal.includes('song')) {
        return {
          title: "🎵 Music Content Detected",
          description: "This appears to be a music video, not a cooking recipe.",
          suggestions: [
            "Try searching for cooking or recipe videos",
            "Look for food channels on YouTube",
            "Check cooking websites for recipe content"
          ],
          canRetry: false
        };
      }
      
      // Dance content
      if (primarySignal.includes('dance') || primarySignal.includes('dancing')) {
        return {
          title: "💃 Dance Content Detected",
          description: "This appears to be a dance video, not a cooking recipe.",
          suggestions: [
            "Try searching for cooking or recipe videos",
            "Look for food channels on YouTube",
            "Check cooking websites for recipe content"
          ],
          canRetry: false
        };
      }
      
      // Fashion/Beauty content
      if (primarySignal.includes('fashion') || primarySignal.includes('beauty') || primarySignal.includes('makeup')) {
        return {
          title: "💄 Fashion/Beauty Content Detected",
          description: "This appears to be a fashion or beauty video, not a cooking recipe.",
          suggestions: [
            "Try searching for cooking or recipe videos",
            "Look for food channels on YouTube",
            "Check cooking websites for recipe content"
          ],
          canRetry: false
        };
      }
      
      // Vlog content
      if (primarySignal.includes('vlog') || primarySignal.includes('lifestyle')) {
        return {
          title: "📱 Lifestyle Vlog Detected",
          description: "This appears to be a lifestyle vlog, not a cooking recipe.",
          suggestions: [
            "Try searching for cooking or recipe videos",
            "Look for food channels on YouTube",
            "Check cooking websites for recipe content"
          ],
          canRetry: false
        };
      }
      
      // Reaction content
      if (primarySignal.includes('reaction') || primarySignal.includes('reacting')) {
        return {
          title: "👀 Reaction Video Detected",
          description: "This appears to be a reaction video, not a cooking recipe.",
          suggestions: [
            "Try searching for cooking or recipe videos",
            "Look for food channels on YouTube",
            "Check cooking websites for recipe content"
          ],
          canRetry: false
        };
      }
      
      // Generic non-recipe content
      return {
        title: "🚫 Not a Recipe Video",
        description: "This video doesn't appear to contain cooking or recipe content.",
        suggestions: [
          "Try searching for cooking or recipe videos",
          "Look for food channels on YouTube",
          "Check cooking websites for recipe content"
        ],
        canRetry: false
      };
    }
    
    // Low recipe confidence
    if (score < 1 && patterns.length === 0) {
      return {
        title: "🤔 Unclear Recipe Content",
        description: "We couldn't detect clear recipe indicators in this video. It might not be a cooking video.",
        suggestions: [
          "Try a video with clear cooking instructions",
          "Look for videos with ingredient lists or cooking steps",
          "Check if the video title mentions cooking or recipes"
        ],
        canRetry: true
      };
    }
    
    // Borderline cases
    if (borderline) {
      return {
        title: "⚠️ Uncertain Recipe Content",
        description: "This video might contain a recipe, but we're not completely sure. Processing could be expensive.",
        suggestions: [
          "Try a video with clearer recipe indicators",
          "Look for videos with cooking instructions in the title",
          "Check cooking channels for better recipe content"
        ],
        canRetry: true
      };
    }
    
    // Default message
    return {
      title: "❌ Not a Recipe Video",
      description: "This video doesn't appear to contain cooking or recipe content.",
      suggestions: [
        "Try searching for cooking or recipe videos",
        "Look for food channels on YouTube",
        "Check cooking websites for recipe content"
      ],
      canRetry: false
    };
  }

  private getEmptyChecks() {
    return {
      duration: { pass: false, value: 0, reason: '' },
      category: { score: 0, categoryId: '' },
      caption: { score: 0, hasCaption: false },
      topic: { score: 0, topics: [] },
      patterns: { score: 0, hits: 0, patterns: [] },
      antiSignals: { score: 0, signals: [] }
    };
  }
}

export const preflightChecker = new PreflightChecker();
