// lib/memoriesAiService.ts
// Memories.ai API integration for video recipe extraction

export interface MemoriesAiConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface MemoriesAiUploadResponse {
  code: string;
  msg: string;
  data: {
    taskId: string;
    videoNos?: string[];
  };
  failed: boolean;
  success: boolean;
}

export interface MemoriesAiVideoStatus {
  code: string;
  msg: string;
  data: {
    taskId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    videoNos?: string[];
    error?: string;
  };
  failed: boolean;
  success: boolean;
}

export interface MemoriesAiChatResponse {
  code: string;
  msg: string;
  data: {
    response?: string;
    message?: string;
    text?: string;
    content?: string;
    videoNos?: string[];
  };
  response?: string;
  message?: string;
  text?: string;
  content?: string;
  failed: boolean;
  success: boolean;
}

export class MemoriesAiService {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: MemoriesAiConfig) {
    this.apiKey = config.apiKey;
    // Try different possible base URLs
    this.baseUrl = config.baseUrl || 'https://api.memories.ai';
  }

  /**
   * Test basic API connectivity with a simple request
   */
  async testBasicConnectivity(): Promise<{ success: boolean; error?: string; details?: any }> {
    try {
      console.log('🧪 Testing basic Memories.ai API connectivity...');
      
      // Try a simple GET request to see if the API is reachable
      const response = await fetch(`${this.baseUrl}/serve/api/v1/`, {
        method: 'GET',
        headers: {
          'Authorization': this.apiKey,
        }
      });

      console.log('📡 Basic connectivity response:', response.status, response.statusText);
      const responseText = await response.text();
      console.log('📋 Basic connectivity body:', responseText);
      
      return {
        success: response.ok,
        details: { status: response.status, body: responseText }
      };
      
    } catch (error) {
      console.error('❌ Basic connectivity test failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error
      };
    }
  }

  /**
   * Test API connection and authentication
   */
  async testConnection(): Promise<{ success: boolean; error?: string; details?: any; workingEndpoint?: string }> {
    try {
      console.log('🧪 Testing Memories.ai API connection...');
      console.log('🔑 API Key:', this.apiKey ? `${this.apiKey.substring(0, 8)}...` : 'NOT SET');
      console.log('🌐 Base URL:', this.baseUrl);
      
      // Try different possible base URLs and endpoints
      const possibleBaseUrls = [
        'https://api.memories.ai',
        'https://memories.ai/api',
        'https://memories.ai',
        'https://api.memories.ai/api'
      ];
      
      const possibleEndpoints = [
        '/serve/api/v1/scraper_url',
        '/api/v1/scraper_url',
        '/v1/scraper_url',
        '/scraper_url',
        '/upload',
        '/api/upload'
      ];
      
      for (const baseUrl of possibleBaseUrls) {
        console.log(`🌐 Trying base URL: ${baseUrl}`);
        
        for (const endpoint of possibleEndpoints) {
          console.log(`🔍 Trying endpoint: ${baseUrl}${endpoint}`);
          
          try {
            const response = await fetch(`${baseUrl}${endpoint}`, {
              method: 'POST',
              headers: {
                'Authorization': this.apiKey,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                video_urls: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'], // Test URL
                quality: '720'
              })
            });

            console.log(`📡 Response for ${baseUrl}${endpoint}:`, response.status, response.statusText);
            
            const responseText = await response.text();
            console.log(`📋 Response body for ${baseUrl}${endpoint}:`, responseText);
            
            if (response.ok) {
              const result = JSON.parse(responseText);
              return {
                success: true,
                details: result,
                workingEndpoint: `${baseUrl}${endpoint}`
              };
            } else if (response.status !== 405) {
              // If it's not a 405 (method not allowed), this might be the right endpoint but with other issues
              return {
                success: false,
                error: `HTTP ${response.status}: ${response.statusText}`,
                details: responseText,
                workingEndpoint: `${baseUrl}${endpoint}`
              };
            }
          } catch (endpointError) {
            console.log(`❌ Endpoint ${baseUrl}${endpoint} failed:`, endpointError);
          }
        }
      }
      
      return {
        success: false,
        error: 'No working endpoint found - all returned 405 Method Not Allowed',
        details: 'Tried multiple possible endpoints'
      };
      
    } catch (error) {
      console.error('❌ Connection test failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error
      };
    }
  }

  /**
   * Upload a video from YouTube/TikTok URL using the scraper_url endpoint
   */
  async uploadVideoFromUrl(videoUrl: string, quality: '360' | '480' | '720' | '1080' | '1440' | '2160' = '1080'): Promise<MemoriesAiUploadResponse> {
    console.log('🔑 Using API key:', this.apiKey ? `${this.apiKey.substring(0, 8)}...` : 'NOT SET');
    console.log('🌐 Base URL:', this.baseUrl);
    console.log('📹 Video URL:', videoUrl);
    
    // Try different authorization formats based on Memories.ai docs
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // According to docs, Memories.ai uses direct API key in Authorization header
    headers['Authorization'] = this.apiKey;
    
    const response = await fetch(`${this.baseUrl}/serve/api/v1/scraper_url`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        video_urls: [videoUrl],
        quality: quality
      })
    });

    console.log('📡 Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ HTTP Error Response:', errorText);
      throw new Error(`Memories.ai upload failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    console.log('📋 Upload response:', JSON.stringify(result, null, 2));
    
    // Check if the upload was successful
    if (!result.success || result.failed) {
      console.error('❌ Upload failed:', result.msg, 'Code:', result.code);
      
      // Provide specific error messages based on error codes
      if (result.code === '0401') {
        throw new Error('Invalid API key - please check your Memories.ai API key');
      } else if (result.code === '9009') {
        throw new Error('Permission denied - your API key may not have upload permissions');
      } else {
        throw new Error(`Upload failed: ${result.msg} (Code: ${result.code})`);
      }
    }
    
    // Check if we have a taskId in the data object
    if (!result.data || !result.data.taskId) {
      console.error('❌ No taskId in upload response data:', result);
      throw new Error('Upload response missing taskId in data object');
    }
    
    // Check if the upload response contains video numbers directly
    if (result.data.videoNos && Array.isArray(result.data.videoNos) && result.data.videoNos.length > 0) {
      console.log('🎉 Upload response contains video numbers directly:', result.data.videoNos);
      console.log('💡 This suggests the video might be processed immediately');
    }
    
    return result;
  }

  /**
   * Check the status of a video upload/processing task
   */
  async getVideoStatus(taskId: string): Promise<MemoriesAiVideoStatus> {
    if (!taskId || taskId === 'undefined') {
      throw new Error('Invalid task ID provided to getVideoStatus');
    }

    console.log('🔍 Checking status for task ID:', taskId);
    
    // Try different possible status endpoints
    const possibleStatusEndpoints = [
      `/serve/api/v1/task_status/${taskId}`,
      `/api/v1/task_status/${taskId}`,
      `/v1/task_status/${taskId}`,
      `/task_status/${taskId}`,
      `/status/${taskId}`,
      `/api/status/${taskId}`,
      `/serve/api/v1/status/${taskId}`
    ];
    
    for (const endpoint of possibleStatusEndpoints) {
      try {
        console.log(`🔍 Trying status endpoint: ${this.baseUrl}${endpoint}`);
        
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          method: 'GET',
          headers: {
            'Authorization': this.apiKey,
          }
        });

        console.log(`📡 Status response for ${endpoint}:`, response.status, response.statusText);
        
        if (response.ok) {
          const result = await response.json();
          console.log('📊 Status response:', JSON.stringify(result, null, 2));
          return result;
        } else if (response.status !== 404) {
          // If it's not a 404, this might be the right endpoint but with other issues
          const errorText = await response.text();
          console.log(`📋 Status error response for ${endpoint}:`, errorText);
          throw new Error(`Memories.ai status check failed: ${response.status} ${errorText}`);
        }
      } catch (endpointError) {
        console.log(`❌ Status endpoint ${endpoint} failed:`, endpointError);
        if (endpointError instanceof Error && !endpointError.message.includes('404')) {
          throw endpointError; // Re-throw if it's not a 404
        }
      }
    }
    
    throw new Error(`No working status endpoint found for task ID: ${taskId}`);
  }

  /**
   * Wait for video processing to complete
   */
  async waitForVideoProcessing(taskId: string, maxWaitTime: number = 300000): Promise<string[]> {
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds

    console.log(`⏳ Starting to wait for video processing, task ID: ${taskId}`);

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const status = await this.getVideoStatus(taskId);
        
        // Check if the status check was successful
        if (!status.success || status.failed) {
          throw new Error(`Status check failed: ${status.msg}`);
        }
        
        if (status.data.status === 'completed' && status.data.videoNos) {
          console.log(`✅ Video processing completed, video numbers: ${status.data.videoNos}`);
          return status.data.videoNos;
        }
        
        if (status.data.status === 'failed') {
          throw new Error(`Video processing failed: ${status.data.error || 'Unknown error'}`);
        }

        console.log(`⏳ Processing status: ${status.data.status}, waiting...`);
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        console.log(`❌ Status check failed, but continuing to retry: ${error}`);
        
        // If it's a "no working endpoint" error, maybe the API doesn't use status checking
        // Let's try a different approach - maybe we can proceed directly to chat
        if (error instanceof Error && error.message.includes('No working status endpoint found')) {
          console.log(`🤔 No status endpoint found. Trying alternative approach...`);
          
          // Maybe the API processes videos immediately or uses a different mechanism
          // Let's try to extract recipe directly with the task ID as video number
        console.log(`🔄 Attempting to use task ID as video number for chat...`);
        console.log(`📝 Task ID being used as video number: ${taskId}`);
        return [taskId]; // Use task ID as video number
        }
        
        // For other errors, wait and retry
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error('Video processing timeout');
  }

  /**
   * Check if videos are ready for chat (in PARSE status)
   */
  async checkVideoStatus(videoNos: string[]): Promise<boolean> {
    console.log(`🔍 Checking if videos are ready for chat:`, videoNos);
    
    // Try to get video status using different possible endpoints
    const possibleStatusEndpoints = [
      `/serve/api/v1/video_status`,
      `/api/v1/video_status`,
      `/v1/video_status`,
      `/video_status`,
      `/api/video_status`
    ];
    
    for (const endpoint of possibleStatusEndpoints) {
      try {
        console.log(`🔍 Trying video status endpoint: ${this.baseUrl}${endpoint}`);
        
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Authorization': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            videoNos: videoNos
          })
        });

        if (response.ok) {
          const result = await response.json();
          console.log('📊 Video status response:', JSON.stringify(result, null, 2));
          
          // Check if videos are in PARSE status
          if (result.data && result.data.videos) {
            const allReady = result.data.videos.every((video: any) => video.status === 'PARSE');
            console.log(`📊 Videos ready for chat: ${allReady}`);
            return allReady;
          }
        }
      } catch (error) {
        console.log(`❌ Video status endpoint ${endpoint} failed:`, error);
      }
    }
    
    console.log(`⚠️ Could not check video status, proceeding with chat attempt`);
    return true; // Proceed anyway if we can't check status
  }

  /**
   * Send a chat message to extract recipe information from videos
   */
  async extractRecipeFromVideos(videoNos: string[], prompt?: string): Promise<MemoriesAiChatResponse> {
    console.log(`💬 Starting recipe extraction with video numbers:`, videoNos);
    console.log(`📝 Video numbers type:`, typeof videoNos, 'Length:', videoNos.length);
    
    const defaultPrompt = `I need you to analyze this cooking video and extract a complete recipe. Please provide:

**Recipe Title**: [Name of the dish]

**Ingredients**: 
- [List each ingredient with exact quantities and units]

**Instructions**: 
1. [Step-by-step cooking instructions]
2. [Continue with each step]

**Cooking Time**: 
- Prep time: [X minutes]
- Cook time: [X minutes] 
- Total time: [X minutes]

**Servings**: [Number of servings]

**Difficulty**: [Easy/Medium/Hard]

Please analyze the video content carefully and provide a complete, detailed recipe. If this is not a cooking video, please say "This video does not contain recipe content."`;

    // Try different possible chat endpoints and parameter formats
    const possibleChatEndpoints = [
      `/serve/api/v1/chat`,
      `/api/v1/chat`,
      `/v1/chat`,
      `/chat`,
      `/api/chat`,
      `/serve/api/v1/video_chat`,
      `/api/v1/video_chat`
    ];
    
    // Based on Memories.ai API docs, the correct parameter is 'videoNos' (capital N)
    const parameterVariations = [
      { videoNos: videoNos, prompt: prompt || defaultPrompt }, // Correct format from docs
      { videoNos: videoNos, prompt: prompt || defaultPrompt }, // Correct format
      { video_ids: videoNos, prompt: prompt || defaultPrompt },
      { videos: videoNos, prompt: prompt || defaultPrompt },
      { task_id: videoNos[0], prompt: prompt || defaultPrompt },
      { video_numbers: videoNos, prompt: prompt || defaultPrompt },
      // Try with different video number formats
      { videoNos: videoNos.map(v => v.split('_')[0]), prompt: prompt || defaultPrompt },
      { videoNos: videoNos.map(v => v.split('_')[1]), prompt: prompt || defaultPrompt }
    ];
    
    for (const endpoint of possibleChatEndpoints) {
      for (const requestBody of parameterVariations) {
        try {
          console.log(`💬 Trying chat endpoint: ${this.baseUrl}${endpoint}`);
          console.log(`📤 Chat request body:`, JSON.stringify(requestBody, null, 2));
          console.log(`📝 Prompt being sent:`, requestBody.prompt);
        
          const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'POST',
            headers: {
              'Authorization': this.apiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
          });

          console.log(`📡 Chat response for ${endpoint}:`, response.status, response.statusText);

          if (response.ok) {
            const result = await response.json();
            console.log('💬 Chat response:', JSON.stringify(result, null, 2));
            
            // Check if the chat request was successful
            if (!result.success || result.failed) {
              console.error('❌ Chat failed:', result.msg);
              console.error('❌ Chat error code:', result.code);
              console.error('❌ Full error response:', JSON.stringify(result, null, 2));
              // Don't throw immediately, try other parameter variations
              continue;
            }
            
            console.log('✅ Chat successful! Response structure:', JSON.stringify(result, null, 2));
            console.log('✅ Response keys:', Object.keys(result));
            if (result.data) {
              console.log('✅ Data keys:', Object.keys(result.data));
              console.log('✅ Data values:', result.data);
            }
            
            // Also log the raw response text for debugging
            console.log('✅ Raw response text length:', JSON.stringify(result).length);
            console.log('✅ Raw response preview:', JSON.stringify(result).substring(0, 500) + '...');
            
            return result;
          } else {
            // Log all non-200 responses for debugging
            const errorText = await response.text();
            console.log(`📋 Chat error response for ${endpoint}:`, response.status, response.statusText);
            console.log(`📋 Chat error body:`, errorText);
            // Don't throw immediately, try other parameter variations
            continue;
          }
        } catch (endpointError) {
          console.log(`❌ Chat endpoint ${endpoint} with parameters failed:`, endpointError);
          // Continue to next parameter variation
        }
      }
    }
    
    // If we get here, let's try one more approach - maybe the API expects a different format
    console.log('🔄 Trying final fallback approach...');
    
    // Try with minimal parameters and simple questions
    const simplePrompts = [
      "Hello, can you see these videos?",
      "What do you see in this video?",
      "Is this a cooking video?",
      "What is happening in this video?",
      "Describe what you see in this video.",
      "Analyze this video content",
      "What is the main subject of this video?",
      "Summarize this video"
    ];
    
    for (const simplePrompt of simplePrompts) {
      try {
        console.log(`🔄 Trying simple prompt: "${simplePrompt}"`);
        const response = await fetch(`${this.baseUrl}/serve/api/v1/chat`, {
          method: 'POST',
          headers: {
            'Authorization': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            videoNos: videoNos,
            prompt: simplePrompt
          })
        });

        const responseText = await response.text();
        console.log(`📋 Simple prompt "${simplePrompt}" response:`, response.status, response.statusText);
        console.log(`📋 Simple prompt response body:`, responseText);
        
        if (response.ok) {
          const result = JSON.parse(responseText);
          console.log(`✅ Simple prompt "${simplePrompt}" successful!`);
          return result;
        }
      } catch (error) {
        console.log(`❌ Simple prompt "${simplePrompt}" failed:`, error);
      }
    }
    
    throw new Error(`No working chat endpoint or parameter combination found. Tried ${possibleChatEndpoints.length} endpoints with ${parameterVariations.length} parameter variations each.`);
  }

  /**
   * Test if a video is actually being processed by Memories.ai
   */
  async testVideoProcessing(videoUrl: string): Promise<{ success: boolean; details: any; error?: string }> {
    console.log('🧪 Testing video processing for:', videoUrl);
    console.log('📝 Video type:', videoUrl.includes('tiktok.com') ? 'TikTok' : videoUrl.includes('youtube.com') ? 'YouTube' : 'Other');
    try {
      
      // Upload the video
      const uploadResult = await this.uploadVideoFromUrl(videoUrl, '720');
      console.log('✅ Upload successful, task ID:', uploadResult.data.taskId);
      console.log('📋 Upload result:', JSON.stringify(uploadResult, null, 2));
      
      // Check if we got video numbers immediately
      if (uploadResult.data.videoNos && uploadResult.data.videoNos.length > 0) {
        console.log('🎉 Video numbers available immediately:', uploadResult.data.videoNos);
        return { 
          success: true, 
          details: { 
            uploadResult, 
            message: 'Video processed immediately',
            videoNos: uploadResult.data.videoNos
          } 
        };
      }
      
      // Wait longer for processing - videos might need more time
      console.log('⏳ Waiting 60 seconds for video processing...');
      await new Promise(resolve => setTimeout(resolve, 60000));
      
      // Try to get video status
      try {
        const status = await this.getVideoStatus(uploadResult.data.taskId);
        console.log('📊 Video status:', JSON.stringify(status, null, 2));
        return { success: true, details: { uploadResult, status } };
      } catch (statusError) {
        console.log('⚠️ Status check failed:', statusError);
        return { 
          success: true, 
          details: { 
            uploadResult, 
            statusError: statusError instanceof Error ? statusError.message : 'Unknown status error',
            message: 'Upload successful but status check failed'
          } 
        };
      }
      
    } catch (error) {
      console.error('❌ Video processing test failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error 
      };
    }
  }

  /**
   * Complete workflow: upload video, wait for processing, extract recipe
   */
  async extractRecipeFromUrl(videoUrl: string, quality: '360' | '480' | '720' | '1080' | '1440' | '2160' = '1080'): Promise<{
    videoNos: string[];
    recipeResponse: string;
    processingTime: number;
  }> {
    const startTime = Date.now();
    
    // Step 1: Upload video
    console.log('📤 Uploading video to Memories.ai...');
    const uploadResult = await this.uploadVideoFromUrl(videoUrl, quality);
    console.log('✅ Upload successful, task ID:', uploadResult.data.taskId);

    // Step 2: Check if video numbers are available immediately or wait for processing
    let videoNos: string[];
    
    if (uploadResult.data.videoNos && Array.isArray(uploadResult.data.videoNos) && uploadResult.data.videoNos.length > 0) {
      console.log('🎉 Video numbers available immediately from upload response:', uploadResult.data.videoNos);
      videoNos = uploadResult.data.videoNos;
    } else {
      console.log('⏳ Waiting for video processing...');
      videoNos = await this.waitForVideoProcessing(uploadResult.data.taskId);
      console.log('✅ Video processing complete, video numbers:', videoNos);
    }

    // Step 3: Check if videos are ready for chat
    console.log('🔍 Checking if videos are ready for chat...');
    const videosReady = await this.checkVideoStatus(videoNos);
    
    if (!videosReady) {
      console.log('⏳ Videos not ready yet, waiting a bit more...');
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
    }

    // Step 4: Extract recipe
    console.log('🍳 Extracting recipe information...');
    const chatResponse = await this.extractRecipeFromVideos(videoNos);
    console.log('✅ Recipe extraction complete');

    if (!chatResponse) {
      throw new Error('Chat response is null - recipe extraction failed');
    }

    // Try to find the response text in different possible locations
    let responseText: string | null = null;
    
    if (chatResponse.data?.response) {
      responseText = chatResponse.data.response;
    } else if (chatResponse.data?.message) {
      responseText = chatResponse.data.message;
    } else if (chatResponse.data?.text) {
      responseText = chatResponse.data.text;
    } else if (chatResponse.data?.content) {
      responseText = chatResponse.data.content;
    } else if (chatResponse.response) {
      responseText = chatResponse.response;
    } else if (chatResponse.message) {
      responseText = chatResponse.message;
    } else if (chatResponse.text) {
      responseText = chatResponse.text;
    } else if (chatResponse.content) {
      responseText = chatResponse.content;
    } else if (typeof chatResponse === 'string') {
      // If the entire response is a string, use it
      responseText = chatResponse;
    } else if (chatResponse.msg && typeof chatResponse.msg === 'string' && chatResponse.msg.length > 10) {
      // Sometimes the response might be in the msg field
      responseText = chatResponse.msg;
    }
    
    if (!responseText) {
      console.error('❌ Invalid chat response structure:', JSON.stringify(chatResponse, null, 2));
      console.error('❌ Chat response keys:', Object.keys(chatResponse));
      if (chatResponse.data) {
        console.error('❌ Chat response data keys:', Object.keys(chatResponse.data));
        console.error('❌ Chat response data values:', chatResponse.data);
      }
      
      // Try to find any string values in the response that might be the actual response
      console.log('🔍 Searching for any string values in the response...');
      const searchForStrings = (obj: any, path: string = ''): void => {
        if (typeof obj === 'string' && obj.length > 10) {
          console.log(`📝 Found string at ${path}:`, obj.substring(0, 200) + '...');
        } else if (typeof obj === 'object' && obj !== null) {
          Object.keys(obj).forEach(key => {
            searchForStrings(obj[key], path ? `${path}.${key}` : key);
          });
        }
      };
      searchForStrings(chatResponse);
      
      throw new Error('Invalid chat response structure - could not find response text in any expected field');
    }
    
    console.log('✅ Found response text:', responseText.substring(0, 200) + '...');

    const processingTime = Date.now() - startTime;
    
    return {
      videoNos,
      recipeResponse: responseText,
      processingTime
    };
  }
}

// Helper function to parse recipe response from Memories.ai
export function parseMemoriesAiRecipeResponse(response: string): {
  title?: string;
  ingredients: Array<{ text: string; qty?: string; unit?: string }>;
  steps: Array<{ order: number; text: string }>;
  times?: { prep_min?: number; cook_min?: number; total_min?: number };
  servings?: number;
  difficulty?: string;
  tips: string[];
} {
  const result: {
    title?: string;
    ingredients: Array<{ text: string; qty?: string; unit?: string }>;
    steps: Array<{ order: number; text: string }>;
    times?: { prep_min?: number; cook_min?: number; total_min?: number };
    servings?: number;
    difficulty?: string;
    tips: string[];
  } = {
    ingredients: [],
    steps: [],
    tips: []
  };

  // Simple parsing logic - this would need to be more sophisticated
  const lines = response.split('\n').map(line => line.trim()).filter(line => line);
  
  let currentSection = '';
  let stepCounter = 1;

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    if (lowerLine.includes('title') || lowerLine.includes('recipe')) {
      result.title = line.replace(/.*title[:\s]*/i, '').trim();
    } else if (lowerLine.includes('ingredient')) {
      currentSection = 'ingredients';
    } else if (lowerLine.includes('instruction') || lowerLine.includes('step')) {
      currentSection = 'steps';
    } else if (lowerLine.includes('tip')) {
      currentSection = 'tips';
    } else if (currentSection === 'ingredients' && line.match(/^[-•\*]\s/)) {
      const ingredientText = line.replace(/^[-•\*]\s*/, '');
      const parsed = parseIngredient(ingredientText);
      result.ingredients.push(parsed);
    } else if (currentSection === 'steps' && (line.match(/^\d+\./) || line.match(/^[-•\*]\s/))) {
      const stepText = line.replace(/^\d+\.\s*/, '').replace(/^[-•\*]\s*/, '');
      result.steps.push({ order: stepCounter++, text: stepText });
    } else if (currentSection === 'tips' && line.match(/^[-•\*]\s/)) {
      result.tips.push(line.replace(/^[-•\*]\s*/, ''));
    }
  }

  return result;
}

function parseIngredient(text: string): { text: string; qty?: string; unit?: string } {
  // Simple ingredient parsing - extract quantity and unit
  const qtyMatch = text.match(/^(\d+(?:\/\d+)?(?:\s+\d+\/\d+)?)\s*/);
  const unitMatch = text.match(/\b(tsp|tbsp|tablespoon|teaspoon|cup|cups|g|kg|ml|l|pound|lb|oz|clove|bunch|pinch|slice|piece)\b/i);
  
  return {
    text: text,
    qty: qtyMatch ? qtyMatch[1] : undefined,
    unit: unitMatch ? unitMatch[1] : undefined
  };
}
