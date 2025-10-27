# Normalization and Confidence System

This document describes the normalization rules, confidence calculation, and provenance tracking system used across both extractors.

## 🎯 **Source Priors**

Each extractor has a source prior that reflects the reliability of that data source:

```typescript
export const SOURCE_PRIORS = {
  'description': 0.9,  // High reliability - structured text
  'transcript': 0.7    // Medium reliability - spoken content
} as const;
```

### **Confidence Calculation**
```typescript
function calculateConfidenceWithPrior(
  baseConfidence: number,
  source: 'description' | 'transcript'
): number {
  const prior = SOURCE_PRIORS[source];
  return Math.min(1, baseConfidence * prior);
}
```

**Example:**
- Base confidence: 0.8
- Description source: 0.8 × 0.9 = 0.72
- Transcript source: 0.8 × 0.7 = 0.56

## 🔧 **Normalization Rules**

### **1. Ingredient Name Normalization**

#### **Adjective Extraction**
Move descriptive adjectives to the `preparation` field:

```typescript
// Input: "2 cups fresh chopped onions"
// Output:
{
  name: "onions",
  preparation: "fresh, chopped",
  quantity: 2,
  unit: "cups"
}
```

**Adjectives moved to preparation:**
- Quality: `fresh`, `organic`, `dried`, `frozen`, `canned`
- Preparation: `chopped`, `diced`, `sliced`, `minced`, `grated`
- State: `raw`, `cooked`, `whole`, `ground`, `crushed`
- Size: `large`, `small`, `medium`, `thick`, `thin`

#### **Plural to Singular**
Convert common plurals to singular form:

```typescript
const plurals = {
  'onions': 'onion',
  'tomatoes': 'tomato',
  'garlic cloves': 'garlic',
  'cloves': 'clove',
  // ... more mappings
};
```

### **2. Unit Normalization**

#### **Unit Alias Mapping**
Standardize unit names across aliases:

```typescript
const UNIT_ALIASES = {
  'tsp': 'teaspoon',
  'tsp.': 'teaspoon',
  'tbsp': 'tablespoon',
  'tbsp.': 'tablespoon',
  'cup': 'cup',
  'cups': 'cup',
  'c': 'cup',
  'g': 'gram',
  'ml': 'milliliter',
  // ... complete mapping
};
```

**Examples:**
- `tsp` → `teaspoon`
- `tbsp` → `tablespoon`
- `cups` → `cup`
- `g` → `gram`

### **3. Quantity Normalization**

#### **Fraction Parsing**
Convert fractions to decimal numbers:

```typescript
// Input → Output
"1/2" → 0.5
"1/4" → 0.25
"3/4" → 0.75
"1/3" → 0.333...
"2/3" → 0.666...
```

#### **Mixed Number Parsing**
Convert mixed numbers to decimals:

```typescript
// Input → Output
"1 1/2" → 1.5
"2 3/4" → 2.75
"1 1/4" → 1.25
```

#### **Special Cases**
Handle non-numeric quantities:

```typescript
// These remain as null (not converted to numbers)
"to taste" → null
"as needed" → null
"optional" → null
"pinch" → null (handled as unit)
"handful" → null (handled as unit)
```

### **4. Time Extraction**

#### **Time Pattern Recognition**
Extract cooking times from text:

```typescript
// Total time patterns
"takes 30 minutes" → totalTimeMin: 30
"ready in 45 minutes" → totalTimeMin: 45
"done in 1 hour" → totalTimeMin: 60

// Prep time patterns
"prep time is 15 minutes" → prepTimeMin: 15
"preparation takes 10 minutes" → prepTimeMin: 10

// Cook time patterns
"bake for 25 minutes" → cookTimeMin: 25
"simmer for 20 minutes" → cookTimeMin: 20
"cook time is 30 minutes" → cookTimeMin: 30
```

#### **Step Time Extraction**
Extract times from individual steps:

```typescript
// Step time patterns
"bake for 25 minutes" → stepTimes: [{ text: "bake for 25 minutes", minutes: 25 }]
"simmer until done, about 15 minutes" → stepTimes: [{ text: "about 15 minutes", minutes: 15 }]
```

## 📊 **Provenance Tracking**

### **Required Provenance**
Every extracted field must have provenance information:

```typescript
interface ProvenanceSpan {
  source: "description" | "transcript";
  span: [number, number]; // [start, end] position
  confidence: number;     // 0-1 confidence score
}
```

### **Span Formats**
- **Description**: Character positions `[start_char, end_char]`
- **Transcript**: Time positions `[start_sec, end_sec]`

### **Validation**
```typescript
function validateProvenance(item: any, fieldName: string): void {
  if (!item.prov || item.prov.length === 0) {
    throw new Error(`${fieldName} must have provenance information`);
  }
  
  for (const prov of item.prov) {
    if (!prov.source || !prov.span || !Array.isArray(prov.span) || prov.span.length !== 2) {
      throw new Error(`${fieldName} provenance must have source and span [start, end]`);
    }
    
    if (typeof prov.confidence !== 'number' || prov.confidence < 0 || prov.confidence > 1) {
      throw new Error(`${fieldName} provenance confidence must be between 0 and 1`);
    }
  }
}
```

## 🎯 **Confidence Scoring**

### **Per-Field Confidence**
Each field gets its own confidence score:

```typescript
interface ConfidenceFields {
  ingredients: number;  // Average ingredient confidence
  steps: number;        // Average step confidence
  title: number;        // Title confidence (usually high)
  servings: number;     // Servings confidence
  times: number;        // Time confidence
}
```

### **Overall Confidence**
Calculated as weighted average of field confidences:

```typescript
const overallConfidence = (
  ingredientConfidence * 0.4 +
  stepConfidence * 0.4 +
  titleConfidence * 0.1 +
  servingsConfidence * 0.05 +
  timesConfidence * 0.05
);
```

### **Source Prior Application**
All confidences are adjusted by source prior:

```typescript
// Description extractor
const finalConfidence = baseConfidence * 0.9;

// Transcript extractor  
const finalConfidence = baseConfidence * 0.7;
```

## 🔄 **Normalization Pipeline**

### **1. Raw Extraction**
AI extracts raw data from source text

### **2. Normalization**
Apply normalization rules:
- Extract adjectives to preparation
- Normalize ingredient names
- Standardize units
- Parse quantities
- Extract times

### **3. Validation**
Ensure provenance is present and valid

### **4. Confidence Calculation**
Apply source priors and calculate final confidence

### **5. Output**
Return normalized, validated data with confidence scores

## 📝 **Usage Examples**

### **Ingredient Normalization**
```typescript
const rawIngredient = {
  raw: "2 cups fresh chopped onions",
  name: "fresh chopped onions",
  quantity: "2",
  unit: "cups",
  prov: [{ source: "description", span: [120, 145], confidence: 0.9 }]
};

const normalized = normalizeIngredient(rawIngredient);
// Result:
{
  raw: "2 cups fresh chopped onions",
  name: "onions",
  quantity: 2,
  unit: "cup",
  preparation: "fresh, chopped",
  alternatives: [],
  prov: [{ source: "description", span: [120, 145], confidence: 0.9 }]
}
```

### **Confidence with Source Prior**
```typescript
const baseConfidence = 0.8;
const descriptionConfidence = calculateConfidenceWithPrior(baseConfidence, 'description');
// Result: 0.8 * 0.9 = 0.72

const transcriptConfidence = calculateConfidenceWithPrior(baseConfidence, 'transcript');
// Result: 0.8 * 0.7 = 0.56
```

## 🚀 **Future Enhancements**

### **Advanced Normalization**
- Ingredient substitution mapping
- Regional unit conversions
- Seasonal ingredient variations
- Dietary restriction alternatives

### **Confidence Improvements**
- Cross-validation between extractors
- Historical accuracy tracking
- User feedback integration
- Machine learning confidence models

### **Provenance Enhancements**
- Multi-source provenance tracking
- Confidence decay over time
- Source reliability scoring
- Provenance visualization
