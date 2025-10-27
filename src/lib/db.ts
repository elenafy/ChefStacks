// src/lib/db.ts
import fs from 'fs/promises';
import path from 'path';

// Helper function to format timestamp in seconds to HH:MM:SS or MM:SS format
function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}

export type Recipe = {
    id: string;
    title: string;
    subtitle: string;
    stats: { prep: number; cook: number; serves: number; difficulty: string };
    youtube?: { 
      url: string; 
      author: string; 
      handle: string; 
      id: string;
      // Enhanced YouTube metadata
      views?: string;
      likes?: string;
      comments?: string;
      publishedAt?: string;
      duration?: string;
      tags?: string[];
      categoryId?: string;
    };
    web?: { url: string; domain: string; author?: string };
    ingredients: { 
      qty: string; 
      item: string;
      // Enhanced ingredient data
      normalized?: string;
      source?: "description" | "transcript" | "youtube-api" | "manual";
      confidence?: number;
      section?: string;
    }[];
    steps: { 
      text: string; 
      ts?: string; 
      img?: string;
      // Enhanced step data
      order?: number;
      title?: string;
      timestamp?: number;
      timestampFormatted?: string;
      instructions?: string[];
      screenshot?: string;
      deepLink?: string;
      source?: "description" | "transcript" | "youtube-api" | "manual";
      confidence?: number;
    }[];
    tips: string[];
    image: string;
    saved?: boolean; // Keep for backward compatibility
    saveCount?: number; // New field for tracking save count
    
    // Enhanced metadata from hybrid extractor
    metadata?: {
      video: {
        title: string;
        channel: string;
        published: string;
        duration: string;
        views: string;
        likes: string;
        comments: string;
        thumbnail: string;
        tags: string[];
        category: string;
      };
      channel: {
        name: string;
        subscribers: string;
        videos: string;
        views: string;
        country?: string;
        customUrl?: string;
      };
      quality: {
        score: number;
        factors: {
          channelAuthority: number;
          engagement: number;
          contentQuality: number;
          freshness: number;
        };
      };
      discovery: {
        searchable: boolean;
        recommended: boolean;
        trending: boolean;
      };
    };
    
    // Provenance and confidence
    provenance?: {
      ingredientsFrom: "description" | "transcript" | "youtube-api" | "manual";
      stepsFrom: "description" | "transcript" | "youtube-api" | "manual";
      overallConfidence: number;
      extractionMethod: "hybrid" | "description-first" | "transcript-only";
    };
    
    // Debug information (optional)
    debug?: {
      processingTime: number;
      apiCalls: number;
      fallbacks: string[];
      qualityFactors: any;
    };
  };

const DATA_FILE = path.join(process.cwd(), 'data', 'recipes.json');
const NOTES_FILE = path.join(process.cwd(), 'data', 'notes.json');

// Default recipes
const DEFAULT_RECIPES: Recipe[] = [
    {
      id: "r1",
      title: "Crispy Garlic Butter Chicken",
      subtitle: "Easy weeknight dinner with amazing flavors",
      stats: { prep: 15, cook: 25, serves: 4, difficulty: "Easy" },
      youtube: {
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        author: "Chef Maria",
        handle: "@ChefMaria",
        id: "dQw4w9WgXcQ",
      },
      ingredients: [
        { qty: "4 pieces", item: "Chicken thighs, bone-in" },
        { qty: "4 cloves", item: "Garlic, minced" },
        { qty: "3 tbsp", item: "Butter, unsalted" },
        { qty: "2 tbsp", item: "Olive oil" },
        { qty: "1 tsp", item: "Paprika" },
        { qty: "1 tsp", item: "Dried thyme" },
        { qty: "1/2 tsp", item: "Salt" },
        { qty: "1/4 tsp", item: "Black pepper" },
        { qty: "2 tbsp", item: "Fresh parsley, chopped" },
        { qty: "1/4 cup", item: "Chicken broth" },
      ],
      steps: [
        {
          text: "Season chicken thighs with salt, pepper, and paprika.",
          ts: "0:45",
          img: "/images/recipes/crispy-garlic-butter-chicken/step-1-seasoning.jpg"
        },
        {
          text: "Sear skin-side down in hot oil for 6–7 minutes.",
          ts: "2:15",
          img: "/images/recipes/crispy-garlic-butter-chicken/step-2-searing.jpg"
        },
        {
          text: "Flip and cook 5–6 minutes more until nearly done.",
          ts: "4:30",
          img: "/images/recipes/crispy-garlic-butter-chicken/step-3-flipping.jpg"
        },
        {
          text: "Add butter and minced garlic; sauté 1 minute until fragrant.",
          ts: "6:10",
          img: "/images/recipes/crispy-garlic-butter-chicken/step-4-garlic-butter.jpg"
        },
        {
          text: "Return chicken, baste with garlic butter 2–3 minutes, garnish, serve.",
          ts: "7:25",
          img: "/images/recipes/crispy-garlic-butter-chicken/step-5-final.jpg"
        }
      ],
      tips: [
        "Let the chicken sit at room temperature for 15 minutes before cooking for even cooking",
        "Don't move the chicken while searing - let the crust form naturally",
        "Use a meat thermometer to ensure 165°F internal temperature",
        "Save the pan drippings - they make an amazing sauce",
        "Serve with roasted vegetables or mashed potatoes"
      ],
      image: "/images/recipes/crispy-garlic-butter-chicken/crispy-garlic-butter-chicken-4.jpg",
      saved: true,
    },
    {
      id: "r2",
      title: "One-Pot Creamy Mushroom Pasta",
      subtitle: "Rich, silky sauce in 20 minutes",
      stats: { prep: 10, cook: 20, serves: 2, difficulty: "Easy" },
      youtube: {
        url: "https://www.youtube.com/watch?v=abcd0002",
        author: "Kitchen Komodo",
        handle: "@kkomodo",
        id: "abcd0002",
      },
      ingredients: [{ qty: "200 g", item: "Pasta" }],
      steps: [{ text: "Sauté mushrooms and garlic in butter.", ts: "0:30" }],
      tips: ["Reserve pasta water"],
      image:
        "https://images.unsplash.com/photo-1528756514091-dee5ecaa3278?q=80&w=1200&auto=format&fit=crop",
    },
    {
      id: "r3",
      title: "Smash Burger with Secret Sauce",
      subtitle: "Crispy edges, juicy center",
      stats: { prep: 12, cook: 8, serves: 2, difficulty: "Medium" },
      youtube: {
        url: "https://www.youtube.com/watch?v=abcd0003",
        author: "Flippin’ Good",
        handle: "@flipgood",
        id: "abcd0003",
      },
      ingredients: [{ qty: "2", item: "Beef patties" }],
      steps: [{ text: "Press hard for crust, flip once.", ts: "1:00" }],
      tips: ["Don’t overwork beef"],
      image:
        "https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=1200&auto=format&fit=crop",
      saved: true,
    },
    {
      id: "r4",
      title: "Sushi Rice & Salmon Nigiri Basics",
      subtitle: "Restaurant-style rice at home",
      stats: { prep: 30, cook: 15, serves: 4, difficulty: "Medium" },
      youtube: {
        url: "https://www.youtube.com/watch?v=abcd0004",
        author: "Hikari Bento",
        handle: "@hikari",
        id: "abcd0004",
      },
      ingredients: [{ qty: "2 cups", item: "Sushi rice" }],
      steps: [{ text: "Rinse rice until water runs clear.", ts: "0:20" }],
      tips: ["Fan rice to cool"],
      image:
        "https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=1200&auto=format&fit=crop",
    },
    {
      id: "r5",
      title: "Chocolate Lava Cake",
      subtitle: "Molten centers, guaranteed",
      stats: { prep: 20, cook: 12, serves: 4, difficulty: "Easy" },
      youtube: {
        url: "https://www.youtube.com/watch?v=abcd0005",
        author: "Bake Craft",
        handle: "@bakecraft",
        id: "abcd0005",
      },
      ingredients: [{ qty: "200 g", item: "Dark chocolate" }],
      steps: [{ text: "Whisk eggs and sugar until pale.", ts: "0:40" }],
      tips: ["Chill batter for 10 min"],
      image:
        "https://images.unsplash.com/photo-1601972599720-b1cf494cec7e?q=80&w=1200&auto=format&fit=crop",
      saved: true,
    },
    {
      id: "r6",
      title: "Vietnamese Lemongrass Pork",
      subtitle: "Fragrant, caramelized edges",
      stats: { prep: 25, cook: 15, serves: 3, difficulty: "Medium" },
      youtube: {
        url: "https://www.youtube.com/watch?v=abcd0006",
        author: "Saigon Sizzle",
        handle: "@saigonsizzle",
        id: "abcd0006",
      },
      ingredients: [{ qty: "500 g", item: "Pork shoulder" }],
      steps: [{ text: "Marinate with lemongrass and fish sauce.", ts: "0:50" }],
      tips: ["High heat for color"],
      image:
        "https://images.unsplash.com/photo-1550547660-9d0f7462f441?q=80&w=1200&auto=format&fit=crop",
    },
    {
      id: "r7",
      title: "Paneer Butter Masala",
      subtitle: "Creamy tomato gravy",
      stats: { prep: 20, cook: 30, serves: 4, difficulty: "Medium" },
      youtube: {
        url: "https://www.youtube.com/watch?v=abcd0007",
        author: "Spice Trail",
        handle: "@spicetrail",
        id: "abcd0007",
      },
      ingredients: [{ qty: "250 g", item: "Paneer" }],
      steps: [{ text: "Blitz tomato gravy until smooth.", ts: "1:10" }],
      tips: ["Kasuri methi at end"],
      image:
        "https://images.unsplash.com/photo-1544025162-68df7d8cda20?q=80&w=1200&auto=format&fit=crop",
    },
    {
      id: "r8",
      title: "Shakshuka with Feta",
      subtitle: "Brunch classic",
      stats: { prep: 10, cook: 18, serves: 3, difficulty: "Easy" },
      youtube: {
        url: "https://www.youtube.com/watch?v=abcd0008",
        author: "Eggstatic",
        handle: "@eggstatic",
        id: "abcd0008",
      },
      ingredients: [{ qty: "4", item: "Eggs" }],
      steps: [{ text: "Simmer peppers & tomatoes before cracking eggs.", ts: "0:55" }],
      tips: ["Cover to set whites"],
      image:
        "https://images.unsplash.com/photo-1473093226795-af9932fe5856?q=80&w=1200&auto=format&fit=crop",
    },
    // add a few more to reach ~12–16 cards
    {
      id: "r9",
      title: "Miso-Glazed Salmon",
      subtitle: "Sweet-savory broiled fillets",
      stats: { prep: 5, cook: 10, serves: 2, difficulty: "Easy" },
      youtube: { url: "https://www.youtube.com/watch?v=abcd0009", author: "Umami Lab", handle: "@umamilab", id: "abcd0009" },
      ingredients: [{ qty: "2", item: "Salmon fillets" }],
      steps: [{ text: "Brush miso glaze; broil until caramelized.", ts: "0:25" }],
      tips: ["Line tray with foil"],
      image: "https://images.unsplash.com/photo-1514511547117-f9c6c1bfbf38?q=80&w=1200&auto=format&fit=crop",
    },
    {
      id: "r10",
      title: "Thai Green Curry",
      subtitle: "Aromatic coconut curry",
      stats: { prep: 15, cook: 20, serves: 4, difficulty: "Medium" },
      youtube: { url: "https://www.youtube.com/watch?v=abcd0010", author: "Bangkok Bites", handle: "@bangkokbites", id: "abcd0010" },
      ingredients: [{ qty: "2 tbsp", item: "Green curry paste" }],
      steps: [{ text: "Bloom curry paste in coconut cream.", ts: "0:35" }],
      tips: ["Thai basil at finish"],
      image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?q=80&w=1200&auto=format&fit=crop",
    },
    {
      id: "r11",
      title: "Greek Chicken Gyros",
      subtitle: "Yogurt-marinated chicken",
      stats: { prep: 20, cook: 15, serves: 4, difficulty: "Easy" },
      youtube: { url: "https://www.youtube.com/watch?v=abcd0011", author: "Aegean Eats", handle: "@aegean", id: "abcd0011" },
      ingredients: [{ qty: "500 g", item: "Chicken thighs" }],
      steps: [{ text: "Grill marinated chicken; slice thinly.", ts: "1:05" }],
      tips: ["Warm the pitas"],
      image: "https://images.unsplash.com/photo-1604908176997-431651c7c9b0?q=80&w=1200&auto=format&fit=crop",
      saved: true,
    },
    {
      id: "r12",
      title: "Avocado Toast 3 Ways",
      subtitle: "Quick, fresh breakfast",
      stats: { prep: 5, cook: 0, serves: 2, difficulty: "Easy" },
      youtube: { url: "https://www.youtube.com/watch?v=abcd0012", author: "Toast Co.", handle: "@toastco", id: "abcd0012" },
      ingredients: [{ qty: "2", item: "Avocados" }],
      steps: [{ text: "Mash with lemon, salt, chili flakes.", ts: "0:15" }],
      tips: ["Good bread matters"],
      image: "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?q=80&w=1200&auto=format&fit=crop",
    },
  ];
  
  let NOTES: Record<string, string> = {};
  let notesLoaded = false;

// Load recipes from file or use defaults
async function loadRecipes(): Promise<Recipe[]> {
  try {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    const recipes = JSON.parse(data);
    
    // If file has fewer than 10 recipes, merge with defaults to ensure we have a good selection
    if (recipes.length < 10) {
      const defaultIds = new Set(DEFAULT_RECIPES.map(r => r.id));
      const fileIds = new Set(recipes.map((r: any) => r.id));
      const missingDefaults = DEFAULT_RECIPES.filter(r => !fileIds.has(r.id));
      return [...recipes, ...missingDefaults];
    }
    
    return recipes;
  } catch {
    return DEFAULT_RECIPES;
  }
}

// Save recipes to file
async function saveRecipes(recipes: Recipe[]): Promise<void> {
  try {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(recipes, null, 2));
  } catch (error) {
    console.error('Failed to save recipes:', error);
  }
}

// Load notes from file
async function loadNotes(): Promise<Record<string, string>> {
  try {
    await fs.mkdir(path.dirname(NOTES_FILE), { recursive: true });
    const data = await fs.readFile(NOTES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

// Save notes to file
async function saveNotes(notes: Record<string, string>): Promise<void> {
  try {
    await fs.mkdir(path.dirname(NOTES_FILE), { recursive: true });
    await fs.writeFile(NOTES_FILE, JSON.stringify(notes, null, 2));
  } catch (error) {
    console.error('Failed to save notes:', error);
  }
}

// Get current recipes (load from file if needed)
let RECIPES: Recipe[] = [];
let recipesLoaded = false;

async function getRecipes(): Promise<Recipe[]> {
  if (!recipesLoaded) {
    RECIPES = await loadRecipes();
    recipesLoaded = true;
  }
  return RECIPES;
}

// Load notes (load from file if needed)
async function loadNotesData(): Promise<Record<string, string>> {
  if (!notesLoaded) {
    NOTES = await loadNotes();
    notesLoaded = true;
  }
  return NOTES;
}
  
  // queries
  export async function listRecipes(q?: string): Promise<Recipe[]> {
    const recipes = await getRecipes();
    if (!q) return recipes;
    const s = q.toLowerCase();
    return recipes.filter((r) => r.title.toLowerCase().includes(s));
  }
export async function getRecipeById(id: string): Promise<Recipe | null> {
  const recipes = await getRecipes();
  return recipes.find((r) => r.id === id || r.youtube?.id === id) ?? null;
}

export async function getRecipeByUrl(url: string): Promise<Recipe | null> {
  const recipes = await getRecipes();
  return recipes.find((r) => r.youtube?.url === url || r.web?.url === url) ?? null;
}
  export async function upsertRecipeFromYouTubeId(youtubeId: string, extractedData?: any) {
    const recipes = await getRecipes();
    const existing = recipes.find((r) => r.youtube?.id === youtubeId);
    if (existing) return { existing: true, recipe: existing };
    
    // Use hybrid extractor data if available
    const isHybridData = extractedData?.metadata && extractedData?.provenance;
    
    const r: Recipe = {
      id: `new-${Date.now()}`,
      title: extractedData?.title || "New AI-Summarized Recipe",
      subtitle: isHybridData ? "Enhanced with YouTube Data API" : "Auto-generated from video",
      stats: { 
        prep: extractedData?.times?.prep_min || null, 
        cook: extractedData?.times?.cook_min || null, 
        serves: extractedData?.times?.serves || null, 
        difficulty: extractedData?.difficulty || null 
      },
      youtube: { 
        url: `https://www.youtube.com/watch?v=${youtubeId}`, 
        author: isHybridData ? extractedData.metadata.channel.name : "YouTube Creator", 
        handle: isHybridData ? extractedData.metadata.channel.customUrl || "@creator" : "@creator", 
        id: youtubeId,
        // Enhanced YouTube metadata
        views: isHybridData ? extractedData.metadata.video.views : undefined,
        likes: isHybridData ? extractedData.metadata.video.likes : undefined,
        comments: isHybridData ? extractedData.metadata.video.comments : undefined,
        publishedAt: isHybridData ? extractedData.metadata.video.published : undefined,
        duration: isHybridData ? extractedData.metadata.video.duration : undefined,
        tags: isHybridData ? extractedData.metadata.video.tags : undefined,
        categoryId: isHybridData ? extractedData.metadata.video.category : undefined,
      },
      ingredients: extractedData?.ingredients?.map((ing: any) => ({
        qty: ing.qty || ing.quantity || "",
        item: ing.text || ing.raw || ing.normalized || "",
        // Enhanced ingredient data
        normalized: ing.normalized,
        source: ing.from || ing.source,
        confidence: ing.confidence,
        section: ing.section,
      })) || [{ qty: "1", item: "Example ingredient" }],
      steps: extractedData?.steps?.map((step: any) => {
        const rawTimestamp: number | undefined = typeof step.timestamp === 'number' ? step.timestamp : undefined;
        const secondsNormalized: number | undefined =
          rawTimestamp != null ? (rawTimestamp > 10000 ? Math.round(rawTimestamp / 1000) : rawTimestamp) : undefined;
        const tsFormatted: string | undefined = step.timestampFormatted || (secondsNormalized != null ? formatTimestamp(secondsNormalized) : undefined);

        return {
          text: step.instructions?.join(' ') || step.text || "",
          ts: tsFormatted,
          img: step.screenshot?.success ? step.screenshot.url : (step.screenshot || step.image),
          // Enhanced step data
          order: step.order,
          title: step.title,
          timestamp: secondsNormalized,
          timestampFormatted: tsFormatted,
          instructions: step.instructions,
          screenshot: step.screenshot,
          deepLink: step.deepLink,
          source: step.from || step.source,
          confidence: step.confidence,
        };
      }) || [{ text: "Example step.", ts: "0:10", img: undefined }],
      tips: extractedData?.tips || [],
      image: extractedData?.image || "https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=1200&auto=format&fit=crop",
      saved: false,
      
      // Enhanced metadata from hybrid extractor
      metadata: isHybridData ? extractedData.metadata : undefined,
      provenance: isHybridData ? extractedData.provenance : undefined,
      debug: isHybridData ? extractedData.debug : undefined,
    };
    const updatedRecipes = [r, ...recipes];
    RECIPES = updatedRecipes;
    await saveRecipes(updatedRecipes);
    return { existing: false, recipe: r };
  }

export async function upsertRecipeFromWebUrl(webUrl: string, extractedData: any) {
  const recipes = await getRecipes();
  const existing = recipes.find((r) => r.web?.url === webUrl);
  const urlObj = new URL(webUrl);
  const domain = urlObj.hostname.replace('www.', '');
  
  // Validate that we have meaningful data before creating a recipe
  const hasValidData = extractedData && (
    (extractedData.ingredients && extractedData.ingredients.length > 0) ||
    (extractedData.steps && extractedData.steps.length > 0) ||
    (extractedData.title && extractedData.title !== 'Untitled Recipe' && extractedData.title !== 'Failed to extract from ' + domain)
  );
  
  if (!hasValidData) {
    console.warn(`Skipping recipe creation for ${webUrl} - insufficient data extracted`);
    return { existing: false, recipe: null, reason: 'insufficient_data' };
  }
  
  if (existing) {
    // Update existing recipe with new extracted data
    const updatedRecipe = {
      ...existing,
      title: extractedData.title || existing.title,
      image: extractedData.image || existing.image,
      ingredients: extractedData.ingredients?.map((ing: any) => ({
        qty: ing.qty || "",
        item: ing.text || ing.name || ing.line || ""
      })) || existing.ingredients,
      steps: extractedData.steps?.map((step: any) => ({
        text: step.text || "",
        ts: step.ts ? `${Math.floor(step.ts / 60)}:${(step.ts % 60).toString().padStart(2, '0')}` : undefined,
        img: step.image
      })) || existing.steps,
      stats: {
        prep: extractedData.times?.prep_min || existing.stats.prep,
        cook: extractedData.times?.cook_min || existing.stats.cook,
        serves: extractedData.servings || existing.stats.serves,
        difficulty: existing.stats.difficulty
      },
      web: existing.web ? {
        ...existing.web,
        author: extractedData.author || existing.web.author || "Web Source"
      } : {
        url: webUrl,
        domain: urlObj.hostname.replace('www.', ''),
        author: extractedData.author || "Web Source"
      }
    };
    
    const updatedRecipes = recipes.map((r) => (r.id === existing.id ? updatedRecipe : r));
    RECIPES = updatedRecipes;
    await saveRecipes(updatedRecipes);
    return { existing: true, recipe: updatedRecipe };
  }
    
  const r: Recipe = {
      id: `web-${Date.now()}`,
      title: extractedData.title || `Recipe from ${domain}`,
      subtitle: extractedData.title ? "Imported from web" : "Failed to extract recipe details",
      stats: { 
        prep: extractedData.times?.prep_min || null, 
        cook: extractedData.times?.cook_min || null, 
        serves: extractedData.servings || null, 
        difficulty: "Easy" 
      },
      web: { 
        url: webUrl, 
        domain: domain,
        author: extractedData.author || "Web Source"
      },
      ingredients: extractedData.ingredients?.map((ing: any) => ({
        qty: ing.qty || "",
        item: ing.text || ing.name || ing.line || ""
      })) || [],
      steps: extractedData.steps?.map((step: any) => ({
        text: step.text || "",
        ts: step.ts ? `${Math.floor(step.ts / 60)}:${(step.ts % 60).toString().padStart(2, '0')}` : undefined,
        img: step.image
      })) || [],
      tips: extractedData.tips || [],
      image: extractedData.image || "https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=1200&auto=format&fit=crop",
      saved: false,
    };
    const updatedRecipes = [r, ...recipes];
    RECIPES = updatedRecipes;
    await saveRecipes(updatedRecipes);
    return { existing: false, recipe: r };
  }
  export async function toggleSave(recipe_id: string) {
    const recipes = await getRecipes();
    const updatedRecipes = recipes.map((r) => {
      if (r.id === recipe_id) {
        const currentSaveCount = r.saveCount || 0;
        const isCurrentlySaved = r.saved || false;
        
        return {
          ...r,
          saved: !isCurrentlySaved,
          saveCount: isCurrentlySaved ? Math.max(0, currentSaveCount - 1) : currentSaveCount + 1
        };
      }
      return r;
    });
    RECIPES = updatedRecipes;
    await saveRecipes(updatedRecipes);
  }
  export async function getCollection(): Promise<Recipe[]> {
    const recipes = await getRecipes();
    return recipes.filter((r) => r.saved);
  }
  export async function getNotes(recipe_id: string) {
    const notes = await loadNotesData();
    return notes[recipe_id] || "";
  }
  export async function setNotes(recipe_id: string, body: string) {
    const notes = await loadNotesData();
    notes[recipe_id] = body;
    NOTES[recipe_id] = body; // Update in-memory cache
    await saveNotes(notes); // Persist to file
  }

  export async function deleteRecipe(recipe_id: string): Promise<boolean> {
    const recipes = await getRecipes();
    const recipeExists = recipes.some((r) => r.id === recipe_id);
    
    if (!recipeExists) {
      return false;
    }
    
    const updatedRecipes = recipes.filter((r) => r.id !== recipe_id);
    RECIPES = updatedRecipes;
    await saveRecipes(updatedRecipes);
    
    // Also remove any notes for this recipe
    if (NOTES[recipe_id]) {
      delete NOTES[recipe_id];
    }
    
    return true;
  }
  