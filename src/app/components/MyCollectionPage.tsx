// src/components/MyCollectionPage.tsx
"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import Brand from "@/components/Brand";
import RecipeTile from "@/components/RecipeTile";
import Navigation from "@/components/Navigation";
import SignupModal from "@/components/SignupModal";
import { useAuth } from "@/lib/auth";
import { Search, UserPlus, Share2, Copy, Check } from "lucide-react";

export default function MyCollectionPage() {
  const [recipes, setRecipes] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const fetchCollection = async () => {
      try {
        // Get the current session token
        const { createClientComponentClient } = await import('@/lib/supabase');
        const supabase = createClientComponentClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        const response = await fetch("/api/collection", {
          headers: {
            ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` })
          }
        });
        
        const data = await response.json();
        if (Array.isArray(data)) {
          setRecipes(data);
        } else {
          console.error("Invalid collection data:", data);
          setRecipes([]);
        }
      } catch (error) {
        console.error("Error fetching collection:", error);
        setRecipes([]);
      }
    };
    
    fetchCollection();
  }, []);

  const filtered = useMemo(() => {
    if (!Array.isArray(recipes)) return [];
    const q = query.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter((r) => r.title.toLowerCase().includes(q));
  }, [query, recipes]);

  const toggleSave = async (id: string) => {
    try {
      // Get the current session token
      const { createClientComponentClient } = await import('@/lib/supabase');
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      await fetch("/api/collection", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` })
        },
        body: JSON.stringify({ recipe_id: id, action: "toggle" }),
      });
      
      // Refresh the collection
      const response = await fetch("/api/collection", {
        headers: {
          ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` })
        }
      });
      const data = await response.json();
      setRecipes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error toggling save:', error);
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/collection`;
    const shareText = `Check out my recipe collection on Chef Stacks! I've saved ${recipes.length} delicious recipes.`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My Recipe Collection',
          text: shareText,
          url: shareUrl,
        });
      } catch (error) {
        // User cancelled sharing or error occurred
      }
    } else {
      // Fallback: show share modal
      setShowShareModal(true);
    }
  };

  const copyToClipboard = async () => {
    const shareUrl = `${window.location.origin}/collection`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6">
        <Navigation />
      </div>

      {/* Page Title */}
      <div className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">My Collection</h1>
            <p className="mt-2 text-sm sm:text-base text-slate-600">
              {recipes.length > 0 
                ? `${recipes.length} saved recipe${recipes.length === 1 ? '' : 's'}`
                : 'Your saved recipes will appear here'
              }
            </p>
          </div>
          {recipes.length > 0 && (
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 rounded-lg sm:rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors self-start sm:self-auto"
            >
              <Share2 className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Share My Collection</span>
              <span className="sm:hidden">Share</span>
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search saved recipes…"
            className="w-72 rounded-xl border border-border bg-white px-8 py-2 text-sm outline-none placeholder:text-text-secondary focus:ring-2 focus:ring-primary/20 max-sm:w-full"
          />
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
        </div>
      </div>

      {/* Anonymous User Banner */}
      {!user && (
        <div className="mb-6 rounded-2xl border border-primary/20 bg-muted p-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <UserPlus className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-text-primary">
                Create an account to keep this collection across devices
              </h3>
              <p className="text-sm text-primary mt-1">
                Your saved recipes are currently stored locally. Sign up to access them from anywhere.
              </p>
            </div>
            <button
              onClick={() => setShowSignupModal(true)}
              className="flex-shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover transition-colors"
            >
              Sign up
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-700">
          No saved recipes yet.{" "}
          <Link
            href="/"
            className="font-semibold text-primary hover:underline"
          >
            Browse the gallery
          </Link>{" "}
          to add some.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4">
          {filtered.map((r) => (
            <RecipeTile key={r.id} recipe={r} />
          ))}
        </div>
      )}

      {/* Signup Modal */}
      <SignupModal
        isOpen={showSignupModal}
        onClose={() => setShowSignupModal(false)}
        title="Create an account to keep this collection forever"
        description="Save your recipes and access them across all your devices."
      />

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Share Your Collection</h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-text-secondary hover:text-slate-600"
              >
                ×
              </button>
            </div>
            
            <p className="text-sm text-slate-600 mb-4">
              Share your collection of {recipes.length} recipes with others!
            </p>
            
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <input
                  type="text"
                  value={`${window.location.origin}/collection`}
                  readOnly
                  className="flex-1 bg-transparent text-sm text-slate-700 outline-none"
                />
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-green-600" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              
              <div className="flex gap-2">
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out my recipe collection on Chef Stacks! I've saved ${recipes.length} delicious recipes.`)}&url=${encodeURIComponent(`${window.location.origin}/collection`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
                >
                  Share on Twitter
                </a>
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${window.location.origin}/collection`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Share on Facebook
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
