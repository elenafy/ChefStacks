// src/app/recipe/[id]/page.tsx
import Link from "next/link";
import { ArrowLeft, Heart } from "lucide-react";
import { getRecipeById } from "@/lib/db";
import { SupabaseDB, convertToLegacyRecipe } from "@/lib/supabase-db";
import Brand from "@/components/Brand";
import RecipeCardClient from "@/components/RecipeCardClient";

// Force dynamic rendering to always fetch fresh data
export const dynamic = 'force-dynamic';

// Check if Supabase is properly configured
const isSupabaseConfigured = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  return url && key && !url.includes('placeholder') && !key.includes('placeholder')
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let recipe;
  
  // Use Supabase if configured, otherwise fall back to file-based system
  if (isSupabaseConfigured()) {
    const db = new SupabaseDB();
    const supabaseRecipe = await db.getRecipe(id);
    recipe = supabaseRecipe ? convertToLegacyRecipe(supabaseRecipe) : null;
  } else {
    recipe = await getRecipeById(id);
  }
  if (!recipe) {
    return (
      <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Recipe Not Found</h1>
          <p className="text-slate-600 mb-6">The recipe with ID "{id}" could not be found.</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary-hover"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </div>
    );
  }
  
  return (
    <div className="mx-auto max-w-7xl px-3 py-2 sm:px-6 sm:py-6">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between print:hidden">
        <Brand />
        <div className="flex items-center gap-3">
          <Link
            href="/collection"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Heart className="h-4 w-4" />
            My Collection
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>
      </div>
      
      <RecipeCardClient recipe={recipe} />
    </div>
  );
}
