// src/lib/webRecipeExtractor.server.ts
import puppeteer from 'puppeteer-core';
import * as cheerio from 'cheerio';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

// Types
export type WebExtractedRecipe = {
  title: string;
  author?: string;
  ingredients: Array<{ text: string; qty?: string; unit?: string; from: "structured" | "parsed" }>;
  steps: Array<{ order: number; text: string; from: "structured" | "parsed"; image?: string }>;
  tips: string[];
  times?: { prep_min?: number; cook_min?: number; total_min?: number };
  servings?: number;
  difficulty?: string;
  image?: string;
  confidence: { ingredients: number; steps: number; times: number };
  debug?: {
    hasStructuredData: boolean;
    structuredDataType: "json-ld" | "microdata" | "none";
    parsedFromHtml: boolean;
    layer?: "json-ld" | "microdata" | "readability" | "heuristics";
    attempts?: string[];
    url: string;
  };
};

// Lightweight HTML fetcher to avoid headless browser when possible
async function fetchHtmlDirect(url: string): Promise<string> {
  const res = await fetch(url, {
    // Try to look like a real browser
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'accept-language': 'en-US,en;q=0.9',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'cache-control': 'no-cache'
    },
    redirect: 'follow'
  } as RequestInit);
  if (!res.ok) {
    throw new Error(`Direct fetch failed with status ${res.status}`);
  }
  return await res.text();
}

// Helper functions
function normalizeText(s: string): string {
  return s.replace(/\r/g, "")
          .replace(/<[^>]*>/g, "") // Remove HTML tags
          .replace(/&[^;]+;/g, "") // Remove HTML entities
          .replace(/\s{2,}/g, " ")
          .trim();
}

function cleanStepText(s: string): string {
  let t = normalizeText(s);
  t = t.replace(/^directions[\s:–-]*/i, "");
  t = t.replace(/Dotdash Meredith Food Studios/gi, "");
  return t.trim();
}

// Function to associate images with steps based on DOM proximity
function associateImagesWithSteps(steps: Array<{ text: string; image?: string }>, $: any, baseUrl: string): Array<{ text: string; image?: string }> {
  if (steps.length === 0) return steps;
  
  // Find all images in the recipe content area
  const recipeImages = $('img').filter((_: any, img: any) => {
    const src = $(img).attr('src');
    if (!src) return false;
    return !src.includes('logo') && !src.includes('icon') && !src.includes('avatar');
  });
  
  // If we have images and some steps don't have images, try to associate them
  if (recipeImages.length > 0) {
    const stepsWithoutImages = steps.filter(step => !step.image);
    if (stepsWithoutImages.length > 0) {
      // Simple heuristic: distribute images evenly among steps without images
      const imagesPerStep = Math.floor(recipeImages.length / stepsWithoutImages.length);
      let imageIndex = 0;
      
      return steps.map(step => {
        if (!step.image && imageIndex < recipeImages.length) {
          const imgSrc = $(recipeImages[imageIndex]).attr('src');
          if (imgSrc) {
            const fullUrl = extractImageUrl(imgSrc, baseUrl);
            if (fullUrl) {
              imageIndex++;
              return { ...step, image: fullUrl };
            }
          }
        }
        return step;
      });
    }
  }
  
  return steps;
}

function mergeRelatedSteps(steps: Array<{ text: string; image?: string }>): Array<{ text: string; image?: string }> {
  const merged: Array<{ text: string; image?: string }> = [];
  let currentStep = '';
  let currentImage: string | undefined;
  
  for (const step of steps) {
    const text = step.text.trim();
    
    // If this step is very short and doesn't contain cooking verbs, merge with previous
    if (text.length < 50 && !/\b(add|mix|stir|heat|cook|bake|fry|boil|simmer|season|chop|slice|dice|mince|pour|whisk|blend|combine|place|put|remove|serve|garnish|whisk|marinate|preheat|transfer|bake|roast|grill|sauté|cover|uncover|bring|reduce|let|allow|taste|adjust|discard|laddle|sprinkle)\b/i.test(text)) {
      if (currentStep) {
        currentStep += ' ' + text;
      } else {
        currentStep = text;
        currentImage = step.image;
      }
    } else {
      // Save previous step if exists
      if (currentStep) {
        merged.push({ text: currentStep, image: currentImage });
      }
      // Start new step
      currentStep = text;
      currentImage = step.image;
    }
  }
  
  // Don't forget the last step
  if (currentStep) {
    merged.push({ text: currentStep, image: currentImage });
  }
  
  return merged;
}

function extractTipsFromHtml($: cheerio.CheerioAPI): string[] {
  const tips: string[] = [];
  
  // Look for common tip patterns in HTML
  const tipSelectors = [
    '[class*="tip"]',
    '[class*="note"]',
    '[class*="hint"]',
    '[class*="advice"]',
    '[id*="tip"]',
    '[id*="note"]',
    '[id*="hint"]',
    '[id*="advice"]',
    'p:contains("Tip")',
    'p:contains("Note")',
    'p:contains("Hint")',
    'p:contains("Pro tip")',
    'li:contains("Tip")',
    'li:contains("Note")',
    'li:contains("Hint")',
    'li:contains("Pro tip")'
  ];
  
  tipSelectors.forEach(selector => {
    try {
      $(selector).each((_, el) => {
        const text = normalizeText($(el).text());
        if (text.length > 10 && text.length < 300) {
          const lower = text.toLowerCase();
          if (/tip|trick|avoid|don't|do not|because|so that|instead|pro tip|chef tip|secret|hack|note|hint/i.test(lower)) {
            tips.push(text);
          }
        }
      });
    } catch (e) {
      // Ignore selector errors
    }
  });
  
  // Remove duplicates and limit to 5 tips
  return [...new Set(tips)].slice(0, 5);
}

function extractImageUrl(imgSrc: string, baseUrl: string): string | undefined {
  if (!imgSrc) return undefined;
  
  try {
    // Handle relative URLs
    if (imgSrc.startsWith('//')) {
      return `https:${imgSrc}`;
    } else if (imgSrc.startsWith('/')) {
      const url = new URL(baseUrl);
      return `${url.protocol}//${url.host}${imgSrc}`;
    } else if (imgSrc.startsWith('http')) {
      return imgSrc;
    } else {
      const url = new URL(baseUrl);
      return `${url.protocol}//${url.host}/${imgSrc}`;
    }
  } catch {
    return undefined;
  }
}


function findBestImage($: cheerio.CheerioAPI, baseUrl: string): string | undefined {
  const imageSelectors = [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    '[itemprop="image"]',
    '.recipe-image img',
    '.hero-image img',
    '.main-image img',
    '.featured-image img',
    'img[alt*="recipe"]',
    'img[alt*="dish"]',
    'img[alt*="food"]'
  ];
  
  for (const selector of imageSelectors) {
    const el = $(selector).first();
    if (el.length > 0) {
      const src = el.attr('content') || el.attr('src');
      if (src) {
        const fullUrl = extractImageUrl(src, baseUrl);
        if (fullUrl) return fullUrl;
      }
    }
  }
  
  return undefined;
}


function parseQuantity(text: string): { qty?: string; unit?: string } {
  const qtyMatch = text.match(/^(\d+\/\d+|\d+(?:\.\d+)?|½|¼|¾|⅓|⅔)\s*/);
  const unitMatch = text.match(/\b(tsp|tbsp|tablespoon[s]?|teaspoon[s]?|cup[s]?|g|kg|ml|l|pound[s]?|lb[s]?|oz|clove[s]?|bunch|pinch|slice[s]?|piece[s]?)\b/i);
  
  return {
    qty: qtyMatch ? qtyMatch[1] : undefined,
    unit: unitMatch ? unitMatch[1] : undefined
  };
}

function parseIsoDurationToMinutes(s: string): number | undefined {
  // Support PT#H#M#S and P#DT#H#M#S
  const rx = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i;
  const m = s.toUpperCase().match(rx);
  if (!m) return undefined;
  const days = parseInt(m[1] || '0', 10) || 0;
  const hours = parseInt(m[2] || '0', 10) || 0;
  const minutes = parseInt(m[3] || '0', 10) || 0;
  const seconds = parseInt(m[4] || '0', 10) || 0;
  const totalMin = days * 24 * 60 + hours * 60 + minutes + Math.round(seconds / 60);
  return totalMin || undefined;
}

function parseTimeToMinutes(timeStr: string): number | undefined {
  if (!timeStr) return undefined;
  // Try ISO 8601 first
  const iso = parseIsoDurationToMinutes(timeStr);
  if (iso != null) return iso;
  
  const timeMatch = timeStr.match(/(\d+)\s*(hour[s]?|hr[s]?|minute[s]?|min[s]?)/i);
  if (!timeMatch) return undefined;
  
  const value = parseInt(timeMatch[1]);
  const unit = timeMatch[2].toLowerCase();
  
  if (unit.startsWith('hour') || unit.startsWith('hr')) {
    return value * 60;
  } else if (unit.startsWith('min')) {
    return value;
  }
  
  return undefined;
}

type StructuredResult = { data: Partial<WebExtractedRecipe>; source: "json-ld" | "microdata" };

// Extract structured data (JSON-LD and microdata)
function extractStructuredData(html: string, baseUrl?: string): StructuredResult | null {
  const $ = cheerio.load(html);
  
  // Try JSON-LD first
  const jsonLdScripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < jsonLdScripts.length; i++) {
    try {
      const scriptContent = $(jsonLdScripts[i]).html();
      if (!scriptContent) continue;
      
      const data = JSON.parse(scriptContent);
      const flatten = (obj: any): any[] => {
        if (!obj) return [];
        if (Array.isArray(obj)) return obj.flatMap(flatten);
        if (obj['@graph']) return flatten(obj['@graph']);
        return [obj];
      };
      const items = flatten(data);
      const recipe = items.find((item: any) => {
        const t = item['@type'];
        if (!t) return false;
        return (typeof t === 'string' && t.toLowerCase() === 'recipe') ||
               (Array.isArray(t) && t.some((x: any) => String(x).toLowerCase() === 'recipe'));
      });
      
      if (recipe) {
        return { data: parseJsonLdRecipe(recipe, baseUrl, data), source: "json-ld" };
      }
    } catch (e) {
      // Continue to next script
    }
  }
  
  // Try microdata
  const microdataRecipe = $('[itemtype*="Recipe"]').first();
  if (microdataRecipe.length > 0) {
    return { data: parseMicrodataRecipe(microdataRecipe, $ as any, baseUrl), source: "microdata" };
  }
  
  return null;
}

function parseJsonLdRecipe(recipe: any, baseUrl?: string, allData?: any): Partial<WebExtractedRecipe> {
  const result: Partial<WebExtractedRecipe> = {
    title: recipe.name || '',
    ingredients: [],
    steps: [],
    tips: [],
    times: {},
    servings: recipe.recipeYield ? parseInt(String(recipe.recipeYield)) : undefined,
    image: recipe.image ? (
      Array.isArray(recipe.image) ? 
        (recipe.image[0]?.url || recipe.image[0]) : 
        (recipe.image.url || recipe.image)
    ) : undefined,
    confidence: { ingredients: 0, steps: 0, times: 0 }
  };
  
  // Extract main image
  if (result.image && baseUrl) {
    result.image = extractImageUrl(result.image, baseUrl);
  }
  
  // Parse ingredients
  if (recipe.recipeIngredient && Array.isArray(recipe.recipeIngredient)) {
    result.ingredients = recipe.recipeIngredient.map((ing: string) => {
      const parsed = parseQuantity(ing);
      return {
        text: normalizeText(ing),
        qty: parsed.qty,
        unit: parsed.unit,
        from: "structured" as const
      };
    });
    result.confidence!.ingredients = 0.95;
  }
  
  // Parse instructions
  if (recipe.recipeInstructions) {
    const list: any[] = Array.isArray(recipe.recipeInstructions) ? recipe.recipeInstructions : [recipe.recipeInstructions];
    const expand = (node: any): any[] => {
      if (!node) return [];
      if (typeof node === 'string') return [node];
      if (Array.isArray(node)) return node.flatMap(expand);
      if (node['@type'] === 'HowToSection' && node.itemListElement) return expand(node.itemListElement);
      if (node.itemListElement) return expand(node.itemListElement);
      if (node.text || node.name) return [node]; // Return the full node object instead of just text
      return [];
    };
    const stepsWithImages = list.flatMap(expand).map((node: any, index: number) => {
      const text = normalizeText(node.text || node.name || String(node));
      let image: string | undefined;
      
      // Try to extract image from the step node
      if (node && typeof node === 'object') {
        if (node.image) {
          if (Array.isArray(node.image)) {
            // Handle array of ImageObjects
            const firstImage = node.image[0];
            image = firstImage?.url || firstImage;
          } else if (typeof node.image === 'object' && node.image.url) {
            // Handle single ImageObject
            image = node.image.url;
          } else {
            // Handle direct URL string
            image = node.image;
          }
        } else if (node.associatedMedia && node.associatedMedia.contentUrl) {
          image = node.associatedMedia.contentUrl;
        }
      }
      
      return {
        order: index + 1,
        text,
        image: image && baseUrl ? extractImageUrl(image, baseUrl) : image,
        from: "structured" as const
      };
    }).filter(step => step.text);
    
    if (stepsWithImages.length) {
      result.steps = stepsWithImages;
      result.confidence!.steps = 0.95;
    }
  }
  
  // Helper function to resolve @id references
  const resolveById = (id: string): any => {
    if (!allData || !id) return null;
    const items = Array.isArray(allData) ? allData : (allData['@graph'] || [allData]);
    return items.find((item: any) => item['@id'] === id);
  };

  // Parse author
  if (recipe.author) {
    if (Array.isArray(recipe.author)) {
      const firstAuthor = recipe.author[0];
      if (firstAuthor && typeof firstAuthor === 'object' && firstAuthor['@id']) {
        const resolvedAuthor = resolveById(firstAuthor['@id']);
        result.author = resolvedAuthor?.name || firstAuthor.name || firstAuthor;
      } else {
        result.author = firstAuthor?.name || firstAuthor;
      }
    } else if (typeof recipe.author === 'object' && recipe.author.name) {
      result.author = recipe.author.name;
    } else if (typeof recipe.author === 'object' && recipe.author['@id']) {
      // Resolve @id reference
      const resolvedAuthor = resolveById(recipe.author['@id']);
      result.author = resolvedAuthor?.name || recipe.author.name || recipe.author.givenName || recipe.author.familyName || 'Web Source';
    } else {
      result.author = recipe.author;
    }
  }
  
  // Also try to extract author from other common fields
  if (!result.author) {
    if (recipe.creator) {
      if (Array.isArray(recipe.creator)) {
        result.author = recipe.creator[0]?.name || recipe.creator[0];
      } else if (typeof recipe.creator === 'object' && recipe.creator.name) {
        result.author = recipe.creator.name;
      } else if (typeof recipe.creator === 'object' && recipe.creator['@id']) {
        // Handle structured data creator objects with @id key - try to extract name first
        result.author = recipe.creator.name || recipe.creator.givenName || recipe.creator.familyName || 'Web Source';
      } else {
        result.author = recipe.creator;
      }
    }
  }

  // Parse times
  if (recipe.prepTime) {
    result.times!.prep_min = parseTimeToMinutes(recipe.prepTime);
  }
  if (recipe.cookTime) {
    result.times!.cook_min = parseTimeToMinutes(recipe.cookTime);
  }
  if (recipe.totalTime) {
    result.times!.total_min = parseTimeToMinutes(recipe.totalTime);
  }
  
  // Parse difficulty from structured data
  if (recipe.difficulty) {
    result.difficulty = normalizeText(recipe.difficulty);
  }
  
  if (result.times && (result.times.prep_min || result.times.cook_min || result.times.total_min)) {
    result.confidence!.times = 0.9;
  }
  
  // Extract tips from recipe notes or tips field
  if (recipe.recipeTips && Array.isArray(recipe.recipeTips)) {
    result.tips = recipe.recipeTips.map((tip: string) => normalizeText(tip)).filter((tip: string) => tip.length > 0);
  } else if (recipe.tips && Array.isArray(recipe.tips)) {
    result.tips = recipe.tips.map((tip: string) => normalizeText(tip)).filter((tip: string) => tip.length > 0);
  } else if (recipe.notes && Array.isArray(recipe.notes)) {
    result.tips = recipe.notes.map((note: string) => normalizeText(note)).filter((note: string) => note.length > 0);
  }
  
  return result;
}

function parseMicrodataRecipe(element: any, $: any, baseUrl?: string): Partial<WebExtractedRecipe> {
  const result: Partial<WebExtractedRecipe> = {
    title: '',
    ingredients: [],
    steps: [],
    tips: [],
    times: {},
    confidence: { ingredients: 0, steps: 0, times: 0 }
  };
  
  // Extract main image
  const imageEl = element.find('[itemprop="image"]').first();
  if (imageEl.length > 0) {
    const src = imageEl.attr('content') || imageEl.attr('src');
    if (src && baseUrl) {
      result.image = extractImageUrl(src, baseUrl);
    }
  }
  
  // Extract title
  const titleEl = element.find('[itemprop="name"]').first();
  if (titleEl.length > 0) {
    result.title = normalizeText(titleEl.text());
  }
  
  // Extract author
  const authorEl = element.find('[itemprop="author"]').first();
  if (authorEl.length > 0) {
    result.author = normalizeText(authorEl.text());
  }
  
  // Extract ingredients
  const ingredientEls = element.find('[itemprop="recipeIngredient"]');
  if (ingredientEls.length > 0) {
    result.ingredients = ingredientEls.map((_: any, el: any) => {
      const text = normalizeText($(el).text());
      const parsed = parseQuantity(text);
      return {
        text,
        qty: parsed.qty,
        unit: parsed.unit,
        from: "structured" as const
      };
    }).get();
    result.confidence!.ingredients = 0.9;
  }
  
  // Extract instructions
  const instructionEls = element.find('[itemprop="recipeInstructions"]');
  if (instructionEls.length > 0) {
    result.steps = instructionEls.map((index: any, el: any) => {
      const $el = $(el);
      const text = normalizeText($el.text());
      let image: string | undefined;
      
      // Look for images within the instruction element
      const imgEl = $el.find('img').first();
      if (imgEl.length > 0) {
        const src = imgEl.attr('src');
        if (src && baseUrl) {
          image = extractImageUrl(src, baseUrl);
        }
      }
      
      return {
        order: index + 1,
        text,
        image,
        from: "structured" as const
      };
    }).get();
    result.confidence!.steps = 0.9;
  }
  
  // Extract times
  const prepTime = element.find('[itemprop="prepTime"]').attr('content');
  const cookTime = element.find('[itemprop="cookTime"]').attr('content');
  const totalTime = element.find('[itemprop="totalTime"]').attr('content');
  
  if (prepTime) result.times!.prep_min = parseTimeToMinutes(prepTime);
  if (cookTime) result.times!.cook_min = parseTimeToMinutes(cookTime);
  if (totalTime) result.times!.total_min = parseTimeToMinutes(totalTime);
  
  if (result.times && (result.times.prep_min || result.times.cook_min || result.times.total_min)) {
    result.confidence!.times = 0.8;
  }
  
  // Extract tips from microdata
  const tipEls = element.find('[itemprop="recipeTips"], [itemprop="tips"], [itemprop="notes"]');
  if (tipEls.length > 0) {
    result.tips = tipEls.map((_: any, el: any) => normalizeText($(el).text())).get().filter((tip: string) => tip.length > 0);
  }
  
  return result;
}

// Use Readability to isolate main article content, then parse
function parseWithReadability(html: string, url: string): Partial<WebExtractedRecipe> {
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (!article) return {};
    // Build a mini HTML containing cleaned article content
    const contentHtml = `<article><h1>${article.title || ''}</h1>${article.content || ''}</article>`;
    const parsed = parseHtmlContent(contentHtml, url);
    if (!parsed.title) parsed.title = normalizeText(article.title || '');
    // Boost confidence slightly to distinguish from raw heuristics
    parsed.confidence = parsed.confidence || { ingredients: 0, steps: 0, times: 0 };
    parsed.confidence.ingredients = Math.max(parsed.confidence.ingredients || 0, 0.6);
    parsed.confidence.steps = Math.max(parsed.confidence.steps || 0, 0.6);
    return parsed;
  } catch {
    return {};
  }
}

// Parse HTML content for recipes when structured data is not available
function parseHtmlContent(html: string, baseUrl?: string): Partial<WebExtractedRecipe> {
  const $ = cheerio.load(html);
  
  // Remove script and style elements
  $('script, style, nav, header, footer, .ad, .advertisement, .ads').remove();
  
  const result: Partial<WebExtractedRecipe> = {
    title: '',
    ingredients: [],
    steps: [],
    tips: [],
    times: {},
    confidence: { ingredients: 0, steps: 0, times: 0 }
  };
  
  // Extract main image
  if (baseUrl) {
    result.image = findBestImage($ as any, baseUrl);
  }
  
  // Try to find title
  const titleSelectors = [
    'h1',
    '[class*="title"]',
    '[class*="recipe-title"]',
    '[id*="title"]'
  ];
  
  for (const selector of titleSelectors) {
    const titleEl = $(selector).first();
    if (titleEl.length > 0 && titleEl.text().trim()) {
      result.title = normalizeText(titleEl.text());
      break;
    }
  }
  
  // Try to find author
  const authorSelectors = [
    '[class*="author"]',
    '[class*="byline"]',
    '[class*="by"]',
    '[data-testid*="author"]',
    '.author',
    '.byline',
    '.recipe-author',
    'p:contains("By ")',
    'span:contains("By ")',
    'div:contains("By ")'
  ];
  
  for (const selector of authorSelectors) {
    const authorEl = $(selector).first();
    if (authorEl.length > 0) {
      let authorText = normalizeText(authorEl.text());
      // Clean up common author text patterns
      authorText = authorText.replace(/^by\s+/i, '').replace(/^recipe by\s+/i, '').replace(/^author\s+/i, '').trim();
      if (authorText && authorText.length > 2 && authorText.length < 100) {
        result.author = authorText;
        break;
      }
    }
  }
  
  // Try to find ingredients
  const ingredientSelectors = [
    '[class*="ingredient"]',
    '[id*="ingredient"]',
    '[data-testid*="ingredient"]',
    '[data-testid*="recipe-ingredient"]',
    '.ingredients-section li',
    '.ingredients-item-name',
    '.ingredients li',
    '.recipe-ingredients li',
    '.ingredient-item',
    'ul li',
    'ol li'
  ];
  
  for (const selector of ingredientSelectors) {
    const ingredientEls = $(selector);
    const potentialIngredients: string[] = [];
    
    ingredientEls.each((_, el) => {
      const text = normalizeText($(el).text());
      if (text && text.length > 3 && text.length < 200) {
        // Check if it looks like an ingredient
        if (/\b(tsp|tbsp|cup|g|kg|ml|l|pound|lb|oz|clove|bunch|pinch|slice|piece)\b/i.test(text) ||
            /\b\d+\b/.test(text) ||
            /\b(garlic|onion|salt|pepper|oil|butter|cheese|flour|sugar|egg|milk|cream)\b/i.test(text)) {
          potentialIngredients.push(text);
        }
      }
    });
    
    // If we didn't find individual ingredients, try to parse a single ingredient block
    if (potentialIngredients.length === 0) {
      const ingredientBlockSelectors = [
        '[class*="ingredient"]',
        '[id*="ingredient"]',
        '.ingredients',
        '.recipe-ingredients'
      ];
      
      for (const blockSelector of ingredientBlockSelectors) {
        const block = $(blockSelector).first();
        if (block.length > 0) {
          const blockText = normalizeText(block.text());
          // Try to split by common separators
          const splitIngredients = blockText
            .split(/[•\-\*]\s*|\n\s*\d+\.\s*|\n\s*[•\-\*]\s*/)
            .map(ing => normalizeText(ing))
            .filter(ing => ing.length > 3 && ing.length < 200)
            .filter(ing => /\b(tsp|tbsp|cup|g|kg|ml|l|pound|lb|oz|clove|bunch|pinch|slice|piece|\d+)\b/i.test(ing));
          
          if (splitIngredients.length >= 3) {
            potentialIngredients.push(...splitIngredients);
            break;
          }
        }
      }
    }
    
    if (potentialIngredients.length >= 3) {
      result.ingredients = potentialIngredients.map(text => {
        const parsed = parseQuantity(text);
        return {
          text,
          qty: parsed.qty,
          unit: parsed.unit,
          from: "parsed" as const
        };
      });
      result.confidence!.ingredients = Math.min(0.7, potentialIngredients.length * 0.1);
      break;
    }
  }
  
  // Try to find instructions/steps
  const stepSelectors = [
    '[class*="instruction"]',
    '[class*="step"]',
    '[class*="direction"]',
    '[id*="instruction"]',
    '[id*="step"]',
    '[id*="direction"]',
    '[data-testid*="instruction"]',
    '[data-testid*="step"]',
    '[data-testid*="direction"]',
    'ol.instructions-section li',
    '.instructions-section-item',
    '.instructions-section li p',
    '.instructions li',
    '.recipe-instructions li',
    '.directions li',
    '.steps li',
    '.instruction-item',
    '.step-item',
    // AllRecipes specific selectors
    '.recipe-instructions ol li',
    '.recipe-instructions div[class*="step"]',
    '.recipe-instructions div[class*="instruction"]',
    '.recipe-instructions p',
    // Generic step containers that might contain images
    'div[class*="step"]',
    'div[class*="instruction"]',
    'li[class*="step"]',
    'li[class*="instruction"]'
  ];
  
  for (const selector of stepSelectors) {
    const stepEls = $(selector);
    const potentialSteps: Array<{ text: string; image?: string }> = [];
    
    stepEls.each((_, el) => {
      const $el = $(el);
      // Prefer paragraph text to avoid alt text/images
      const pText = $el.find('p').map((_, p) => $(p).text()).get().join(' ').trim();
      const raw = pText || $el.clone().find('img,figure,svg,script,style,noscript').remove().end().text();
      const text = cleanStepText(raw);
      if (text && text.length > 10 && text.length < 800) {
        // Look for step image - check multiple locations
        let stepImage: string | undefined;
        
        // 1. Look for images within the step element
        const imgEl = $el.find('img').first();
        if (imgEl.length > 0) {
          const src = imgEl.attr('src');
          if (src && baseUrl) {
            stepImage = extractImageUrl(src, baseUrl);
          }
        }
        
        // 2. If no image found, look in the parent container
        if (!stepImage) {
          const parentImg = $el.parent().find('img').first();
          if (parentImg.length > 0) {
            const src = parentImg.attr('src');
            if (src && baseUrl) {
              stepImage = extractImageUrl(src, baseUrl);
            }
          }
        }
        
        // 3. Look for images in the next sibling element (common pattern)
        if (!stepImage) {
          const nextSiblingImg = $el.next().find('img').first();
          if (nextSiblingImg.length > 0) {
            const src = nextSiblingImg.attr('src');
            if (src && baseUrl) {
              stepImage = extractImageUrl(src, baseUrl);
            }
          }
        }
        
        // 4. Look for images in the previous sibling element
        if (!stepImage) {
          const prevSiblingImg = $el.prev().find('img').first();
          if (prevSiblingImg.length > 0) {
            const src = prevSiblingImg.attr('src');
            if (src && baseUrl) {
              stepImage = extractImageUrl(src, baseUrl);
            }
          }
        }
        
        potentialSteps.push({ text, image: stepImage });
      }
    });
    
    // If we didn't find individual steps, try to parse a single instruction block
    if (potentialSteps.length === 0) {
      const stepBlockSelectors = [
        '[class*="instruction"]',
        '[class*="step"]',
        '[class*="direction"]',
        '[id*="instruction"]',
        '[id*="step"]',
        '[id*="direction"]',
        '.instructions',
        '.recipe-instructions',
        '.directions',
        '.steps'
      ];
      
      for (const blockSelector of stepBlockSelectors) {
        const block = $(blockSelector).first();
        if (block.length > 0) {
          const blockText = cleanStepText(block.text());
          // Try to split by common separators, but be more careful about periods in the middle of sentences
          const splitSteps = blockText
            .split(/\n\s*\d+\.\s*|\n\s*[•\-\*]\s*|(?<=\w\.)\s*(?=[A-Z])/)
            .map(step => cleanStepText(step))
            .filter(step => step.length > 10 && step.length < 800) // Increased length limits
            .filter(step => {
              // More comprehensive cooking verb detection
              const cookingVerbs = /\b(add|mix|stir|heat|cook|bake|fry|boil|simmer|season|chop|slice|dice|mince|pour|whisk|blend|combine|place|put|remove|serve|garnish|whisk|marinate|preheat|transfer|bake|roast|grill|sauté|sauté|cover|uncover|bring|reduce|let|allow|taste|adjust|discard|laddle|sprinkle|garnish)\b/i;
              return cookingVerbs.test(step) || step.includes('minutes') || step.includes('until') || step.includes('for');
            });
          
          if (splitSteps.length >= 2) {
            const mergedSteps = mergeRelatedSteps(splitSteps.map(text => ({ text })));
            potentialSteps.push(...mergedSteps);
            break;
          }
        }
      }
    }
    
    if (potentialSteps.length >= 2) {
      const mergedSteps = mergeRelatedSteps(potentialSteps);
      const stepsWithAssociatedImages = associateImagesWithSteps(mergedSteps, $, baseUrl || '');
      result.steps = stepsWithAssociatedImages.map((step, index) => ({
        order: index + 1,
        text: step.text,
        image: step.image,
        from: "parsed" as const
      }));
      result.confidence!.steps = Math.min(0.7, stepsWithAssociatedImages.length * 0.1);
      break;
    }
  }
  
  // Extract tips from HTML content
  result.tips = extractTipsFromHtml($ as any);
  
  // Fallback: Parse metadata from visible text if not found in structured data
  if (!result.times || (!result.times.prep_min && !result.times.cook_min && !result.times.total_min)) {
    result.times = result.times || {};
    const timeText = $('body').text();
    
    // Look for time patterns in text
    const prepMatch = timeText.match(/(?:prep|preparation).*?(\d+)\s*(?:min|minute|hour|hr)/i);
    if (prepMatch) {
      result.times.prep_min = parseInt(prepMatch[1]) * (prepMatch[0].toLowerCase().includes('hour') ? 60 : 1);
    }
    
    const cookMatch = timeText.match(/(?:cook|cooking).*?(\d+)\s*(?:min|minute|hour|hr)/i);
    if (cookMatch) {
      result.times.cook_min = parseInt(cookMatch[1]) * (cookMatch[0].toLowerCase().includes('hour') ? 60 : 1);
    }
    
    const totalMatch = timeText.match(/(?:total|ready).*?(\d+)\s*(?:min|minute|hour|hr)/i);
    if (totalMatch) {
      result.times.total_min = parseInt(totalMatch[1]) * (totalMatch[0].toLowerCase().includes('hour') ? 60 : 1);
    }
  }
  
  // Fallback: Parse servings from visible text
  if (!result.servings) {
    const servingsMatch = $('body').text().match(/(?:serves?|yield|makes?|portions?)\s*:?\s*(\d+)/i);
    if (servingsMatch) {
      result.servings = parseInt(servingsMatch[1]);
    }
  }
  
  // Fallback: Parse difficulty from visible text
  if (!result.difficulty) {
    const difficultyMatch = $('body').text().match(/(?:difficulty|level)\s*:?\s*(easy|medium|hard|beginner|intermediate|advanced)/i);
    if (difficultyMatch) {
      result.difficulty = difficultyMatch[1].toLowerCase();
    }
  }
  
  return result;
}

// Main extraction function
export async function extractRecipeFromWeb(url: string): Promise<WebExtractedRecipe> {
  let browser;
  const attempts: string[] = [];
  
  try {
    // 0) Try a zero-cost direct fetch first; many sites render server-side
    try {
      const html = await fetchHtmlDirect(url);
      // Try structured data first
      const structuredResult = extractStructuredData(html, url);
      if (structuredResult && structuredResult.data && structuredResult.data.ingredients && structuredResult.data.ingredients.length > 0) {
        return {
          title: structuredResult.data.title || 'Recipe',
          author: structuredResult.data.author,
          image: structuredResult.data.image,
          ingredients: structuredResult.data.ingredients || [],
          steps: structuredResult.data.steps || [],
          tips: structuredResult.data.tips || [],
          times: structuredResult.data.times,
          servings: structuredResult.data.servings,
          difficulty: structuredResult.data.difficulty,
          confidence: structuredResult.data.confidence || { ingredients: 0.8, steps: 0.8, times: 0.9 },
          debug: { hasStructuredData: true, structuredDataType: structuredResult.source, parsedFromHtml: false, url }
        };
      }

      // Readability fallback from direct HTML
      const readabilityData = parseWithReadability(html, url);
      if ((readabilityData.ingredients && readabilityData.ingredients.length >= 3) ||
          (readabilityData.steps && readabilityData.steps.length >= 2)) {
        return {
          title: readabilityData.title || 'Recipe',
          author: readabilityData.author,
          image: readabilityData.image,
          ingredients: readabilityData.ingredients || [],
          steps: readabilityData.steps || [],
          tips: readabilityData.tips || [],
          times: readabilityData.times,
          servings: readabilityData.servings,
          difficulty: readabilityData.difficulty,
          confidence: readabilityData.confidence || { ingredients: 0.5, steps: 0.6, times: 0.2 },
          debug: { hasStructuredData: false, structuredDataType: 'none', parsedFromHtml: true, layer: 'readability', url }
        };
      }
      // If direct fetch insufficient, fall through to headless browser
    } catch (e) {
      // Non-fatal; continue to browser path
    }

    // Launch browser with serverless-friendly options
    const isServerless = Boolean(process.env.AWS_REGION || process.env.VERCEL || process.env.GOOGLE_CLOUD_PROJECT);
    
    let launchOptions: any = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-blink-features=AutomationControlled'
      ],
      ignoreHTTPSErrors: true
    };
    
    if (isServerless) {
      // Try to load chromium for serverless environments
      try {
        const chromiumModule = await eval('import("@sparticuz/chromium")');
        const chromium = chromiumModule.default || chromiumModule;
        launchOptions = {
          ...launchOptions,
          ...chromium,
          args: [...chromium.args, ...launchOptions.args]
        };
      } catch (chromiumError) {
        console.warn('Failed to load @sparticuz/chromium, trying alternative approach:', chromiumError);
        // For serverless environments, try to use the system Chrome. If unavailable, fallback to direct fetch parsing.
        const candidatePaths = ['/usr/bin/chromium-browser','/usr/bin/chromium','/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/opt/google/chrome/chrome'];
        let foundPath: string | undefined;
        try {
          const fs = await import('fs');
          for (const p of candidatePaths) {
            if (fs.existsSync(p)) { foundPath = p; break; }
          }
        } catch {}
        if (foundPath) {
          launchOptions.executablePath = foundPath;
        } else {
          // Last resort: attempt direct fetch again and return best-effort parse
          try {
            const html = await fetchHtmlDirect(url);
            const structuredResult = extractStructuredData(html, url);
            if (structuredResult && structuredResult.data && structuredResult.data.ingredients && structuredResult.data.ingredients.length > 0) {
              return {
                title: structuredResult.data.title || 'Recipe',
                author: structuredResult.data.author,
                image: structuredResult.data.image,
                ingredients: structuredResult.data.ingredients || [],
                steps: structuredResult.data.steps || [],
                tips: structuredResult.data.tips || [],
                confidence: { ingredients: 0.8, steps: 0.8, times: 0.3 },
                debug: { hasStructuredData: true, structuredDataType: structuredResult.source, parsedFromHtml: false, url }
              };
            }
            const readabilityData = parseWithReadability(html, url);
            return {
              title: readabilityData.title || 'Recipe',
              author: readabilityData.author,
              image: readabilityData.image,
              ingredients: readabilityData.ingredients || [],
              steps: readabilityData.steps || [],
              tips: readabilityData.tips || [],
              confidence: { ingredients: 0.5, steps: 0.6, times: 0.2 },
              debug: { hasStructuredData: false, structuredDataType: 'none', parsedFromHtml: true, layer: 'readability', url }
            };
          } catch (e) {
            throw new Error('No Chrome found and direct HTML fetch failed');
          }
        }
      }
    } else {
      // Use local Chrome for development
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    
    browser = await puppeteer.launch(launchOptions);
    
    const page = await browser.newPage();
    
    // Set stealth user agent and headers to avoid blocking
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0'
    });
    
    // Remove webdriver property to avoid detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });
    
    // Navigate to the page with retry logic
    let retries = 3;
    let success = false;
    
    while (retries > 0 && !success) {
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        // Wait a bit more for any dynamic content to load
        await new Promise(resolve => setTimeout(resolve, 3000));
        success = true;
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        console.log(`Retry ${3 - retries} for ${url}:`, error);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Get the HTML content
    const html = await page.content();
    
    // Try structured data first
    const structuredResult = extractStructuredData(html, url);
    
    if (structuredResult && structuredResult.data && structuredResult.data.ingredients && structuredResult.data.ingredients.length > 0) {
      attempts.push(structuredResult.source);
      
      // If structured data doesn't have a good author, try HTML parsing for author
      let finalResult = { ...structuredResult.data };
      if (!finalResult.author || finalResult.author === 'Web Source') {
        const htmlData = parseHtmlContent(html, url);
        if (htmlData.author && htmlData.author !== 'Web Source') {
          finalResult.author = htmlData.author;
        }
      }
      
      // We have good structured data
      return {
        ...finalResult,
        debug: {
          hasStructuredData: true,
          structuredDataType: structuredResult.source,
          parsedFromHtml: false,
          layer: structuredResult.source,
          attempts,
          url
        }
      } as WebExtractedRecipe;
    }
    
    // Readability fallback
    attempts.push('readability');
    const readabilityData = parseWithReadability(html, url);
    if ((readabilityData.ingredients && readabilityData.ingredients.length >= 3) ||
        (readabilityData.steps && readabilityData.steps.length >= 2)) {
      return {
        title: readabilityData.title || 'Untitled Recipe',
        ingredients: readabilityData.ingredients || [],
        steps: readabilityData.steps || [],
        tips: readabilityData.tips || [],
        times: readabilityData.times,
        servings: readabilityData.servings,
        confidence: readabilityData.confidence || { ingredients: 0.6, steps: 0.6, times: 0 },
        debug: {
          hasStructuredData: false,
          structuredDataType: 'none',
          parsedFromHtml: true,
          layer: 'readability',
          attempts,
          url
        }
      };
    }

    // Heuristic HTML parsing
    attempts.push('heuristics');
    const htmlData = parseHtmlContent(html, url);
    
    return {
      title: htmlData.title || 'Untitled Recipe',
      ingredients: htmlData.ingredients || [],
      steps: htmlData.steps || [],
      tips: htmlData.tips || [],
      times: htmlData.times,
      servings: htmlData.servings,
      confidence: htmlData.confidence || { ingredients: 0, steps: 0, times: 0 },
      debug: {
        hasStructuredData: false,
        structuredDataType: "none",
        parsedFromHtml: true,
        layer: 'heuristics',
        attempts,
        url
      }
    };
    
  } catch (error) {
    console.error(`Failed to extract recipe from ${url}:`, error);
    
    // Return a minimal recipe with error information instead of throwing
    return {
      title: `Failed to extract from ${new URL(url).hostname}`,
      ingredients: [],
      steps: [],
      tips: [],
      confidence: { ingredients: 0, steps: 0, times: 0 },
      debug: {
        hasStructuredData: false,
        structuredDataType: "none",
        parsedFromHtml: false,
        layer: 'heuristics' as const,
        attempts: ['failed'],
        url
      }
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
