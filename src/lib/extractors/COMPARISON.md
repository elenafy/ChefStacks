# Extractor Comparison: A vs B

This document compares Extractor A (API Bundle) and Extractor B (Transcript) to help you understand when to use each approach.

## 📊 **Quick Comparison**

| Feature | Extractor A (API Bundle) | Extractor B (Transcript) |
|---------|-------------------------|--------------------------|
| **Primary Source** | Video description | Spoken transcript |
| **Processing** | Single AI call | Map-reduce chunks |
| **Timestamps** | Chapter-based | Precise second-level |
| **Speed** | Fast (1 AI call) | Slower (multiple AI calls) |
| **Accuracy** | High for structured descriptions | High for spoken content |
| **Fallback** | Pattern matching | None (transcript required) |
| **Use Case** | Well-structured descriptions | Spoken instructions |

## 🎯 **When to Use Each Extractor**

### **Use Extractor A (API Bundle) When:**
- ✅ Video has detailed description with recipe
- ✅ Description contains structured ingredient lists
- ✅ Description has numbered/bulleted steps
- ✅ You need fast extraction
- ✅ Video has clear chapter timestamps
- ✅ Description is in a supported language

### **Use Extractor B (Transcript) When:**
- ✅ Video has poor or missing description
- ✅ Recipe is primarily spoken in the video
- ✅ You need precise timestamps for steps
- ✅ Video has auto-generated captions
- ✅ Description is incomplete or unstructured
- ✅ You want to capture spoken tips and techniques

## 🔄 **Processing Comparison**

### **Extractor A: Single-Stage Processing**
```
YouTube URL → YouTube Data API → AI Extraction → Recipe
     ↓              ↓                ↓           ↓
  Video ID    Description +      GPT-4 Call   Unified
              Metadata                        Schema
```

### **Extractor B: Map-Reduce Processing**
```
YouTube URL → Transcript → Chunking → Map → Reduce → Recipe
     ↓           ↓           ↓        ↓      ↓        ↓
  Video ID   Captions    10-25s    AI     Merge   Unified
                        chunks   Calls   Results  Schema
```

## 📈 **Performance Characteristics**

### **Extractor A Performance**
- **Speed**: ~2-5 seconds
- **API Calls**: 2-3 (YouTube API + OpenAI)
- **Memory**: Low (single description)
- **Reliability**: High (with fallback)

### **Extractor B Performance**
- **Speed**: ~10-30 seconds (depends on video length)
- **API Calls**: 1 (YouTube API) + N (OpenAI per chunk)
- **Memory**: Medium (transcript chunks)
- **Reliability**: Medium (depends on transcript quality)

## 🎯 **Output Quality Comparison**

### **Ingredient Extraction**

#### **Extractor A (Description)**
```json
{
  "raw": "2 cups all-purpose flour",
  "name": "all-purpose flour",
  "quantity": 2,
  "unit": "cups",
  "prov": [{
    "source": "description",
    "span": [120, 145],
    "confidence": 0.9
  }]
}
```

#### **Extractor B (Transcript)**
```json
{
  "raw": "two cups of all-purpose flour",
  "name": "all-purpose flour", 
  "quantity": 2,
  "unit": "cups",
  "prov": [{
    "source": "transcript",
    "span": [45, 67],
    "confidence": 0.9
  }]
}
```

### **Step Extraction**

#### **Extractor A (Description)**
```json
{
  "index": 1,
  "text": "Mix flour and salt in a large bowl",
  "startTimeSec": null,
  "confidence": 0.8
}
```

#### **Extractor B (Transcript)**
```json
{
  "index": 1,
  "text": "Mix the flour and salt in a large bowl",
  "startTimeSec": 120,
  "confidence": 0.8
}
```

## 🔧 **Technical Differences**

### **Chunking Strategy**

#### **Extractor A**
- No chunking needed
- Processes entire description at once
- Single AI call for complete extraction

#### **Extractor B**
- Intelligent chunking (10-25 seconds)
- Natural break point detection
- Multiple AI calls for comprehensive coverage

### **Provenance Tracking**

#### **Extractor A**
- Character-level spans in description
- Source: "description"
- High precision for text positions

#### **Extractor B**
- Second-level spans in transcript
- Source: "transcript"
- High precision for timestamps

### **Error Handling**

#### **Extractor A**
- Pattern matching fallback
- Graceful degradation
- Multiple extraction strategies

#### **Extractor B**
- No fallback (requires transcript)
- Chunk-level error handling
- Continue processing on failures

## 🚀 **Future Integration**

### **Combined Approach**
The two extractors are designed to work together:

1. **Primary**: Try Extractor A (fast, reliable)
2. **Enhancement**: Use Extractor B for gaps
3. **Merging**: Combine results intelligently
4. **Validation**: Cross-validate findings

### **Merging Strategy**
```typescript
// Future implementation
const apiResult = await extractorA.extractRecipe(url);
const transcriptResult = await extractorB.extractRecipe(url);

const mergedRecipe = mergeResults(apiResult, transcriptResult, {
  // API description > transcript for structured data
  // Transcript > API for timestamps and spoken details
  // Combine confidence scores
  // Deduplicate and validate
});
```

## 📊 **Success Metrics**

### **Extractor A Success Factors**
- Description quality and structure
- Presence of ingredient lists
- Clear step formatting
- Chapter timestamps

### **Extractor B Success Factors**
- Transcript availability and quality
- Clear spoken instructions
- Good audio quality
- English language content

## 🎯 **Recommendations**

### **For Production Use**
1. **Start with Extractor A** for most videos
2. **Use Extractor B** for videos with poor descriptions
3. **Combine both** for maximum coverage
4. **Monitor confidence scores** for quality control

### **For Development**
1. **Test both extractors** on your video corpus
2. **Measure success rates** for each approach
3. **Implement intelligent routing** based on video characteristics
4. **Build merging logic** for optimal results

## 📝 **API Usage Examples**

### **Extractor A**
```bash
curl -X POST http://localhost:3000/api/extract/api-bundle \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=abc123"}'
```

### **Extractor B**
```bash
curl -X POST http://localhost:3000/api/extract/transcript \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=abc123"}'
```

Both extractors return the same unified schema, making them interchangeable and ready for future merging logic.
