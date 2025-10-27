'use client';

import { useState, useCallback, useRef } from 'react';

export interface LoadingState {
  isVisible: boolean;
  currentStage: string;
  progress?: number;
  platform?: 'YouTube' | 'TikTok' | 'Instagram' | 'Web';
  estimatedTime: string;
  error?: string;
}

export interface LoadingActions {
  startLoading: (platform: 'YouTube' | 'TikTok' | 'Instagram' | 'Web') => void;
  updateStage: (stage: string, progress?: number) => void;
  setError: (error: string) => void;
  stopLoading: () => void;
  cancelLoading: () => void;
}

const processingStages = [
  'Transcribing video',
  'Detecting ingredients',
  'Structuring steps', 
  'Formatting your recipe card',
  'Plating your result'
];

const platformEstimates = {
  YouTube: '~2 min',
  TikTok: '~2 min',
  Instagram: '~2 min',
  Web: '~30 sec'
};

export function useRecipeLoading(): LoadingState & LoadingActions {
  const [isVisible, setIsVisible] = useState(false);
  const [currentStage, setCurrentStage] = useState('Transcribing video');
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [platform, setPlatform] = useState<'YouTube' | 'TikTok' | 'Instagram' | 'Web'>('YouTube');
  const [estimatedTime, setEstimatedTime] = useState('~1 min');
  const [error, setError] = useState<string | undefined>(undefined);
  
  const stageIndexRef = useRef(0);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startLoading = useCallback((platformType: 'YouTube' | 'TikTok' | 'Instagram' | 'Web') => {
    // Clear any existing interval first
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    
    // Reset all state to initial values
    setIsVisible(true);
    setPlatform(platformType);
    setEstimatedTime(platformEstimates[platformType]);
    setCurrentStage(processingStages[0]); // Always start with first stage
    setProgress(undefined); // Reset to indeterminate progress
    setError(undefined);
    stageIndexRef.current = 0; // Reset stage index

    // Add a delay before starting progress simulation to ensure component resets
    setTimeout(() => {
      // Simulate progress through stages
      const stageInterval = setInterval(() => {
        stageIndexRef.current += 1;
        if (stageIndexRef.current < processingStages.length) {
          setCurrentStage(processingStages[stageIndexRef.current]);
          setProgress(Math.min(20 + (stageIndexRef.current * 20), 90));
        }
      }, 20000); // Change stage every 20 seconds

      progressIntervalRef.current = stageInterval;
    }, 1000); // Longer delay to ensure state reset and user sees the 0% start
  }, []);

  const updateStage = useCallback((stage: string, newProgress?: number) => {
    setCurrentStage(stage);
    if (newProgress !== undefined) {
      setProgress(newProgress);
    }
  }, []);

  const stopLoading = useCallback(() => {
    setIsVisible(false);
    setCurrentStage('Transcribing video');
    setProgress(undefined);
    setError(undefined);
    stageIndexRef.current = 0;
    
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const setLoadingError = useCallback((errorMessage: string) => {
    setError(errorMessage);
    stopLoading();
  }, [stopLoading]);

  const cancelLoading = useCallback(() => {
    stopLoading();
  }, [stopLoading]);

  return {
    isVisible,
    currentStage,
    progress,
    platform,
    estimatedTime,
    error,
    startLoading,
    updateStage,
    setError: setLoadingError,
    stopLoading,
    cancelLoading
  };
}
