import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const origin = requestUrl.origin
  
  try {
    const code = requestUrl.searchParams.get('code')

    console.log('Auth callback received:', { code: code ? 'present' : 'missing', origin, timestamp: new Date().toISOString() })

    if (code) {
    // Use server client with cookies to complete PKCE flow
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: '', ...options })
          }
        }
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error('Auth error:', error)
      return NextResponse.redirect(`${origin}/?error=auth_failed`)
    }

    console.log('Auth session created successfully:', { userId: data.user?.id })
    
    // Ensure profile exists (use service role for DB write if needed)
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )
    
    // Ensure user profile exists
    if (data.user) {
      try {
        // Check if profile exists
        const { data: existingProfile, error: profileError } = await admin
          .from('profiles')
          .select('user_id')
          .eq('user_id', data.user.id)
          .single()
        
        // If profile doesn't exist, create it
        if (profileError && profileError.code === 'PGRST116') {
          
          // Retry profile creation with exponential backoff
          let retries = 3
          let success = false
          
          while (retries > 0 && !success) {
            const { error: insertError } = await admin
              .from('profiles')
              .insert({
                user_id: data.user.id,
                display_name: data.user.user_metadata?.full_name || 
                             data.user.user_metadata?.display_name || 
                             data.user.email?.split('@')[0] || 'User',
                avatar_url: data.user.user_metadata?.avatar_url
              })
            
            if (insertError) {
              console.error(`Profile creation error (${retries} retries left):`, insertError)
              if (insertError.code === '23503') {
                // Foreign key constraint - user not ready yet, wait and retry
                await new Promise(resolve => setTimeout(resolve, 2000))
                retries--
              } else {
                // Other error, don't retry
                break
              }
            } else {
              success = true
            }
          }
          
          if (!success) {
            console.error('Failed to create profile after retries')
          }
        }
      } catch (profileError) {
        console.error('Profile check error:', profileError)
      }
    }
  }

    // URL to redirect to after sign in process completes
    console.log('Redirecting to:', `${origin}/`)
    return NextResponse.redirect(`${origin}/`)
  } catch (error) {
    console.error('Auth callback error:', error)
    return NextResponse.redirect(`${origin}/?error=callback_failed`)
  }
}
