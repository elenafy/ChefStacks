# Extractor A - API Bundle (Description-First)

Extractor A is a sophisticated recipe extraction system that pulls structured recipe data from YouTube Data API bundle, treating the video description as the most reliable source when present.

## 🎯 **Purpose**

- Extract recipes from YouTube video descriptions using AI
- Leverage YouTube Data API for rich metadata (chapters, thumbnails, channel stats)
- Provide precise provenance tracking with character spans
- Fall back to pattern matching for reliability

## 🏗️ **Architecture**

### **Input Sources**
1. **YouTube Data API Bundle**
   - Video title, description, duration
   - Chapters with timestamps
   - Channel information and stats
   - Thumbnails and metadata

2. **AI Processing**
   - OpenAI GPT-4 for intelligent extraction
   - Structured JSON output with confidence scores
   - Character-level provenance tracking

### **Output Format**
```typescript
{
  recipe: UnifiedRecipeCard,
  extractionConfidence: number,
  errors?: string[],
  warnings?: string[]
}
```

## 🚀 **Usage**

### **API Endpoint**
```bash
POST /api/extract/api-bundle
Content-Type: application/json

{
  "url": "https://www.youtube.com/watch?v=abc123"
}
```

### **Response**
```json
{
  "success": true,
  "video": {
    "id": "abc123",
    "url": "https://www.youtube.com/watch?v=abc123",
    "title": "Amazing Pasta Recipe"
  },
  "recipe": {
    "title": "Amazing Pasta Recipe",
    "servings": 4,
    "totalTimeMin": 30,
    "ingredients": [
      {
        "raw": "2 cups all-purpose flour",
        "name": "all-purpose flour",
        "quantity": 2,
        "unit": "cups",
        "preparation": null,
        "alternatives": [],
        "prov": [{
          "source": "description",
          "span": [120, 145],
          "confidence": 0.9
        }]
      }
    ],
    "steps": [
      {
        "index": 1,
        "text": "Mix flour and salt in a large bowl",
        "mentionsIngredients": ["flour", "salt"],
        "startTimeSec": null,
        "endTimeSec": null,
        "chapterTitle": "Mixing",
        "screenshotPath": null,
        "prov": [{
          "source": "description",
          "span": [200, 235],
          "confidence": 0.8
        }],
        "confidence": 0.8
      }
    ],
    "chapters": [
      {
        "title": "Introduction",
        "startTimeSec": 0
      },
      {
        "title": "Mixing",
        "startTimeSec": 120
      }
    ],
    "media": {
      "videoId": "abc123",
      "thumbnails": ["https://img.youtube.com/vi/abc123/maxresdefault.jpg"],
      "deepLinks": ["https://youtu.be/abc123?t=120"]
    },
    "conf": {
      "fields": {
        "ingredients": 0.9,
        "steps": 0.8,
        "title": 0.8
      },
      "overall": 0.85
    },
    "prov": {
      "extractionMethod": "ai-powered",
      "ingredientsFrom": "description",
      "stepsFrom": "description"
    }
  },
  "extractionConfidence": 0.85
}
```

## 🔧 **Configuration**

### **Environment Variables**
```bash
# Required for AI extraction
OPENAI_API_KEY=your_openai_api_key_here

# Required for YouTube Data API
YOUTUBE_API_KEY=your_youtube_api_key_here
```

### **Dependencies**
```json
{
  "openai": "^4.0.0",
  "youtubei.js": "^6.0.0"
}
```

## 🧪 **Testing**

### **Test Script**
```bash
# Run the test script
node scripts/test-api-bundle-extractor.js
```

### **Manual Testing**
```bash
# Test with curl
curl -X POST http://localhost:3000/api/extract/api-bundle \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=your_video_id"}'
```

## 📊 **Features**

### **AI-Powered Extraction**
- Uses GPT-4 for intelligent recipe parsing
- Handles various description formats
- Extracts ingredients with quantities and units
- Identifies cooking steps and techniques
- Recognizes times, servings, and difficulty

### **Chapter Integration**
- Automatically extracts chapters from descriptions
- Maps steps to video chapters
- Provides timestamp-based navigation

### **Provenance Tracking**
- Character-level spans for description sources
- Confidence scores for all extracted data
- Source attribution for debugging

### **Fallback System**
- Pattern matching fallback if AI fails
- Graceful degradation for reliability
- Error handling and validation

## 🎯 **Extraction Quality**

### **High Confidence Sources**
- Explicit ingredient lists with quantities
- Numbered or bulleted step instructions
- Clear time and serving information
- Structured chapter timestamps

### **Lower Confidence Sources**
- Implied ingredients from step text
- Unclear or ambiguous instructions
- Estimated times without explicit mention

## 🔍 **Debugging**

### **Common Issues**
1. **AI Extraction Fails**
   - Check OpenAI API key
   - Verify API quota and limits
   - Review description text quality

2. **Chapter Extraction Issues**
   - Verify timestamp format in description
   - Check for "CHAPTERS" section headers
   - Review regex patterns for timestamps

3. **Low Confidence Scores**
   - Description may lack structured recipe data
   - Consider using transcript-based extraction
   - Review video content quality

### **Validation**
- All responses validated against JSON schema
- Confidence scores normalized to 0-1 range
- Required fields enforced
- Error messages for debugging

## 🚀 **Next Steps**

1. **Implement Extractor B** (Transcript-based)
2. **Add merging logic** for combining both extractors
3. **Enhance validation** with more sophisticated checks
4. **Add caching** for improved performance
5. **Implement rate limiting** for API protection

## 📝 **API Documentation**

For complete API documentation, visit:
```
GET /api/extract/api-bundle
```

This will return the full API specification including:
- Input/output schemas
- Example requests and responses
- Error codes and messages
- Feature descriptions
