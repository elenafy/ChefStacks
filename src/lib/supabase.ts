import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'placeholder_key'

// Single client instance to avoid GoTrueClient warnings
let supabaseClient: ReturnType<typeof createBrowserClient> | null = null

export function createClientComponentClient() {
  if (!supabaseClient) {
    try {
      supabaseClient = createBrowserClient(supabaseUrl, supabasePublishableKey)
    } catch (error) {
      console.warn('Failed to create Supabase client:', error)
      // Return a mock client for development
      return {
        auth: {
          getSession: () => Promise.resolve({ data: { session: null }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          signInWithOAuth: () => Promise.resolve({ data: null, error: null }),
          signInWithOtp: () => Promise.resolve({ data: null, error: null }),
          signUp: () => Promise.resolve({ data: null, error: null }),
          signOut: () => Promise.resolve({ error: null })
        }
      } as any
    }
  }
  return supabaseClient
}

// For backward compatibility
export const supabase = createClientComponentClient()

// Database types
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string
          display_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          display_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          display_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      recipes: {
        Row: {
          id: string
          owner_id: string | null // null for anonymous users
          title: string
          source_url: string | null
          parent_id: string | null // base recipe id if this is a user version
          is_base: boolean // true for canonical base recipe per URL
          content_json: any
          images: string[]
          is_public: boolean
          summarized_instructions: string | null
          saves_count: number | null // derived/popularity cache
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id?: string | null
          title: string
          source_url?: string | null
          parent_id?: string | null
          is_base?: boolean
          content_json: any
          images?: string[]
          is_public?: boolean
          summarized_instructions?: string | null
          saves_count?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string | null
          title?: string
          source_url?: string | null
          parent_id?: string | null
          is_base?: boolean
          content_json?: any
          images?: string[]
          is_public?: boolean
          summarized_instructions?: string | null
          saves_count?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      collections: {
        Row: {
          id: string
          owner_id: string | null
          name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id?: string | null
          name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string | null
          name?: string
          created_at?: string
          updated_at?: string
        }
      }
      collection_items: {
        Row: {
          collection_id: string
          recipe_id: string
          position: number
          created_at: string
        }
        Insert: {
          collection_id: string
          recipe_id: string
          position: number
          created_at?: string
        }
        Update: {
          collection_id?: string
          recipe_id?: string
          position?: number
          created_at?: string
        }
      }
      recipe_shares: {
        Row: {
          id: string
          recipe_id: string
          share_slug: string
          visibility: 'unlisted' | 'public'
          created_at: string
        }
        Insert: {
          id?: string
          recipe_id: string
          share_slug: string
          visibility?: 'unlisted' | 'public'
          created_at?: string
        }
        Update: {
          id?: string
          recipe_id?: string
          share_slug?: string
          visibility?: 'unlisted' | 'public'
          created_at?: string
        }
      }
      likes: {
        Row: {
          id: string
          recipe_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          recipe_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          recipe_id?: string
          user_id?: string
          created_at?: string
        }
      }
      user_notes: {
        Row: {
          id: string
          user_id: string
          recipe_id: string
          notes: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          recipe_id: string
          notes: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          recipe_id?: string
          notes?: string
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
