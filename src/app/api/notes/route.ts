// src/app/api/notes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getNotes, setNotes } from "@/lib/db";
import { SupabaseDB } from "@/lib/supabase-db";
import { createClient } from '@supabase/supabase-js';

// Check if Supabase is properly configured
const isSupabaseConfigured = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key && !url.includes('placeholder') && !key.includes('placeholder');
};

export async function GET(req: NextRequest) {
  const recipe_id = new URL(req.url).searchParams.get("recipe_id");
  if (!recipe_id) return NextResponse.json({ body: "" });

  // Use Supabase if configured and user is authenticated
  if (isSupabaseConfigured()) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
      );
      
      // Get user from auth header if available
      const authHeader = req.headers.get('authorization');
      let user = null;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const { data: { user: userData } } = await supabase.auth.getUser(token);
        user = userData;
      }
      
      if (user) {
        const db = new SupabaseDB();
        const notes = await db.getUserNotes(user.id, recipe_id);
        return NextResponse.json({ body: notes });
      }
    } catch (error) {
      console.error('Error fetching user notes:', error);
    }
  }

  // Fallback to legacy system for anonymous users or if Supabase fails
  const body = await getNotes(String(recipe_id));
  return NextResponse.json({ body });
}

export async function POST(req: NextRequest) {
  const { recipe_id, body } = await req.json();
  
  // Use Supabase if configured and user is authenticated
  if (isSupabaseConfigured()) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
      );
      
      // Get user from auth header if available
      const authHeader = req.headers.get('authorization');
      let user = null;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const { data: { user: userData } } = await supabase.auth.getUser(token);
        user = userData;
      }
      
      if (user) {
        const db = new SupabaseDB();
        await db.saveUserNotes(user.id, recipe_id, String(body || ""));
        return NextResponse.json({ ok: true });
      }
    } catch (error) {
      console.error('Error saving user notes:', error);
    }
  }

  // Fallback to legacy system for anonymous users or if Supabase fails
  await setNotes(String(recipe_id), String(body || ""));
  return NextResponse.json({ ok: true });
}
