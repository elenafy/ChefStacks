/**
 * Normalization Utilities for Recipe Extraction
 * 
 * Provides consistent normalization rules for ingredients, units, quantities, and times
 * across both extractors to ensure data consistency.
 */

// Source priors for confidence calculation
export const SOURCE_PRIORS = {
  'description': 0.9,
  'transcript': 0.7
} as const;

// Unit alias mapping
export const UNIT_ALIASES: Record<string, string> = {
  // Teaspoons
  'tsp': 'teaspoon',
  'tsp.': 'teaspoon',
  'teaspoons': 'teaspoon',
  'teaspoon': 'teaspoon',
  
  // Tablespoons
  'tbsp': 'tablespoon',
  'tbsp.': 'tablespoon',
  'tablespoons': 'tablespoon',
  'tablespoon': 'tablespoon',
  
  // Cups
  'cup': 'cup',
  'cups': 'cup',
  'c': 'cup',
  
  // Weight
  'g': 'gram',
  'gram': 'gram',
  'grams': 'gram',
  'kg': 'kilogram',
  'kilogram': 'kilogram',
  'kilograms': 'kilogram',
  'lb': 'pound',
  'lbs': 'pound',
  'pound': 'pound',
  'pounds': 'pound',
  'oz': 'ounce',
  'ounce': 'ounce',
  'ounces': 'ounce',
  
  // Volume
  'ml': 'milliliter',
  'milliliter': 'milliliter',
  'milliliters': 'milliliter',
  'l': 'liter',
  'liter': 'liter',
  'liters': 'liter',
  'pt': 'pint',
  'pint': 'pint',
  'pints': 'pint',
  'qt': 'quart',
  'quart': 'quart',
  'quarts': 'quart',
  'gal': 'gallon',
  'gallon': 'gallon',
  'gallons': 'gallon',
  
  // Other
  'clove': 'clove',
  'cloves': 'clove',
  'bunch': 'bunch',
  'bunches': 'bunch',
  'head': 'head',
  'heads': 'head',
  'piece': 'piece',
  'pieces': 'piece',
  'slice': 'slice',
  'slices': 'slice',
  'pinch': 'pinch',
  'pinches': 'pinch',
  'dash': 'dash',
  'dashes': 'dash',
  'splash': 'splash',
  'splashes': 'splash',
  'handful': 'handful',
  'handfuls': 'handful'
};

// Ingredient name normalization patterns
export const INGREDIENT_PATTERNS = {
  // Adjectives to move to preparation
  adjectives: [
    'fresh', 'organic', 'dried', 'frozen', 'canned', 'raw', 'cooked',
    'chopped', 'diced', 'sliced', 'minced', 'grated', 'shredded',
    'whole', 'ground', 'crushed', 'mashed', 'pureed', 'strained',
    'extra virgin', 'virgin', 'cold', 'warm', 'hot', 'room temperature',
    'large', 'small', 'medium', 'thick', 'thin', 'fine', 'coarse'
  ],
  
  // Plural to singular mappings
  plurals: {
    'onions': 'onion',
    'tomatoes': 'tomato',
    'potatoes': 'potato',
    'carrots': 'carrot',
    'celery': 'celery',
    'peppers': 'pepper',
    'mushrooms': 'mushroom',
    'garlic cloves': 'garlic',
    'cloves': 'clove',
    'eggs': 'egg',
    'lemons': 'lemon',
    'limes': 'lime',
    'oranges': 'orange',
    'apples': 'apple',
    'bananas': 'banana',
    'berries': 'berry',
    'herbs': 'herb',
    'spices': 'spice',
    'leaves': 'leaf',
    'stems': 'stem',
    'roots': 'root',
    'seeds': 'seed',
    'nuts': 'nut',
    'beans': 'bean',
    'peas': 'pea',
    'corn': 'corn',
    'rice': 'rice',
    'pasta': 'pasta',
    'noodles': 'noodle'
  }
};

/**
 * Normalize ingredient name
 */
export function normalizeIngredientName(name: string): { normalized: string; preparation: string } {
  let normalized = name.toLowerCase().trim();
  let preparation = '';
  
  // Remove quantities and units from the name (they should be separate fields)
  normalized = normalized.replace(/^\d+\s*/, ''); // Remove leading numbers
  normalized = normalized.replace(/^\d+\/\d+\s*/, ''); // Remove leading fractions
  normalized = normalized.replace(/^\d+\s+\d+\/\d+\s*/, ''); // Remove mixed numbers
  normalized = normalized.replace(/\b(tsp|tbsp|cups?|c|g|ml|lb|oz|cloves?|bunch|head|piece|slice|pinch|dash|splash|handful)\b/g, ''); // Remove units
  
  // Extract adjectives and move to preparation
  const words = normalized.split(/\s+/).filter(word => word.length > 0);
  const ingredientWords: string[] = [];
  
  for (const word of words) {
    if (INGREDIENT_PATTERNS.adjectives.includes(word)) {
      if (preparation) preparation += ', ';
      preparation += word;
    } else {
      ingredientWords.push(word);
    }
  }
  
  normalized = ingredientWords.join(' ');
  
  // Apply plural to singular mapping
  if (normalized in INGREDIENT_PATTERNS.plurals) {
    normalized = INGREDIENT_PATTERNS.plurals[normalized as keyof typeof INGREDIENT_PATTERNS.plurals];
  }
  
  // Clean up extra spaces and punctuation
  normalized = normalized.replace(/[,\-\.]+$/, '').replace(/\s+/g, ' ').trim();
  
  return { normalized, preparation };
}

/**
 * Normalize unit
 */
export function normalizeUnit(unit: string): string | null {
  if (!unit) return null;
  
  const normalized = unit.toLowerCase().trim();
  return UNIT_ALIASES[normalized] || null;
}

/**
 * Parse and normalize quantity - return TEXT ONLY.
 * - Preserve fractions (unicode like ⅓ or ASCII like 1/3)
 * - Convert common decimals to fraction strings (e.g., 0.333.. -> "1/3")
 * - Keep integers as text (e.g., 2)
 */
export function normalizeQuantity(quantity: string): string | null {
  if (!quantity) return null;
  
  const qty = quantity.toLowerCase().trim();
  
  // Handle special cases - keep as text
  if (qty === 'to taste' || qty === 'as needed' || qty === 'optional' || 
      qty === 'pinch' || qty === 'dash' || qty === 'splash' || qty === 'handful') {
    return qty; // text
  }
  
  // Handle fractions - keep as text for better readability
  if (qty.includes('/')) {
    return qty; // e.g., "1/3", "2/3", "1/2"
  }
  
  // Handle mixed numbers (e.g., "1 1/2") - keep as text
  const mixedMatch = qty.match(/^(\d+)\s+(\d+\/\d+)$/);
  if (mixedMatch) {
    return qty; // e.g., "1 1/2"
  }
  
  // Handle unicode vulgar fractions by mapping to ASCII (keep text)
  const unicodeMap: Record<string, string> = { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3' };
  if (unicodeMap[qty]) return unicodeMap[qty];
  
  // Handle decimal numbers - convert to nearest common fraction as TEXT
  if (/^\d*(?:\.\d+)?$/.test(qty)) {
    const num = parseFloat(qty);
    if (Number.isFinite(num)) {
      // whole number
      if (Math.abs(num - Math.round(num)) < 1e-6) return String(Math.round(num));
      const candidates: Array<{v:number; s:string}> = [
        { v: 1/8, s: '1/8' },
        { v: 1/6, s: '1/6' },
        { v: 1/5, s: '1/5' },
        { v: 1/4, s: '1/4' },
        { v: 1/3, s: '1/3' },
        { v: 3/8, s: '3/8' },
        { v: 1/2, s: '1/2' },
        { v: 5/8, s: '5/8' },
        { v: 2/3, s: '2/3' },
        { v: 3/4, s: '3/4' },
        { v: 7/8, s: '7/8' }
      ];
      // Try mixed number if > 1
      const whole = Math.floor(num);
      const frac = num - whole;
      const best = candidates.reduce((best, c) => {
        const d = Math.abs(frac - c.v);
        return d < best.dist ? { dist: d, s: c.s } : best;
      }, { dist: Infinity, s: '' as string });
      if (best.dist < 0.02) {
        return whole > 0 ? `${whole} ${best.s}` : best.s;
      }
      // Fallback: keep as original trimmed decimal text
      return qty;
    }
  }
  
  return null;
}

/**
 * Parse fraction string to decimal
 */
function parseFraction(fraction: string): number | null {
  const parts = fraction.split('/');
  if (parts.length !== 2) return null;
  
  const numerator = parseFloat(parts[0]);
  const denominator = parseFloat(parts[1]);
  
  if (isNaN(numerator) || isNaN(denominator) || denominator === 0) {
    return null;
  }
  
  return numerator / denominator;
}

/**
 * Extract time information from text
 */
export function extractTimeInfo(text: string): {
  totalTimeMin: number | null;
  prepTimeMin: number | null;
  cookTimeMin: number | null;
  stepTimes: Array<{ text: string; minutes: number }>;
} {
  const result: {
    totalTimeMin: number | null;
    prepTimeMin: number | null;
    cookTimeMin: number | null;
    stepTimes: Array<{ text: string; minutes: number }>;
  } = {
    totalTimeMin: null,
    prepTimeMin: null,
    cookTimeMin: null,
    stepTimes: []
  };
  
  // Time patterns
  const timePatterns = [
    // Total time patterns
    { pattern: /(?:total|total time|takes?)\s+(?:about\s+)?(\d+)\s*(?:minutes?|mins?|hours?|hrs?)/i, type: 'total' },
    { pattern: /(?:ready in|done in|finished in)\s+(\d+)\s*(?:minutes?|mins?|hours?|hrs?)/i, type: 'total' },
    
    // Prep time patterns
    { pattern: /(?:prep|preparation|prep time)\s+(?:time\s+)?(?:is\s+)?(\d+)\s*(?:minutes?|mins?|hours?|hrs?)/i, type: 'prep' },
    
    // Cook time patterns
    { pattern: /(?:cook|cooking|cook time)\s+(?:time\s+)?(?:is\s+)?(\d+)\s*(?:minutes?|mins?|hours?|hrs?)/i, type: 'cook' },
    { pattern: /(?:bake|baking|roast|roasting|simmer|simmering|boil|boiling)\s+(?:for\s+)?(\d+)\s*(?:minutes?|mins?|hours?|hrs?)/i, type: 'cook' },
    
    // Step time patterns
    { pattern: /(?:for\s+(\d+)\s*(?:minutes?|mins?|hours?|hrs?)|(\d+)\s*(?:minutes?|mins?|hours?|hrs?)\s+(?:until|until done|until cooked))/i, type: 'step' }
  ];
  
  for (const { pattern, type } of timePatterns) {
    const matches = text.matchAll(new RegExp(pattern.source, 'gi'));
    
    for (const match of matches) {
      const timeStr = match[1] || match[2];
      const time = parseInt(timeStr);
      
      if (isNaN(time)) continue;
      
      // Convert hours to minutes
      const isHours = /hours?|hrs?/i.test(match[0]);
      const minutes = isHours ? time * 60 : time;
      
      switch (type) {
        case 'total':
          if (result.totalTimeMin === null) result.totalTimeMin = minutes;
          break;
        case 'prep':
          if (result.prepTimeMin === null) result.prepTimeMin = minutes;
          break;
        case 'cook':
          if (result.cookTimeMin === null) result.cookTimeMin = minutes;
          break;
        case 'step':
          result.stepTimes.push({ text: match[0], minutes });
          break;
      }
    }
  }
  
  return result;
}

/**
 * Calculate confidence with source prior
 */
export function calculateConfidenceWithPrior(
  baseConfidence: number,
  source: 'description' | 'transcript'
): number {
  const prior = SOURCE_PRIORS[source];
  // Weight the base confidence with the source prior
  return Math.min(1, baseConfidence * prior);
}

/**
 * Validate that all fields have provenance
 */
export function validateProvenance<T extends { prov: any[] }>(item: T, fieldName: string): T {
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
  
  return item;
}

/**
 * Normalize ingredient with full validation
 */
export function normalizeIngredient(ingredient: {
  raw: string;
  name: string;
  quantity?: string | number | null;
  unit?: string | null;
  preparation?: string | null;
  prov: any[];
}): {
  raw: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  preparation: string | null;
  alternatives: string[];
  prov: any[];
} {
  // Validate provenance
  validateProvenance(ingredient, 'ingredient');
  
  // Normalize name and extract preparation
  const { normalized, preparation: extractedPrep } = normalizeIngredientName(ingredient.name);
  
  // Normalize quantity as TEXT only
  let quantity: string | null = null;
  if (typeof ingredient.quantity === 'string') {
    quantity = normalizeQuantity(ingredient.quantity);
  } else if (typeof ingredient.quantity === 'number') {
    quantity = normalizeQuantity(String(ingredient.quantity));
  } else {
    quantity = null;
  }
  
  // Normalize unit
  const unit = normalizeUnit(ingredient.unit || '');
  
  // Combine preparations
  const preparation = [ingredient.preparation, extractedPrep]
    .filter(Boolean)
    .join(', ') || null;
  
  return {
    raw: ingredient.raw,
    name: normalized,
    quantity,
    unit,
    preparation,
    alternatives: [],
    prov: ingredient.prov
  };
}
