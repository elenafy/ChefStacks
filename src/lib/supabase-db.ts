import { createClientComponentClient, supabase } from './supabase'
import { Database } from './supabase'

type Recipe = Database['public']['Tables']['recipes']['Row']
type RecipeInsert = Database['public']['Tables']['recipes']['Insert']
type RecipeUpdate = Database['public']['Tables']['recipes']['Update']

type Collection = Database['public']['Tables']['collections']['Row']
type CollectionInsert = Database['public']['Tables']['collections']['Insert']

type CollectionItem = Database['public']['Tables']['collection_items']['Row']
type CollectionItemInsert = Database['public']['Tables']['collection_items']['Insert']

type RecipeShare = Database['public']['Tables']['recipe_shares']['Row']
type RecipeShareInsert = Database['public']['Tables']['recipe_shares']['Insert']

// Convert old recipe format to new format
export function convertLegacyRecipe(legacyRecipe: any): RecipeInsert {
  return {
    title: legacyRecipe.title,
    source_url: legacyRecipe.youtube?.url || legacyRecipe.web?.url || null,
    content_json: {
      subtitle: legacyRecipe.subtitle,
      stats: legacyRecipe.stats,
      youtube: legacyRecipe.youtube,
      web: legacyRecipe.web,
      ingredients: legacyRecipe.ingredients,
      steps: legacyRecipe.steps,
      tips: legacyRecipe.tips,
      image: legacyRecipe.image,
      metadata: legacyRecipe.metadata,
      provenance: legacyRecipe.provenance,
      debug: legacyRecipe.debug
    },
    images: legacyRecipe.image ? [legacyRecipe.image] : [],
    is_public: false
  }
}

// Convert new recipe format to legacy format for backward compatibility
export function convertToLegacyRecipe(recipe: Recipe): any {
  const content = recipe.content_json as any
  return {
    id: recipe.id,
    title: recipe.title,
    author: content.web?.author || content.youtube?.author || content.tiktok?.author || content.instagram?.author || null,
    subtitle: content.subtitle || '',
    stats: content.stats || { prep: null, cook: null, serves: null, difficulty: null },
    youtube: content.youtube,
    tiktok: content.tiktok,
    instagram: content.instagram,
    web: content.web,
    ingredients: content.ingredients?.map((ing: any) => ({
      qty: ing.qty || ing.quantity || "",
      unit: ing.unit || "",
      item: ing.text || ing.name || ing.line || ing.item || ing.raw || ""
    })) || [],
    steps: content.steps?.map((step: any) => ({
      text: step.text || step.instructions?.join(' ') || "",
      ts: step.ts || (step.startTimeSec ? `${Math.floor(step.startTimeSec / 60)}:${(step.startTimeSec % 60).toString().padStart(2, '0')}` : undefined),
      img: step.img || step.screenshot || step.image,
      order: step.order || step.index,
      title: step.title,
      timestamp: step.timestamp || step.startTimeSec,
      timestampFormatted: step.timestampFormatted || (step.startTimeSec ? `${Math.floor(step.startTimeSec / 60)}:${(step.startTimeSec % 60).toString().padStart(2, '0')}` : undefined),
      instructions: step.instructions,
      screenshot: step.screenshot,
      deepLink: step.deepLink,
      source: step.from || step.source,
      confidence: step.confidence,
      chapterTitle: step.chapterTitle
    })) || [],
    tips: content.tips || [],
    image: recipe.images[0] || content.image || null,
    saved: false, // This will be determined by collection membership
    saveCount: 0, // This will be calculated separately
    metadata: content.metadata,
    provenance: content.provenance,
    debug: content.debug,
    owner_id: recipe.owner_id, // Include owner information
    created_at: recipe.created_at, // Include creation timestamp
    is_base: recipe.is_base, // Include base recipe flag
    is_public: recipe.is_public, // Include public flag
    parent_id: recipe.parent_id, // Include parent recipe ID
    saves_count: recipe.saves_count || 0 // Include saves count
  }
}

export class SupabaseDB {
  private supabase = createClientComponentClient()

  // Create a server-side client with secret key
  private getServerClient() {
    const { createClient } = require('@supabase/supabase-js')
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )
  }

  // Get the appropriate client (server for API routes, client for browser)
  private getClient() {
    // Use server client for API routes (when running on server)
    if (typeof window === 'undefined') {
      return this.getServerClient()
    }
    // Use client for browser
    return this.supabase
  }

  // Check if Supabase is properly configured
  static isConfigured(): boolean {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    const secretKey = process.env.SUPABASE_SECRET_KEY
    
    return !!(url && publishableKey && secretKey && 
              !url.includes('placeholder') && 
              !publishableKey.includes('placeholder'))
  }

  // Ensure user profile exists
  async ensureUserProfile(userId: string): Promise<void> {
    try {
      const serverClient = this.getServerClient()
      
      const { data: existingProfile, error: profileError } = await serverClient
        .from('profiles')
        .select('user_id')
        .eq('user_id', userId)
        .single()
      
      // If profile doesn't exist, create it
      if (profileError && profileError.code === 'PGRST116') {
        console.log('Creating profile for user:', userId)
        
        const { error: insertError } = await serverClient
          .from('profiles')
          .insert({
            user_id: userId,
            display_name: 'User',
            avatar_url: null
          })
        
        if (insertError) {
          console.error('Profile creation error:', insertError)
          throw insertError
        }
      }
    } catch (error) {
      console.error('Profile check error:', error)
      throw error
    }
  }

  // Recipe operations
  async getRecipeBySourceUrl(sourceUrl: string): Promise<Recipe | null> {
    const client = this.getClient()
    const { data, error } = await client
      .from('recipes')
      .select('*')
      .eq('source_url', sourceUrl)
      .single()

    if (error) {
      if ((error as any).code === 'PGRST116') return null
      throw error
    }
    return data
  }

  async createRecipe(recipe: RecipeInsert, ownerId?: string): Promise<Recipe> {
    const client = this.getClient()
    
    // Sanitize and validate the recipe data before insertion
    const sanitizedRecipe = this.sanitizeRecipeData(recipe)
    
    console.log('🔍 Creating recipe in Supabase:', {
      title: sanitizedRecipe.title,
      source_url: sanitizedRecipe.source_url,
      owner_id: ownerId,
      is_base: sanitizedRecipe.is_base,
      is_public: sanitizedRecipe.is_public,
      has_content_json: !!sanitizedRecipe.content_json,
      images_count: sanitizedRecipe.images?.length || 0
    });
    
    const { data, error } = await client
      .from('recipes')
      .insert({
        ...sanitizedRecipe,
        owner_id: ownerId || null
      })
      .select()
      .single()

    if (error) {
      console.error('❌ Error creating recipe:', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        recipe_title: sanitizedRecipe.title,
        recipe_source_url: sanitizedRecipe.source_url
      })
      throw error
    }
    
    console.log('✅ Recipe created successfully:', {
      id: data.id,
      title: data.title,
      is_public: data.is_public,
      created_at: data.created_at
    });
    
    return data
  }

  // Sanitize recipe data to prevent PostgreSQL errors
  private sanitizeRecipeData(recipe: RecipeInsert): RecipeInsert {
    return {
      ...recipe,
      title: String(recipe.title || 'Untitled Recipe').substring(0, 500), // Limit title length
      source_url: recipe.source_url ? String(recipe.source_url).substring(0, 2000) : null, // Limit URL length
      content_json: this.sanitizeContentJson(recipe.content_json),
      images: Array.isArray(recipe.images) ? recipe.images.map(img => String(img).substring(0, 2000)) : [],
      is_base: Boolean(recipe.is_base),
      is_public: Boolean(recipe.is_public),
      summarized_instructions: recipe.summarized_instructions ? String(recipe.summarized_instructions).substring(0, 10000) : null,
      saves_count: recipe.saves_count ? Math.max(0, Number(recipe.saves_count)) : 0
    }
  }

  // Sanitize content_json to ensure all values are properly typed
  private sanitizeContentJson(contentJson: any): any {
    if (!contentJson || typeof contentJson !== 'object') {
      return {}
    }

    const sanitized = { ...contentJson }

    // Sanitize stats
    if (sanitized.stats && typeof sanitized.stats === 'object') {
      sanitized.stats = {
        prep: sanitized.stats.prep ? Number(sanitized.stats.prep) : null,
        cook: sanitized.stats.cook ? Number(sanitized.stats.cook) : null,
        serves: sanitized.stats.serves ? Number(sanitized.stats.serves) : null,
        difficulty: sanitized.stats.difficulty ? String(sanitized.stats.difficulty) : null
      }
    }

    // Sanitize ingredients array
    if (Array.isArray(sanitized.ingredients)) {
      sanitized.ingredients = sanitized.ingredients.map((ing: any) => ({
        text: String(ing.text || ''),
        qty: String(ing.qty || ''),
        unit: String(ing.unit || ''),
        normalized: String(ing.normalized || ''),
        from: String(ing.from || ''),
        confidence: Number(ing.confidence || 0)
      }))
    }

    // Sanitize steps array
    if (Array.isArray(sanitized.steps)) {
      sanitized.steps = sanitized.steps.map((step: any) => ({
        order: Number(step.order || 0),
        title: String(step.title || ''),
        instructions: Array.isArray(step.instructions) ? step.instructions.map((i: any) => String(i)) : [String(step.text || '')],
        text: String(step.text || ''),
        timestamp: step.timestamp ? Number(step.timestamp) : null,
        timestampFormatted: step.timestampFormatted ? String(step.timestampFormatted) : null,
        deepLink: step.deepLink ? String(step.deepLink) : null,
        from: String(step.from || ''),
        confidence: Number(step.confidence || 0),
        image: step.image ? String(step.image) : undefined
      }))
    }

    // Sanitize tips array
    if (Array.isArray(sanitized.tips)) {
      sanitized.tips = sanitized.tips.map((tip: any) => String(tip))
    }

    // Sanitize other string fields
    sanitized.subtitle = String(sanitized.subtitle || '')
    sanitized.image = sanitized.image ? String(sanitized.image) : null

    return sanitized
  }

  // Create a user version from a base recipe. Copies immutable source fields.
  async createUserVersion(baseRecipeId: string, ownerId: string, updates: Partial<RecipeInsert>): Promise<Recipe> {
    // Load base recipe
    const base = await this.getRecipe(baseRecipeId)
    if (!base) throw new Error('Base recipe not found')

    // Enforce immutables: source_url and author fields within content_json.youtube/web
    const baseContent = (base.content_json as any) || {}
    const baseYoutube = baseContent.youtube || null
    const baseWeb = baseContent.web || null

    const mergedContent = {
      ...(base.content_json as any),
      ...(updates.content_json as any),
      // Force immutable fields to match base
      youtube: baseYoutube ? { ...baseYoutube } : null,
      web: baseWeb ? { ...baseWeb } : null,
    }

    const insert: RecipeInsert = {
      title: updates.title || base.title,
      source_url: base.source_url,
      parent_id: base.id,
      is_base: false,
      content_json: mergedContent,
      images: updates.images || base.images || [],
      is_public: updates.is_public ?? true,
      summarized_instructions: updates.summarized_instructions ?? base.summarized_instructions ?? null,
      // saves_count will default to 0 server-side; keep undefined in insert
    } as RecipeInsert

    const { data, error } = await this.supabase
      .from('recipes')
      .insert({
        ...insert,
        owner_id: ownerId,
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  async getRecipe(id: string): Promise<Recipe | null> {
    const client = this.getClient()
    const { data, error } = await client
      .from('recipes')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // Not found
      throw error
    }
    return data
  }

  async getPublicRecipe(id: string): Promise<Recipe | null> {
    const { data, error } = await this.supabase
      .from('recipes')
      .select('*')
      .eq('id', id)
      .eq('is_public', true)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // Not found
      throw error
    }
    return data
  }

  async getUserRecipes(userId?: string): Promise<Recipe[]> {
    let query = this.supabase
      .from('recipes')
      .select('*')
      .order('created_at', { ascending: false })

    if (userId) {
      query = query.eq('owner_id', userId)
    } else {
      query = query.is('owner_id', null)
    }

    const { data, error } = await query
    if (error) {
      console.error('getUserRecipes error:', error)
      throw error
    }
    
    console.log('getUserRecipes result:', {
      userId,
      recipeCount: data?.length || 0,
      recipeIds: data?.map((r: any) => r.id) || []
    })
    
    return data || []
  }

  async getPublicRecipes(): Promise<Recipe[]> {
    const { data, error } = await this.supabase
      .from('recipes')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  }

  async updateRecipe(id: string, updates: RecipeUpdate): Promise<Recipe> {
    const { data, error } = await this.supabase
      .from('recipes')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  }

  async deleteRecipe(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('recipes')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  // Collection operations
  async createCollection(name: string, ownerId?: string): Promise<Collection> {
    const { data, error } = await this.supabase
      .from('collections')
      .insert({
        name,
        owner_id: ownerId || null
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  async getUserCollections(userId?: string): Promise<Collection[]> {
    let query = this.supabase
      .from('collections')
      .select('*')
      .order('created_at', { ascending: false })

    if (userId) {
      query = query.eq('owner_id', userId)
    } else {
      query = query.is('owner_id', null)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  }

  async addRecipeToCollection(collectionId: string, recipeId: string, position?: number): Promise<void> {
    const { error } = await this.supabase
      .from('collection_items')
      .insert({
        collection_id: collectionId,
        recipe_id: recipeId,
        position: position || 0
      })

    if (error) throw error
  }

  async removeRecipeFromCollection(collectionId: string, recipeId: string): Promise<void> {
    const { error } = await this.supabase
      .from('collection_items')
      .delete()
      .eq('collection_id', collectionId)
      .eq('recipe_id', recipeId)

    if (error) throw error
  }

  async getCollectionRecipes(collectionId: string): Promise<Recipe[]> {
    const { data, error } = await this.supabase
      .from('collection_items')
      .select(`
        recipe_id,
        position,
        recipes (*)
      `)
      .eq('collection_id', collectionId)
      .order('position', { ascending: true })

    if (error) throw error
    return (data || []).map((item: any) => item.recipes).filter(Boolean) as Recipe[]
  }

  // Get deduplicated collection recipes - one version per base recipe
  async getDeduplicatedCollectionRecipes(collectionId: string, userId?: string): Promise<Recipe[]> {
    const { data, error } = await this.supabase
      .from('collection_items')
      .select(`
        recipe_id,
        position,
        recipes (*)
      `)
      .eq('collection_id', collectionId)
      .order('position', { ascending: true })

    if (error) throw error
    const recipes = (data || []).map((item: any) => item.recipes).filter(Boolean) as Recipe[]
    
    // Group recipes by their base recipe (either parent_id or id if it's a base)
    const baseGroups: { [key: string]: Recipe[] } = {}
    
    for (const recipe of recipes) {
      const baseId = recipe.parent_id || recipe.id
      if (!baseGroups[baseId]) {
        baseGroups[baseId] = []
      }
      baseGroups[baseId].push(recipe)
    }
    
    // For each base group, pick the best version:
    // 1. User's own version (if they have one)
    // 2. Most saved version
    // 3. Most recent version
    const deduplicatedRecipes: Recipe[] = []
    
    for (const [baseId, versions] of Object.entries(baseGroups)) {
      if (versions.length === 1) {
        deduplicatedRecipes.push(versions[0])
        continue
      }
      
      // Find user's version first
      const userVersion = userId ? versions.find(r => r.owner_id === userId) : null
      if (userVersion) {
        deduplicatedRecipes.push(userVersion)
        continue
      }
      
      // Otherwise, pick the most saved version
      const mostSaved = versions.reduce((best, current) => {
        const bestSaves = (best as any).saves_count || 0
        const currentSaves = (current as any).saves_count || 0
        return currentSaves > bestSaves ? current : best
      })
      
      deduplicatedRecipes.push(mostSaved)
    }
    
    return deduplicatedRecipes
  }

  // Popularity helpers
  async incrementSavesCount(recipeId: string, delta: number): Promise<void> {
    const { error } = await this.supabase
      .from('recipes')
      .update({ saves_count: (this.supabase as any).rpc ? undefined : undefined }) // placeholder to satisfy typing
      .eq('id', recipeId)
    if (error) {
      // fallback: fetch current and update
      const current = await this.getRecipe(recipeId)
      if (!current) return
      const currentCount = (current as any).saves_count || 0
      const { error: err2 } = await this.supabase
        .from('recipes')
        .update({ saves_count: Math.max(0, currentCount + delta) as any })
        .eq('id', recipeId)
      if (err2) throw err2
      return
    }
  }

  async getTopVersionForBase(baseRecipeId: string): Promise<Recipe | null> {
    const { data, error } = await this.supabase
      .from('recipes')
      .select('*')
      .eq('parent_id', baseRecipeId)
      .eq('is_public', true)
      .order('saves_count', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error && (error as any).code !== 'PGRST116') throw error
    return data || null
  }

  // Community feed: for each base (is_base=true), choose top version if exists else the base.
  async getCommunityFeed(limit = 100): Promise<Recipe[]> {
    const client = this.getClient()
    
    // Use a more efficient approach: fetch bases and their best versions in a single optimized query
    // First, get the most recent base recipes (we'll fetch a bit more to account for bases without versions)
    const baseFetchLimit = Math.min(limit * 2, 200) // Cap at 200 to avoid fetching too many
    
    const { data: bases, error: basesError } = await client
      .from('recipes')
      .select('id')
      .eq('is_base', true)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(baseFetchLimit)

    if (basesError) throw basesError

    // If no base recipes found, fall back to all public recipes (for migration period)
    if (!bases || bases.length === 0) {
      const { data: fallbackRecipes, error: fallbackError } = await client
        .from('recipes')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (fallbackError) throw fallbackError
      return fallbackRecipes || []
    }

    const baseIds = bases.map((b: any) => b.id)

    // Fetch versions more efficiently: limit to reasonable number per base
    // We'll fetch up to 5 versions per base (should be enough to find the best one)
    // Order by saves_count desc, then created_at desc to get best first
    const { data: versions, error: versionsError } = await client
      .from('recipes')
      .select('*')
      .in('parent_id', baseIds)
      .eq('is_public', true)
      .order('saves_count', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(baseIds.length * 5) // Limit total versions fetched

    if (versionsError) throw versionsError

    // Efficiently pick the best version per base (first occurrence due to ordering)
    const bestVersionByBase: Record<string, Recipe> = {}
    if (versions) {
      for (const v of versions as any[]) {
        const parentId: string = (v as any).parent_id
        if (parentId && !bestVersionByBase[parentId]) {
          bestVersionByBase[parentId] = v as any
        }
        // Early exit if we've found versions for all bases
        if (Object.keys(bestVersionByBase).length === baseIds.length) {
          break
        }
      }
    }

    // Now fetch full base recipes only for those we need
    const neededBaseIds = baseIds.slice(0, limit).filter((id: string) => !bestVersionByBase[id])
    const basesToFetch = neededBaseIds.length > 0 ? neededBaseIds : baseIds.slice(0, limit)
    
    const { data: fullBases, error: fullBasesError } = await client
      .from('recipes')
      .select('*')
      .in('id', basesToFetch)

    if (fullBasesError) throw fullBasesError

    // Build results: use best version if available, otherwise use base
    const results: Recipe[] = []
    const baseMap = new Map<string, Recipe>((fullBases || []).map((b: any) => [b.id, b as Recipe]))
    
    for (const baseId of baseIds.slice(0, limit)) {
      const version = bestVersionByBase[baseId]
      if (version) {
        results.push(version)
      } else {
        const base = baseMap.get(baseId)
        if (base) {
          results.push(base)
        }
      }
      if (results.length >= limit) break
    }

    // Sort by saves_count desc then created_at desc for display
    const sorted: any[] = [...results].sort((a: any, b: any) => {
      const aSaves = a?.saves_count || 0
      const bSaves = b?.saves_count || 0
      if (aSaves !== bSaves) return bSaves - aSaves
      const aTime = new Date(a?.created_at || 0).getTime()
      const bTime = new Date(b?.created_at || 0).getTime()
      return bTime - aTime
    })
    
    return sorted as Recipe[]
  }

  // Recipe sharing operations
  async createRecipeShare(recipeId: string, visibility: 'unlisted' | 'public' = 'unlisted'): Promise<RecipeShare> {
    const shareSlug = this.generateShareSlug()
    
    const { data, error } = await this.supabase
      .from('recipe_shares')
      .insert({
        recipe_id: recipeId,
        share_slug: shareSlug,
        visibility
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  async getRecipeByShareSlug(shareSlug: string): Promise<Recipe | null> {
    const { data, error } = await this.supabase
      .from('recipe_shares')
      .select(`
        recipes (*)
      `)
      .eq('share_slug', shareSlug)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // Not found
      throw error
    }
    return (data as any).recipes as Recipe
  }

  // Migration operations
  async migrateAnonymousData(anonymousId: string, userId: string): Promise<void> {
    // Migrate recipes
    await this.supabase
      .from('recipes')
      .update({ owner_id: userId })
      .is('owner_id', null)
      .eq('owner_id', anonymousId) // This won't work as expected, need a different approach

    // Migrate collections
    await this.supabase
      .from('collections')
      .update({ owner_id: userId })
      .is('owner_id', null)
      .eq('owner_id', anonymousId) // This won't work as expected, need a different approach
  }

  // Utility functions
  private generateShareSlug(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  // Rate limiting (client-side check)
  async checkRateLimit(userId?: string): Promise<{ allowed: boolean; remaining: number }> {
    const limit = userId ? 100 : 5 // Authenticated vs anonymous limits
    const today = new Date().toISOString().split('T')[0]
    
    const { data, error } = await this.supabase
      .from('recipes')
      .select('id')
      .gte('created_at', today)
      .eq('owner_id', userId || null)

    if (error) throw error
    
    const count = data?.length || 0
    return {
      allowed: count < limit,
      remaining: Math.max(0, limit - count)
    }
  }

  // User Notes Methods
  async getUserNotes(userId: string, recipeId: string): Promise<string> {
    // Use server client for API routes, client for browser
    const client = typeof window === 'undefined' ? this.getServerClient() : this.supabase;
    
    const { data, error } = await client
      .from('user_notes')
      .select('notes')
      .eq('user_id', userId)
      .eq('recipe_id', recipeId)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      throw error
    }

    return data?.notes || ''
  }

  async saveUserNotes(userId: string, recipeId: string, notes: string): Promise<void> {
    // Use server client for API routes, client for browser
    const client = typeof window === 'undefined' ? this.getServerClient() : this.supabase;
    
    const { error } = await client
      .from('user_notes')
      .upsert({
        user_id: userId,
        recipe_id: recipeId,
        notes: notes,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,recipe_id'
      })

    if (error) throw error
  }

  async deleteUserNotes(userId: string, recipeId: string): Promise<void> {
    // Use server client for API routes, client for browser
    const client = typeof window === 'undefined' ? this.getServerClient() : this.supabase;
    
    const { error } = await client
      .from('user_notes')
      .delete()
      .eq('user_id', userId)
      .eq('recipe_id', recipeId)

    if (error) throw error
  }
}
