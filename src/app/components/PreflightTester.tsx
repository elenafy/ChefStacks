'use client';

import { useState } from 'react';

interface PreflightResult {
  success: boolean;
  pass: boolean;
  score: number;
  reason: string;
  borderline: boolean;
  allowOverride: boolean;
  checks?: {
    duration: { pass: boolean; value: number; reason: string };
    category: { score: number; categoryId: string };
    caption: { score: number; hasCaption: boolean };
    topic: { score: number; topics: string[] };
    patterns: { score: number; hits: number; patterns: string[] };
    antiSignals: { score: number; signals: string[] };
  };
  transcriptSniff?: {
    attempted: boolean;
    completed: boolean;
    score: number;
    buckets: { quantities: boolean; cookingVerbs: boolean; timesTemps: boolean };
  };
  tinyClassifier?: {
    attempted: boolean;
    isRecipe: boolean;
    confidence: number;
  };
  userMessage?: {
    title: string;
    description: string;
    suggestions: string[];
    canRetry: boolean;
  };
  duration?: number;
}

export default function PreflightTester() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const testPreflight = async () => {
    if (!url.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/preflight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Preflight check failed');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const testExtraction = async () => {
    if (!url.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Extraction failed');
      }

      setResult({
        success: true,
        pass: true,
        score: 100,
        reason: 'Extraction successful',
        borderline: false,
        allowOverride: false,
        duration: 0
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const debugPreflight = async () => {
    if (!url.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/debug-preflight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Debug failed');
      }

      // Show debug info in console and as result
      console.log('🔍 Debug Data:', data);
      
      setResult({
        success: true,
        pass: data.preflightResult.pass,
        score: data.preflightResult.score,
        reason: `Debug: ${data.preflightResult.reason}`,
        borderline: data.preflightResult.borderline,
        allowOverride: data.preflightResult.allowOverride,
        duration: 0
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Preflight Checker Tester</h1>
      
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex gap-4 mb-4">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter YouTube URL..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={testPreflight}
            disabled={loading}
            className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? 'Checking...' : 'Test Preflight'}
          </button>
          <button
            onClick={testExtraction}
            disabled={loading}
            className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50"
          >
            {loading ? 'Extracting...' : 'Test Extraction'}
          </button>
          <button
            onClick={debugPreflight}
            disabled={loading}
            className="px-6 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:opacity-50"
          >
            {loading ? 'Debugging...' : 'Debug Preflight'}
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* User-friendly message for failed checks */}
            {!result.pass && result.userMessage && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-red-800 mb-2">
                  {result.userMessage.title}
                </h3>
                <p className="text-red-700 mb-4">
                  {result.userMessage.description}
                </p>
                {result.userMessage.suggestions.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-medium text-red-800 mb-2">💡 Suggestions:</h4>
                    <ul className="list-disc list-inside space-y-1 text-red-700">
                      {result.userMessage.suggestions.map((suggestion, index) => (
                        <li key={index}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.userMessage.canRetry && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                    <p className="text-yellow-800 text-sm">
                      <strong>Note:</strong> You can still try processing this video, but it may not contain a recipe.
                    </p>
                  </div>
                )}
              </div>
            )}
            
            {/* Technical details */}
            <div className={`p-4 rounded-md ${result.pass ? 'bg-green-100 border border-green-400' : 'bg-red-100 border border-red-400'}`}>
              <h3 className={`text-lg font-semibold ${result.pass ? 'text-green-800' : 'text-red-800'}`}>
                {result.pass ? '✅ PASS' : '❌ FAIL'}
              </h3>
              <p className={result.pass ? 'text-green-700' : 'text-red-700'}>
                {result.reason}
              </p>
              <p className="text-sm text-gray-600">
                Score: {result.score} | Duration: {result.duration}ms
              </p>
            </div>

            {result.checks && (
              <div className="bg-gray-50 p-4 rounded-md">
                <h4 className="font-semibold mb-3">Detailed Checks:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <strong>Duration:</strong> {result.checks.duration.pass ? '✅' : '❌'} 
                    {result.checks.duration.value}s - {result.checks.duration.reason}
                  </div>
                  <div>
                    <strong>Category:</strong> {result.checks.category.score} points 
                    (ID: {result.checks.category.categoryId})
                  </div>
                  <div>
                    <strong>Caption:</strong> {result.checks.caption.hasCaption ? '✅' : '❌'} 
                    ({result.checks.caption.score} points)
                  </div>
                  <div>
                    <strong>Topics:</strong> {result.checks.topic.topics.length} food topics 
                    ({result.checks.topic.score} points)
                  </div>
                  <div>
                    <strong>Patterns:</strong> {result.checks.patterns.hits} hits 
                    ({result.checks.patterns.patterns.join(', ')}) - {result.checks.patterns.score} points
                  </div>
                  <div>
                    <strong>Anti-signals:</strong> {result.checks.antiSignals.signals.length} found 
                    ({result.checks.antiSignals.score} points)
                  </div>
                </div>
              </div>
            )}

            {result.transcriptSniff && (
              <div className="bg-blue-50 p-4 rounded-md">
                <h4 className="font-semibold mb-2">Transcript Analysis:</h4>
                <p className="text-sm">
                  {result.transcriptSniff.completed ? '✅ Completed' : '❌ Failed/Timeout'} 
                  ({result.transcriptSniff.score} points)
                </p>
                {result.transcriptSniff.completed && (
                  <div className="mt-2 text-sm">
                    <div>Quantities: {result.transcriptSniff.buckets.quantities ? '✅' : '❌'}</div>
                    <div>Cooking Verbs: {result.transcriptSniff.buckets.cookingVerbs ? '✅' : '❌'}</div>
                    <div>Times/Temps: {result.transcriptSniff.buckets.timesTemps ? '✅' : '❌'}</div>
                  </div>
                )}
              </div>
            )}

            {result.tinyClassifier && (
              <div className="bg-purple-50 p-4 rounded-md">
                <h4 className="font-semibold mb-2">Tiny Classifier:</h4>
                <p className="text-sm">
                  {result.tinyClassifier.isRecipe ? '✅ Recipe' : '❌ Not Recipe'} 
                  (confidence: {result.tinyClassifier.confidence})
                </p>
              </div>
            )}

            {result.borderline && (
              <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
                <strong>Borderline Case:</strong> This video is on the edge. Consider using the "Try Anyway" option.
              </div>
            )}

          </div>
        )}
      </div>

      <div className="bg-gray-100 p-4 rounded-md">
        <h3 className="font-semibold mb-2">Test URLs:</h3>
        <div className="space-y-2 text-sm">
          <div>
            <strong>Recipe videos:</strong> Search for "how to make" or cooking channels
          </div>
          <div>
            <strong>Non-recipe videos:</strong> Music videos, vlogs, gaming content
          </div>
          <div>
            <strong>Borderline cases:</strong> Food-related but not cooking (mukbang, food reviews)
          </div>
        </div>
      </div>
    </div>
  );
}
