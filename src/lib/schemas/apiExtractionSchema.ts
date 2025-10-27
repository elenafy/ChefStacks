/**
 * JSON Schema for API Bundle Extractor AI Responses
 * 
 * This schema validates the AI response format to ensure consistency
 * and proper data structure for recipe extraction.
 */

export const APIExtractionSchema = {
  type: "object",
  properties: {
    recipe: {
      type: "object",
      properties: {
        title: { 
          type: ["string", "null"],
          description: "Recipe title extracted from video title or description"
        },
        servings: { 
          type: ["number", "null"],
          description: "Number of servings if explicitly stated"
        },
        totalTimeMin: { 
          type: ["number", "null"],
          description: "Total cooking time in minutes if explicitly stated"
        },
        prepTimeMin: { 
          type: ["number", "null"],
          description: "Preparation time in minutes if explicitly stated"
        },
        cookTimeMin: { 
          type: ["number", "null"],
          description: "Cooking time in minutes if explicitly stated"
        },
        difficulty: { 
          type: ["string", "null"],
          description: "Difficulty level if explicitly stated"
        },
        ingredients: {
          type: "array",
          description: "Array of ingredient objects",
          items: {
            type: "object",
            properties: {
              raw: { 
                type: "string",
                description: "Exact text snippet from description"
              },
              name: { 
                type: "string",
                description: "Normalized ingredient name"
              },
              quantity: { 
                type: ["string", "null"],
                description: "Quantity as TEXT. Use fractions like '1/3', '1/2', '2/3'. Do not return decimals."
              },
              unit: { 
                type: ["string", "null"],
                description: "Unit of measurement if present"
              },
              preparation: { 
                type: ["string", "null"],
                description: "Preparation method (chopped, diced, etc.)"
              },
              alternatives: { 
                type: "array",
                items: { type: "string" },
                description: "Alternative ingredients if mentioned"
              },
              prov: {
                type: "array",
                description: "Provenance information",
                items: {
                  type: "object",
                  properties: {
                    source: { 
                      type: "string", 
                      enum: ["description"],
                      description: "Source of the data"
                    },
                    span: { 
                      type: "array", 
                      items: { type: "number" }, 
                      minItems: 2, 
                      maxItems: 2,
                      description: "Character span [start, end] in source text"
                    },
                    confidence: { 
                      type: "number", 
                      minimum: 0, 
                      maximum: 1,
                      description: "Confidence score for this extraction"
                    }
                  },
                  required: ["source", "span", "confidence"]
                }
              }
            },
            required: ["raw", "name", "prov"]
          }
        },
        steps: {
          type: "array",
          description: "Array of cooking step objects",
          items: {
            type: "object",
            properties: {
              index: { 
                type: "number",
                description: "Step number/index"
              },
              text: { 
                type: "string",
                description: "Step instruction text"
              },
              mentionsIngredients: { 
                type: "array",
                items: { type: "string" },
                description: "Ingredients mentioned in this step"
              },
              startTimeSec: { 
                type: ["number", "null"],
                description: "Start time in seconds (null for description-based steps)"
              },
              endTimeSec: { 
                type: ["number", "null"],
                description: "End time in seconds (null for description-based steps)"
              },
              chapterTitle: { 
                type: ["string", "null"],
                description: "Associated chapter title if any"
              },
              prov: {
                type: "array",
                description: "Provenance information",
                items: {
                  type: "object",
                  properties: {
                    source: { 
                      type: "string", 
                      enum: ["description"],
                      description: "Source of the data"
                    },
                    span: { 
                      type: "array", 
                      items: { type: "number" }, 
                      minItems: 2, 
                      maxItems: 2,
                      description: "Character span [start, end] in source text"
                    },
                    confidence: { 
                      type: "number", 
                      minimum: 0, 
                      maximum: 1,
                      description: "Confidence score for this extraction"
                    }
                  },
                  required: ["source", "span", "confidence"]
                }
              },
              confidence: { 
                type: "number", 
                minimum: 0, 
                maximum: 1,
                description: "Overall confidence for this step"
              }
            },
            required: ["index", "text", "prov", "confidence"]
          }
        },
        notes: { 
          type: "array",
          items: { type: "string" },
          description: "Array of recipe notes or tips"
        },
        chapters: {
          type: "array",
          description: "Array of video chapter objects",
          items: {
            type: "object",
            properties: {
              title: { 
                type: "string",
                description: "Chapter title"
              },
              startTimeSec: { 
                type: "number",
                description: "Chapter start time in seconds"
              }
            },
            required: ["title", "startTimeSec"]
          }
        },
        media: {
          type: "object",
          description: "Media information",
          properties: {
            videoId: { 
              type: ["string", "null"],
              description: "YouTube video ID"
            },
            thumbnails: { 
              type: "array",
              items: { type: "string" },
              description: "Array of thumbnail URLs"
            },
            deepLinks: { 
              type: "array",
              items: { type: "string" },
              description: "Array of deep link URLs with timestamps"
            }
          }
        },
        conf: {
          type: "object",
          description: "Confidence scores",
          properties: {
            fields: { 
              type: "object",
              description: "Per-field confidence scores"
            },
            overall: { 
              type: ["number", "null"],
              minimum: 0,
              maximum: 1,
              description: "Overall extraction confidence"
            }
          }
        },
        prov: { 
          type: "object",
          description: "Provenance metadata"
        }
      },
      required: ["ingredients", "steps", "notes", "chapters", "media", "conf", "prov"]
    },
    extractionConfidence: { 
      type: "number", 
      minimum: 0, 
      maximum: 1,
      description: "Overall confidence in the extraction result"
    }
  },
  required: ["recipe", "extractionConfidence"]
};

/**
 * Validate AI response against schema
 */
export function validateAIResponse(response: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Basic structure validation
  if (!response || typeof response !== 'object') {
    errors.push('Response must be an object');
    return { valid: false, errors };
  }
  
  if (!response.recipe || typeof response.recipe !== 'object') {
    errors.push('Response must contain a recipe object');
  }
  
  if (typeof response.extractionConfidence !== 'number' || 
      response.extractionConfidence < 0 || 
      response.extractionConfidence > 1) {
    errors.push('extractionConfidence must be a number between 0 and 1');
  }
  
  if (response.recipe) {
    // Validate required arrays
    const requiredArrays = ['ingredients', 'steps', 'notes', 'chapters'];
    for (const field of requiredArrays) {
      if (!Array.isArray(response.recipe[field])) {
        errors.push(`recipe.${field} must be an array`);
      }
    }
    
    // Validate ingredients
    if (Array.isArray(response.recipe.ingredients)) {
      response.recipe.ingredients.forEach((ing: any, index: number) => {
        if (!ing.raw || typeof ing.raw !== 'string') {
          errors.push(`ingredients[${index}].raw must be a string`);
        }
        if (!ing.name || typeof ing.name !== 'string') {
          errors.push(`ingredients[${index}].name must be a string`);
        }
        if (!Array.isArray(ing.prov)) {
          errors.push(`ingredients[${index}].prov must be an array`);
        }
      });
    }
    
    // Validate steps
    if (Array.isArray(response.recipe.steps)) {
      response.recipe.steps.forEach((step: any, index: number) => {
        if (typeof step.index !== 'number') {
          errors.push(`steps[${index}].index must be a number`);
        }
        if (!step.text || typeof step.text !== 'string') {
          errors.push(`steps[${index}].text must be a string`);
        }
        if (typeof step.confidence !== 'number' || 
            step.confidence < 0 || 
            step.confidence > 1) {
          errors.push(`steps[${index}].confidence must be a number between 0 and 1`);
        }
        if (!Array.isArray(step.prov)) {
          errors.push(`steps[${index}].prov must be an array`);
        }
      });
    }
  }
  
  return { valid: errors.length === 0, errors };
}
