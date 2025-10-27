'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getRandomKnowledgeCard, KnowledgeCard } from '@/lib/cookingFacts';

interface RecipeLoadingUIProps {
  isVisible: boolean;
  onCancel: () => void;
  onBrowseRecipes: () => void;
  estimatedTime?: string;
  currentStage?: string;
  progress?: number; // 0-100, optional for determinate progress
  platform?: 'YouTube' | 'TikTok' | 'Instagram' | 'Web';
  className?: string;
  error?: string;
  onRetry?: () => void;
}

export default function RecipeLoadingUI({
  isVisible,
  onCancel,
  onBrowseRecipes,
  estimatedTime = '~1 min',
  currentStage = 'Transcribing video',
  progress,
  platform = 'YouTube',
  className = '',
  error,
  onRetry
}: RecipeLoadingUIProps) {
  const [currentCard, setCurrentCard] = useState<KnowledgeCard | null>(null);
  const [displayProgress, setDisplayProgress] = useState<number | undefined>(undefined);

  // Reset progress when component becomes visible
  useEffect(() => {
    if (isVisible) {
      setDisplayProgress(undefined);
    }
  }, [isVisible]);

  // Update progress when it changes
  useEffect(() => {
    setDisplayProgress(progress);
  }, [progress]);

  // Initialize with first card and rotate knowledge cards every 11 seconds
  useEffect(() => {
    if (!isVisible) return;

    // Set initial card
    setCurrentCard(getRandomKnowledgeCard());

    const interval = setInterval(() => {
      setCurrentCard(getRandomKnowledgeCard());
    }, 11000);

    return () => clearInterval(interval);
  }, [isVisible]);

  // Keyboard navigation
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, onCancel]);

  if (!isVisible) return null;

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/5 ${className}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="loading-title"
      aria-describedby="loading-description"
    >
      <div 
        className="w-full max-w-sm bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-red-100 animate-in zoom-in-95 duration-200"
        style={{
          boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(240, 230, 228, 0.6)'
        }}
      >
        {/* Top Row */}
        <div className="flex items-center justify-between p-4 pb-3">
          <h2 id="loading-title" className="text-base font-medium text-slate-900">
            Cooking your recipe…
          </h2>
          <div className="text-sm text-slate-500">{estimatedTime}</div>
        </div>

        {/* Progress Bar */}
        <div className="px-4 pb-3">
          <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
            {displayProgress !== undefined ? (
              // Determinate progress bar
              <div 
                className="h-full bg-red-600 rounded-full transition-all duration-500 ease-out"
                style={{ 
                  width: `${displayProgress}%`,
                  background: '#D32323'
                }}
              />
            ) : (
              // Indeterminate progress bar with shimmer
              <div 
                className="h-full bg-red-600 rounded-full relative"
                style={{ 
                  width: '30%',
                  background: 'linear-gradient(90deg, #D32323 0%, #EF4444 50%, #D32323 100%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 2s ease-in-out infinite'
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
              </div>
            )}
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="px-4 pb-3">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <div className="w-4 h-4 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-red-600 text-xs">!</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-red-800 font-medium mb-1">Something went wrong</p>
                  <p className="text-sm text-red-700">{error}</p>
                  {onRetry && (
                    <button
                      onClick={onRetry}
                      className="mt-2 text-sm text-red-600 hover:text-red-700 font-medium underline"
                    >
                      Try again
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Chef Tip Row - only show if no error */}
        {!error && currentCard && (
          <div className="px-4 pb-3">
            <div className="bg-red-50/50 border-t border-b border-red-100 py-3">
              <div className="flex items-start gap-2">
                <span className="text-sm">{currentCard.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                      {currentCard.badge}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {currentCard.fact}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Row */}
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between">
            <button
              onClick={onCancel}
              className="text-sm text-slate-600 hover:text-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onBrowseRecipes}
              className="text-sm text-red-600 hover:text-red-700 font-medium transition-colors"
            >
              Keep browsing
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
}