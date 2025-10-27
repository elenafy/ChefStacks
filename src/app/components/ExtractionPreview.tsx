"use client";

import { useState } from "react";
import { Loader2, Play, Link as LinkIcon, Clock, ChefHat, CheckCircle, AlertCircle, Eye, EyeOff } from "lucide-react";
import RecipeLoadingUI from "@/components/RecipeLoadingUI";
import { useRecipeLoading } from "@/app/hooks/useRecipeLoading";

interface ExtractedRecipe {
  title: string;
  ingredients: Array<{
    text: string;
    qty?: string;
    unit?: string;
    from: "notes" | "transcript" | "structured" | "parsed";
    ts?: number;
  }>;
  steps: Array<{
    order: number;
    text: string;
    ts?: number;
    from: "notes" | "transcript" | "structured" | "parsed";
    image?: string;
  }>;
  times?: {
    prep_min?: number;
    cook_min?: number;
    total_min?: number;
  };
  servings?: number;
  confidence: {
    ingredients: number;
    steps: number;
    pro_tips?: number;
    times: number;
  };
  debug?: {
    usedNotes?: boolean;
    notesScore?: number;
    cacheHit?: boolean;
    hasStructuredData?: boolean;
    structuredDataType?: string;
    parsedFromHtml?: boolean;
    layer?: string;
    attempts?: string[];
    url?: string;
  };
}

interface ExtractionResult {
  vid?: string;
  url?: string;
  recipe: ExtractedRecipe;
}

export default function ExtractionPreview() {
  const [url, setUrl] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
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

  const handleExtract = async () => {
    if (!url.trim()) return;
    
    setIsExtracting(true);
    setError(null);
    setResult(null);
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

      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
        signal: controller.signal,
      });

      // Safely parse JSON; if not JSON or empty, fall back to text
      const contentType = response.headers.get('content-type') || '';
      const rawBody = contentType.includes('application/json') ? await response.text() : await response.text();
      const data = (() => {
        try {
          return contentType.includes('application/json') && rawBody ? JSON.parse(rawBody) : { error: rawBody };
        } catch {
          return { error: rawBody || 'Unexpected empty response' } as any;
        }
      })();

      if (!response.ok) {
        // Enhanced error handling with specific messages
        let errorMessage = data.error || "Extraction failed";
        
        if (response.status === 400) {
          if (data.error?.includes("Invalid YouTube URL")) {
            errorMessage = "❌ Invalid YouTube URL. Please check the link and try again.";
          } else if (data.error?.includes("URL")) {
            errorMessage = "❌ Invalid URL format. Please enter a valid YouTube or recipe website URL.";
          } else {
            errorMessage = `❌ ${data.error}`;
          }
        } else if (response.status === 429) {
          errorMessage = "⏳ Too many requests. Please wait a moment before trying again.";
        } else if (response.status === 500) {
          // Use specific error message from API if available
          if (data.message) {
            errorMessage = data.message;
          } else if (platform !== 'Web') {
            errorMessage = "⚠️ Failed to process video. The video might be private, unavailable, or not contain recipe information. Please try a different video.";
          } else {
            errorMessage = "⚠️ Failed to extract recipe from website. Please try a different recipe URL.";
          }
        } else if (response.status === 404) {
          errorMessage = "❌ Recipe not found. Please check the URL and try again.";
        }
        
        throw new Error(errorMessage);
      }

      setResult(data);
      setProcessingStage("");
      if (platform !== 'Web') {
        stopLoading();
      }
    } catch (err) {
      // Check if the request was aborted first - don't log this as an error
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Request was cancelled by user');
        setError("❌ Recipe extraction cancelled.");
        if (platform !== 'Web') {
          stopLoading();
        }
        return;
      }
      
      // Only log actual errors, not cancellations
      console.error('Extraction error:', err);
      
      let errorMessage = "Unknown error occurred";
      
      if (err instanceof Error) {
        if (err.message.includes('fetch')) {
          errorMessage = "🌐 Connection error. Please check your internet connection and try again.";
        } else if (err.message.includes('timeout')) {
          errorMessage = "⏱️ Request timed out. The video might be too long or complex. Please try a shorter video.";
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
      setProcessingStage("");
      if (platform !== 'Web') {
        setLoadingError(errorMessage);
      }
    } finally {
      setIsExtracting(false);
      setAbortController(null);
    }
  };

  const handleCancelExtraction = () => {
    if (abortController) {
      try {
        abortController.abort();
      } catch (error) {
        // Silently handle abort errors - this is expected behavior
        console.log('Request cancelled successfully');
      }
    }
    cancelLoading();
    setIsExtracting(false);
    setError("❌ Recipe extraction cancelled.");
  };


  const formatTime = (minutes?: number) => {
    if (!minutes) return "—";
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${minutes}m`;
  };

  const getSourceIcon = (from: string) => {
    switch (from) {
      case "transcript": return <Play className="h-3 w-3" />;
      case "notes": return <LinkIcon className="h-3 w-3" />;
      case "structured": return <CheckCircle className="h-3 w-3" />;
      case "parsed": return <AlertCircle className="h-3 w-3" />;
      default: return null;
    }
  };

  const getSourceColor = (from: string) => {
    switch (from) {
      case "transcript": return "text-blue-600 bg-blue-50";
      case "notes": return "text-green-600 bg-green-50";
      case "structured": return "text-purple-600 bg-purple-50";
      case "parsed": return "text-primary bg-muted";
      default: return "text-gray-600 bg-gray-50";
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return "text-green-600";
    if (score >= 0.6) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Preview Recipe Extraction
        </h2>
        {isExtracting && processingStage && (
          <div className="mb-4 flex items-center justify-center gap-2 rounded-lg bg-muted border border-primary/20 px-4 py-2 text-sm text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{processingStage}</span>
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... or https://foodblog.com/recipe..."
              className="w-full rounded-xl border border-border bg-card px-4 py-3 pr-10 text-sm text-text-primary outline-none placeholder:text-text-secondary focus:ring-2 focus:ring-primary/20"
            />
            <LinkIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
          </div>
          <button
            onClick={handleExtract}
            disabled={isExtracting || !url.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white shadow hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExtracting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Extracting...
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" />
                Preview
              </>
            )}
          </button>
        </div>
        {error && (
          <div className={`mt-3 rounded-xl border px-4 py-3 text-sm ${
            error.includes('❌') || error.includes('⚠️') || error.includes('⏳') || error.includes('🌐') || error.includes('⏱️')
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-primary/20 bg-muted text-primary'
          }`}>
            {error}
          </div>
        )}
      </div>

      {/* Results Section */}
      {result && (
        <div className="space-y-6">
          {/* Recipe Header */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">{result.recipe.title}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-600">
                  {result.recipe.times?.prep_min && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      Prep: {formatTime(result.recipe.times.prep_min)}
                    </div>
                  )}
                  {result.recipe.times?.cook_min && (
                    <div className="flex items-center gap-1">
                      <ChefHat className="h-4 w-4" />
                      Cook: {formatTime(result.recipe.times.cook_min)}
                    </div>
                  )}
                  {result.recipe.servings && (
                    <div className="flex items-center gap-1">
                      <span className="font-medium">Serves {result.recipe.servings}</span>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                {showDebug ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showDebug ? "Hide" : "Show"} Debug
              </button>
            </div>

            {/* Confidence Scores */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-600">Ingredients</div>
                <div className={`text-lg font-bold ${getConfidenceColor(result.recipe.confidence.ingredients)}`}>
                  {Math.round(result.recipe.confidence.ingredients * 100)}%
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-600">Steps</div>
                <div className={`text-lg font-bold ${getConfidenceColor(result.recipe.confidence.steps)}`}>
                  {Math.round(result.recipe.confidence.steps * 100)}%
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-600">Times</div>
                <div className={`text-lg font-bold ${getConfidenceColor(result.recipe.confidence.times)}`}>
                  {Math.round(result.recipe.confidence.times * 100)}%
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-600">Total Items</div>
                <div className="text-lg font-bold text-slate-900">
                  {result.recipe.ingredients.length + result.recipe.steps.length}
                </div>
              </div>
            </div>
          </div>


          {/* Ingredients */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h4 className="mb-4 text-lg font-semibold text-slate-900">
              Ingredients ({result.recipe.ingredients.length})
            </h4>
            <div className="space-y-2">
              {result.recipe.ingredients.map((ingredient, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3"
                >
                  <div className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${getSourceColor(ingredient.from)}`}>
                    {getSourceIcon(ingredient.from)}
                    {ingredient.from}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-slate-900">{ingredient.text}</div>
                    {ingredient.ts && (
                      <div className="mt-1 text-xs text-slate-500">
                        Video timestamp: {Math.floor(ingredient.ts / 60)}:{(ingredient.ts % 60).toString().padStart(2, '0')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Steps */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h4 className="mb-4 text-lg font-semibold text-slate-900">
              Steps ({result.recipe.steps.length})
            </h4>
            <div className="space-y-4">
              {result.recipe.steps.map((step, index) => (
                <div
                  key={index}
                  className="flex gap-4 rounded-lg border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                    {step.order}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start gap-2">
                      <div className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${getSourceColor(step.from)}`}>
                        {getSourceIcon(step.from)}
                        {step.from}
                      </div>
                      {step.ts && (
                        <div className="text-xs text-slate-500">
                          {Math.floor(step.ts / 60)}:{(step.ts % 60).toString().padStart(2, '0')}
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-sm text-slate-900">{step.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Debug Information */}
          {showDebug && result.recipe.debug && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <h4 className="mb-4 text-lg font-semibold text-slate-900">Debug Information</h4>
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {result.recipe.debug.usedNotes !== undefined && (
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="text-xs font-medium text-slate-600">Used Notes</div>
                      <div className="text-sm text-slate-900">{result.recipe.debug.usedNotes ? "Yes" : "No"}</div>
                    </div>
                  )}
                  {result.recipe.debug.hasStructuredData !== undefined && (
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="text-xs font-medium text-slate-600">Structured Data</div>
                      <div className="text-sm text-slate-900">{result.recipe.debug.hasStructuredData ? "Yes" : "No"}</div>
                    </div>
                  )}
                  {result.recipe.debug.structuredDataType && (
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="text-xs font-medium text-slate-600">Data Type</div>
                      <div className="text-sm text-slate-900">{result.recipe.debug.structuredDataType}</div>
                    </div>
                  )}
                  {result.recipe.debug.layer && (
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="text-xs font-medium text-slate-600">Extraction Layer</div>
                      <div className="text-sm text-slate-900">{result.recipe.debug.layer}</div>
                    </div>
                  )}
                </div>
                {result.recipe.debug.attempts && (
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-xs font-medium text-slate-600">Extraction Attempts</div>
                    <div className="text-sm text-slate-900">{result.recipe.debug.attempts.join(" → ")}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading UI - only show for video platforms */}
      {isLoadingVisible && (
        <RecipeLoadingUI
          key={`loading-${url}`} // Force re-render for each new URL
          isVisible={isLoadingVisible}
          onCancel={handleCancelExtraction}
          onBrowseRecipes={() => window.location.href = '/'}
          estimatedTime={estimatedTime}
          currentStage={currentStage}
          progress={progress}
          platform={platform || 'YouTube'}
          error={loadingError}
          onRetry={() => {
            setLoadingError('');
            handleExtract();
          }}
        />
      )}
    </div>
  );
}
