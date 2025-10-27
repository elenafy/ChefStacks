"use client";

import { useState, useEffect } from "react";
import { Trash2, Eye, Search, AlertTriangle, CheckCircle, Loader2, Lock, LogOut } from "lucide-react";
import Link from "next/link";
import Brand from "@/components/Brand";

interface Recipe {
  id: string;
  title: string;
  subtitle: string;
  stats: { prep: number; cook: number; serves: number; difficulty: string };
  youtube?: { url: string; author: string; handle: string; id: string };
  web?: { url: string; domain: string; author?: string };
  ingredients: { qty: string; item: string }[];
  steps: { text: string; ts?: string; img?: string }[];
  tips: string[];
  image: string;
  saved?: boolean;
  saveCount?: number;
}

export default function AdminPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Check for existing authentication on component mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Check if we have a valid session by making a request to a protected endpoint
        const response = await fetch('/api/recipes');
        if (response.ok) {
          setIsAuthenticated(true);
        }
      } catch (error) {
        // Session is invalid, user will need to authenticate
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchRecipes();
    }
  }, [isAuthenticated]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok) {
        setIsAuthenticated(true);
        setMessage({ type: 'success', text: 'Authentication successful' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Authentication failed' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Authentication failed' });
    } finally {
      setAuthLoading(false);
    }
  };

  const fetchRecipes = async () => {
    try {
      const response = await fetch("/api/recipes");
      const data = await response.json();
      setRecipes(data);
    } catch (error) {
      console.error("Error fetching recipes:", error);
      setMessage({ type: 'error', text: 'Failed to load recipes' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Call the logout API to clear the server-side session
      await fetch('/api/admin/auth', {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear client-side state regardless of API call result
      setIsAuthenticated(false);
      setPassword('');
      setMessage({ type: 'success', text: 'Logged out successfully' });
    }
  };

  const handleDelete = async (recipeId: string, recipeTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${recipeTitle}"? This action cannot be undone.`)) {
      return;
    }

    setDeletingId(recipeId);
    setMessage(null);

    try {
      const response = await fetch(`/api/recipes/${recipeId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete recipe");
      }

      setMessage({ type: 'success', text: data.message });
      setRecipes(recipes.filter(recipe => recipe.id !== recipeId));
    } catch (error) {
      console.error("Error deleting recipe:", error);
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to delete recipe' 
      });
    } finally {
      setDeletingId(null);
    }
  };

  const filteredRecipes = recipes.filter(recipe =>
    recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    recipe.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Authentication form
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-muted rounded-xl mb-4">
                <Lock className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-text-primary">Admin Access</h1>
              <p className="text-text-secondary mt-2">Enter the admin password to continue</p>
            </div>

            {message && (
              <div className={`mb-4 rounded-xl border px-4 py-3 ${
                message.type === 'success' 
                  ? 'border-green-200 bg-green-50 text-green-800' 
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}>
                <div className="flex items-center gap-2">
                  {message.type === 'success' ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  {message.text}
                </div>
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-text-primary mb-2">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none placeholder:text-text-secondary focus:ring-2 focus:ring-primary/20"
                  placeholder="Enter admin password"
                />
              </div>
              <button
                type="submit"
                disabled={authLoading || !password.trim()}
                className={`w-full rounded-xl px-4 py-3 text-sm font-semibold text-white shadow transition-colors ${
                  authLoading || !password.trim()
                    ? 'bg-primary/60 cursor-not-allowed'
                    : 'bg-primary hover:bg-primary-hover'
                }`}
              >
                {authLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Authenticating...
                  </div>
                ) : (
                  'Access Admin Panel'
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <Link
                href="/"
                className="text-sm text-text-secondary hover:text-text-primary"
              >
                ← Back to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-secondary">
        <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-text-secondary">Loading recipes...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary">
      <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-text-primary">Recipe Administration</h1>
              <p className="text-text-secondary mt-1">Manage and delete recipes from the platform</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-100"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-text-primary shadow-sm hover:bg-secondary"
              >
                ← Back to Home
              </Link>
            </div>
          </div>
          
          {/* Search */}
          <div className="relative max-w-md">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search recipes by title or subtitle..."
              className="w-full rounded-xl border border-border bg-card px-4 py-2 pl-10 text-sm outline-none placeholder:text-text-secondary focus:ring-2 focus:ring-primary/20"
            />
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-6 rounded-xl border px-4 py-3 ${
            message.type === 'success' 
              ? 'border-green-200 bg-green-50 text-green-800' 
              : 'border-red-200 bg-red-50 text-red-800'
          }`}>
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              {message.text}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-2xl font-bold text-text-primary">{recipes.length}</div>
            <div className="text-sm text-text-secondary">Total Recipes</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-2xl font-bold text-text-primary">
              {recipes.filter(r => r.saved).length}
            </div>
            <div className="text-sm text-text-secondary">Saved Recipes</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-2xl font-bold text-text-primary">{filteredRecipes.length}</div>
            <div className="text-sm text-text-secondary">Filtered Results</div>
          </div>
        </div>

        {/* Recipe List */}
        <div className="space-y-4">
          {filteredRecipes.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <div className="text-text-secondary">
                {searchQuery ? 'No recipes match your search.' : 'No recipes found.'}
              </div>
            </div>
          ) : (
            filteredRecipes.map((recipe) => (
              <div
                key={recipe.id}
                className="rounded-xl border border-border bg-card p-6 shadow-sm"
              >
                <div className="flex items-start gap-4">
                  {/* Recipe Image */}
                  <div className="flex-shrink-0">
                    {recipe.image && recipe.image.trim() !== '' ? (
                      <img
                        src={recipe.image}
                        alt={recipe.title}
                        className="h-20 w-20 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-20 w-20 rounded-lg bg-gray-200 flex items-center justify-center">
                        <span className="text-gray-400 text-2xl">🍽️</span>
                      </div>
                    )}
                  </div>

                  {/* Recipe Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-text-primary truncate">
                      {recipe.title}
                    </h3>
                    <p className="text-sm text-text-secondary mt-1">{recipe.subtitle}</p>
                    
                    {(() => {
                      const hasAnyStats = recipe.stats.prep || recipe.stats.cook || recipe.stats.serves || recipe.stats.difficulty;
                      return hasAnyStats ? (
                        <div className="flex items-center gap-4 mt-2 text-xs text-text-secondary">
                          <span>{recipe.stats.prep ? `${recipe.stats.prep}min prep` : "-"}</span>
                          <span>{recipe.stats.cook ? `${recipe.stats.cook}min cook` : "-"}</span>
                          <span>{recipe.stats.serves ? `Serves ${recipe.stats.serves}` : "-"}</span>
                          <span className="capitalize">{recipe.stats.difficulty || "-"}</span>
                          {recipe.saved && (
                            <span className="text-green-600 font-medium">Saved</span>
                          )}
                        </div>
                      ) : recipe.saved ? (
                        <div className="flex items-center gap-4 mt-2 text-xs text-text-secondary">
                          <span className="text-green-600 font-medium">Saved</span>
                        </div>
                      ) : null;
                    })()}

                    {/* Source Info */}
                    <div className="mt-2 text-xs text-text-secondary">
                      {recipe.youtube ? (
                        <span>YouTube: {recipe.youtube.author} ({recipe.youtube.handle})</span>
                      ) : recipe.web ? (
                        <span>Web: {recipe.web.domain} {(() => {
                          const webAuthor = recipe.web.author;
                          const authorString = typeof webAuthor === 'string' ? webAuthor : 
                                              typeof webAuthor === 'object' && webAuthor?.['@id'] ? 'Web Source' : 
                                              webAuthor;
                          return authorString && `by ${authorString}`;
                        })()}</span>
                      ) : (
                        <span>Unknown source</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/recipe/${recipe.id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-secondary"
                    >
                      <Eye className="h-3 w-3" />
                      View
                    </Link>
                    <button
                      onClick={() => handleDelete(recipe.id, recipe.title)}
                      disabled={deletingId === recipe.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deletingId === recipe.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                      {deletingId === recipe.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
