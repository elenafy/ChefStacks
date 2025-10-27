// src/components/LandingPage.tsx
"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { Search, Link as LinkIcon, ChevronDown, Bookmark, Loader2, Settings } from "lucide-react";
import Brand from "@/components/Brand";
import RecipeTile from "@/components/RecipeTile";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import RecipeLoadingUI from "@/components/RecipeLoadingUI";
import { useAuth } from "@/lib/auth";
import { playRecipeNotificationSound } from "@/lib/soundNotification";
import { useRecipeLoading } from "@/app/hooks/useRecipeLoading";

export default function LandingPage() {
  const { user } = useAuth();
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [recipes, setRecipes] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [processingStage, setProcessingStage] = useState("");
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  
  // Loading UI state
  const {
    isVisible: isLoadingVisible,
    currentStage,
    progress,
    platform,
    estimatedTime,
    error: loadingError,
    startLoading,
    updateStage,
    setError: setLoadingError,
    stopLoading,
    cancelLoading
  } = useRecipeLoading();

  useEffect(() => {
    fetch("/api/recipes")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setRecipes(data);
        } else {
          console.error("Invalid recipes data:", data);
          setRecipes([]);
        }
      })
      .catch((error) => {
        console.error("Error fetching recipes:", error);
        setRecipes([]);
      });
  }, []);

  const savedCount = useMemo(
    () => (Array.isArray(recipes) ? recipes.filter((r) => r.saved).length : 0),
    [recipes]
  );

  const filtered = useMemo(() => {
    if (!Array.isArray(recipes)) return [];
    const q = query.trim().toLowerCase();
    const d = difficultyFilter.toLowerCase();
    
    const filteredRecipes = recipes.filter((r) => {
      const matchesQuery = !q || r.title.toLowerCase().includes(q);
      const matchesDifficulty = !d || (r.stats?.difficulty?.toLowerCase() || r.difficulty?.toLowerCase() || "").includes(d);
      return matchesQuery && matchesDifficulty;
    });
    
    // Sort to show user's recipes first, then by creation date (newest first)
    return filteredRecipes.sort((a, b) => {
      // Check if recipes belong to current user
      const aIsUserRecipe = user && a.owner_id === user.id;
      const bIsUserRecipe = user && b.owner_id === user.id;
      
      if (aIsUserRecipe && !bIsUserRecipe) return -1;
      if (!aIsUserRecipe && bIsUserRecipe) return 1;
      
      // If both or neither are user recipes, sort by creation date
      const aDate = new Date(a.created_at || 0).getTime();
      const bDate = new Date(b.created_at || 0).getTime();
      return bDate - aDate;
    });
  }, [query, difficultyFilter, recipes, user]);

  const handleGenerate = async () => {
    if (!url.trim() || isGenerating) return;
    
    setIsGenerating(true);
    setMessage("");
    setProcessingStage("");
    
    // Create abort controller for cancellation
    const controller = new AbortController();
    setAbortController(controller);
    
    // Determine platform and start loading UI only for video platforms
    let platform: 'YouTube' | 'TikTok' | 'Instagram' | 'Web' = 'Web';
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      platform = 'YouTube';
      startLoading(platform);
    } else if (url.includes('tiktok.com')) {
      platform = 'TikTok';
      startLoading(platform);
    } else if (url.includes('instagram.com')) {
      platform = 'Instagram';
      startLoading(platform);
    }
    // Skip loading UI for web URLs - they're fast enough
    
    try {
      // Get the current session token
      const { createClientComponentClient } = await import('@/lib/supabase');
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch("/api/ingest", {
        method: "POST",
        body: JSON.stringify({ url }),
        headers: { 
          "Content-Type": "application/json",
          ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` })
        },
        signal: controller.signal,
        // Increase timeout for video processing (5 minutes)
        keepalive: false,
      });
      const data = await res.json();
      
      if (!res.ok) {
        // Enhanced error handling with specific messages
        let errorMessage = "Something went wrong. Please try again.";
        
        if (res.status === 400) {
          if (data.error?.includes("Invalid YouTube URL")) {
            errorMessage = "❌ Invalid YouTube URL. Please check the link and try again.";
          } else if (data.error?.includes("URL")) {
            errorMessage = "❌ Invalid URL format. Please enter a valid YouTube or recipe website URL.";
          } else {
            errorMessage = `❌ ${data.error}`;
          }
        } else if (res.status === 429) {
          errorMessage = "⏳ Too many requests. Please wait a moment before trying again.";
        } else if (res.status === 500) {
          // Use specific error message from API if available
          if (data.message) {
            errorMessage = data.message;
          } else if (platform !== 'Web') {
            errorMessage = "⚠️ Failed to process video. The video might be private, unavailable, or not contain recipe information. Please try a different video.";
          } else {
            errorMessage = "⚠️ Failed to extract recipe from website. Please try a different recipe URL.";
          }
        } else if (res.status === 404) {
          errorMessage = "❌ Recipe not found. Please check the URL and try again.";
        }
        
        setMessage(errorMessage);
        if (platform !== 'Web') {
          setLoadingError(errorMessage);
        }
        return;
      }
      
      if (data.existing) {
        const recipeTitle = data.title || data.recipe?.title || 'this recipe';
        setMessage(`✅ Good news! We already have "${recipeTitle}" in our community. Redirecting...`);
        if (platform !== 'Web') {
          stopLoading();
        }
        // Navigate to the existing recipe page after a short delay so user can see the message
        setTimeout(() => {
          window.location.href = `/recipe/${data.id}`;
        }, 1500);
      } else {
        // Show success message and refresh the recipes list
        const recipeTitle = data.title || data.recipe?.title || 'your recipe';
        setMessage(`✅ Great! We've added "${recipeTitle}" to our community. Check it out below!`);
        if (platform !== 'Web') {
          stopLoading();
        }
        
        // Play notification sound
        playRecipeNotificationSound();
        
        fetch("/api/recipes").then((r) => r.json()).then((newRecipes) => {
          setRecipes(newRecipes);
          // Scroll to the top of the community section to show the new recipe
          setTimeout(() => {
            const communitySection = document.querySelector('[data-community-section]');
            if (communitySection) {
              communitySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 100);
        });
        setUrl("");
        
        // Clear the message after 5 seconds
        setTimeout(() => {
          setMessage("");
        }, 5000);
      }
    } catch (error) {
      // Check if the request was aborted first - don't log this as an error
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request was cancelled by user');
        setMessage("❌ Recipe generation cancelled.");
        if (platform !== 'Web') {
          stopLoading();
        }
        return;
      }
      
      // Only log actual errors, not cancellations
      console.error('Recipe generation error:', error);
      
      let errorMessage = "Something went wrong. Please try again.";
      
      // Network or connection errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        errorMessage = "🌐 Connection error. Please check your internet connection and try again.";
      } else if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          errorMessage = "⏱️ Request timed out. The video might be too long or complex. Please try a shorter video.";
        } else {
          errorMessage = `❌ ${error.message}`;
        }
      }
      
      setMessage(errorMessage);
      if (platform !== 'Web') {
        setLoadingError(errorMessage);
      }
    } finally {
      setIsGenerating(false);
      setAbortController(null);
    }
  };


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
      
      // Refresh the recipes list
      fetch("/api/recipes").then((r) => r.json()).then(setRecipes);
    } catch (error) {
      console.error('Error toggling save:', error);
    }
  };

  const handleBrowseRecipes = () => {
    const communitySection = document.querySelector('[data-community-section]');
    if (communitySection) {
      communitySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleCancelGeneration = () => {
    if (abortController) {
      try {
        abortController.abort();
      } catch (error) {
        // Silently handle abort errors - this is expected behavior
        console.log('Request cancelled successfully');
      }
    }
    cancelLoading();
    setIsGenerating(false);
    setMessage("❌ Recipe generation cancelled.");
  };

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6">
      {/* Header */}
      <div className="mb-4">
        <Navigation />
      </div>

      {/* Kitchen Library Visual */}
      <div className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br" style={{background: 'linear-gradient(to bottom right, #FFF8F6, #FFEDEA)'}}>
        <div className="px-4 py-4 sm:px-6 sm:py-6">
          <div className="mx-auto max-w-6xl">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
              {/* Left Side - Text */}
              <div className="flex flex-col justify-center text-center lg:text-left">
                <h2 className="mb-3 text-xl font-bold text-slate-700 sm:text-2xl md:text-3xl lg:text-4xl">
                  All your recipes, <span className="text-red-500">saved</span> and <span className="text-green-500">simplified</span> in one place.
                </h2>
                <p className="text-sm text-black sm:text-base md:text-lg">
                  From blogs to videos, turn scattered recipes into organized collections you can cook from—and share like playlists.
                </p>
              </div>
              
              {/* Right Side - Laptop Mockup */}
              <div className="relative flex justify-center px-4 sm:px-0">
                {/* Laptop/Tablet Mockup */}
                <div className="relative">
                  {/* Laptop Screen */}
                  <div className="h-40 w-52 rounded-lg border-4 border-slate-300 bg-white shadow-2xl sm:h-48 sm:w-64 md:h-56 md:w-80">
                    {/* Recipe Card UI Mockup */}
                    <div className="h-full w-full rounded-lg bg-white p-3 sm:p-4">
                      <div className="mb-2 h-1.5 w-3/4 rounded bg-slate-200 sm:mb-3 sm:h-2"></div>
                      <div className="mb-1.5 h-1 w-1/2 rounded bg-slate-100 sm:mb-2"></div>
                      <div className="mb-3 h-1 w-2/3 rounded bg-slate-100 sm:mb-4"></div>
                      
                      <div className="mb-2 flex gap-1.5 sm:mb-3 sm:gap-2">
                        <div className="h-6 w-6 rounded-full bg-secondary-accent/40 sm:h-8 sm:w-8"></div>
                        <div className="h-6 w-6 rounded-full bg-secondary-accent/40 sm:h-8 sm:w-8"></div>
                        <div className="h-6 w-6 rounded-full bg-secondary-accent/40 sm:h-8 sm:w-8"></div>
                      </div>
                      
                      <div className="space-y-1.5 sm:space-y-2">
                        <div className="h-1 w-full rounded bg-slate-100"></div>
                        <div className="h-1 w-4/5 rounded bg-slate-100"></div>
                        <div className="h-1 w-3/4 rounded bg-slate-100"></div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Floating Thumbnails */}
                  {/* Blog Post Thumbnail */}
                  <div className="absolute -left-2 -top-2 animate-float-slow rounded-lg border-2 border-white bg-white p-1.5 shadow-2xl sm:-left-4 sm:-top-4 sm:p-2 md:-left-8 md:-top-8 md:rounded-xl md:p-3">
                    <div className="relative h-16 w-20 rounded-md overflow-hidden sm:h-28 sm:w-36 sm:rounded-lg">
                      <img 
                        src="/images/recipes/crispy-garlic-butter-chicken/chorizo-mozarella-gnocchi-bake-cropped-9ab73a3.webp"
                        alt="Food blog recipe"
                        className="h-full w-full object-cover"
                      />
                      {/* TikTok Logo Overlay */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <svg className="h-4 w-4 text-white drop-shadow-lg sm:h-7 sm:w-7" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                  
                  {/* YouTube Video Thumbnail */}
                  <div className="absolute -right-2 -top-3 animate-float-medium rounded-lg border-2 border-white bg-white p-1.5 shadow-2xl sm:-right-4 sm:-top-6 sm:p-2 md:-right-8 md:-top-12 md:rounded-xl md:p-3">
                    <div className="relative h-16 w-20 rounded-md overflow-hidden sm:h-28 sm:w-36 sm:rounded-lg">
                      <img 
                        src="https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80"
                        alt="YouTube cooking video"
                        className="h-full w-full object-cover"
                      />
                      {/* YouTube Logo Overlay */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <svg className="h-4 w-5 sm:h-8 sm:w-10 drop-shadow-lg" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" fill="red"/>
                          <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="white"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                  
                  {/* TikTok-style Short Thumbnail */}
                  <div className="absolute -bottom-2 -left-3 animate-float-fast rounded-lg border-2 border-white bg-white p-1.5 shadow-2xl sm:-bottom-4 sm:-left-6 sm:p-2 md:-bottom-8 md:-left-12 md:rounded-xl md:p-3">
                    <div className="relative h-16 w-16 rounded-md overflow-hidden sm:h-28 sm:w-28 sm:rounded-lg">
                      <img 
                        src="https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80"
                        alt="TikTok cooking short"
                        className="h-full w-full object-cover"
                      />
                      {/* Instagram Logo Overlay */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <img src="/images/logos/instagram.svg" alt="Instagram" className="h-4 w-4 sm:h-7 sm:w-7 drop-shadow-lg" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* URL Input */}
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-3 text-base font-semibold text-slate-900 text-center">
          Paste a recipe URL ( 
          <span className="inline-flex items-baseline gap-1.5">
            <img src="/images/logos/youtube.svg" alt="YouTube" className="w-5 h-5 relative top-0.5" />
            YouTube
          </span>
          , 
          <span className="inline-flex items-baseline gap-1.5">
            <img src="/images/logos/tiktok.svg" alt="TikTok" className="w-5 h-5 relative top-0.5" />
            TikTok
          </span>
          , 
          <span className="inline-flex items-baseline gap-1.5">
            <img src="/images/logos/instagram.svg" alt="Instagram" className="w-5 h-5 relative top-0.5" />
            Instagram
          </span>
          {" "}or any food blog)
        </div>
        {isGenerating && (
          <div className="mb-4 text-center text-sm text-primary">
            {processingStage && (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{processingStage}</span>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative grow">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isGenerating && url.trim()) {
                  handleGenerate();
                }
              }}
              placeholder="https://www.youtube.com/watch?v=... or https://foodblog.com/recipe..."
              className="w-full rounded-xl border border-border bg-card px-3 py-2 pr-10 text-sm text-text-primary outline-none placeholder:text-text-secondary focus:ring-2 focus:ring-primary/20"
            />
            <LinkIcon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-50" />
          </div>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !url.trim()}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow transition-colors ${
              isGenerating
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {isGenerating ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </div>
            ) : (
              'Make Recipe Card'
            )}
          </button>
        </div>
        {message && (
          <div className={`mt-2 rounded-xl border px-3 py-2 text-sm ${
            message.includes('✅') || message.includes('Found existing')
              ? 'border-green-200 bg-green-50 text-green-800' 
              : message.includes('❌') || message.includes('⚠️') || message.includes('⏳') || message.includes('🌐') || message.includes('⏱️')
              ? 'border-red-200 bg-red-50 text-red-800'
              : message.includes('🔄')
              ? 'border-primary/20 bg-muted text-primary'
              : 'border-slate-200 bg-slate-50 text-slate-800'
          }`}>
            {message}
          </div>
        )}


      </div>


      {/* Gallery header */}
      <div className="mt-6 mb-3 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center" data-community-section>
        <div className="text-lg font-extrabold text-slate-900">
          Community recipe cards
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          {/* Difficulty Filter */}
          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value)}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">All difficulties</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
          
          {/* Search */}
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search recipes by name…"
              className="w-72 rounded-xl border border-border bg-card px-8 py-2 text-sm outline-none placeholder:text-text-secondary focus:ring-2 focus:ring-primary/20 max-sm:w-full"
            />
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
          </div>
        </div>
      </div>

      {/* Gallery */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4">
        {filtered.length > 0 ? (
          filtered.map((r) => (
            <RecipeTile key={r.id} recipe={r} />
          ))
        ) : (
          <div className="col-span-full text-center py-12">
            <div className="text-slate-500 text-lg mb-2">No recipes found</div>
            <div className="text-slate-400 text-sm">
              {recipes.length === 0 
                ? "Loading recipes..." 
                : "Try adjusting your search or difficulty filter"
              }
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <Footer />

      {/* Loading UI - only show for video platforms */}
      {isLoadingVisible && (
        <RecipeLoadingUI
          key={`loading-${url}`} // Force re-render for each new URL
          isVisible={isLoadingVisible}
          onCancel={handleCancelGeneration}
          onBrowseRecipes={handleBrowseRecipes}
          estimatedTime={estimatedTime}
          currentStage={currentStage}
          progress={progress}
          platform={platform || 'YouTube'}
          error={loadingError}
          onRetry={() => {
            setLoadingError('');
            handleGenerate();
          }}
        />
      )}
    </div>
  );
}
