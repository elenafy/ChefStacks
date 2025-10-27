// src/components/RecipeCardClient.tsx
"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  Share2,
  Printer,
  MoreHorizontal,
  Bookmark,
  BookmarkCheck,
  Clock3,
  Flame,
  Users,
  Sparkles,
  Image as ImageIcon,
  Link as LinkIcon,
  Play,
  PlayCircle,
  Check,
  ChefHat,
  Youtube,
  CheckCircle,
  AlertCircle,
  FileText,
  List,
  Save,
  Edit3,
  X,
  FileType,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import SignupModal from "./SignupModal";
import PrintOptionsModal from "./PrintOptionsModal";
import ReportIssueModal from "./ReportIssueModal";

/**
 * Notes:
 * - Complete step text (shows full instructions, not just first sentence).
 * - Images toggle (pic icon).
 * - If images are hidden, the Play button appears inline with the step text.
 * - Share/Print icons in top-right.
 * - User notes included in Print/PDF and can be saved.
 * - Kitchen Mode keeps 2 columns on mobile landscape (ingredients on right).
 */

export default function RecipeCardClient({ recipe }: { recipe: any }) {
  const { user } = useAuth();
  const mobileDetailsRef = useRef<HTMLDetailsElement>(null);
  const desktopDetailsRef = useRef<HTMLDetailsElement>(null);
  const [showImages, setShowImages] = useState(true);
  const [saved, setSaved] = useState(!!recipe?.saved);
  const [notes, setNotes] = useState("");
  const [originalNotes, setOriginalNotes] = useState("");
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stackMode, setStackMode] = useState(false);
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printShowImages, setPrintShowImages] = useState(true);
  const [previewShowImages, setPreviewShowImages] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    ingredients: [] as any[],
    steps: [] as any[],
    tips: [] as string[],
  });
  const wakeLockRef = useRef<any>(null);

  const handleReportIssue = () => {
    // Close both details dropdowns (mobile and desktop)
    if (mobileDetailsRef.current) {
      mobileDetailsRef.current.removeAttribute('open');
    }
    if (desktopDetailsRef.current) {
      desktopDetailsRef.current.removeAttribute('open');
    }
    // Open the modal after a brief delay
    setTimeout(() => {
      setShowReportModal(true);
    }, 50);
  };
  const hasTips = Array.isArray(recipe?.tips) && recipe.tips.length > 0;
  const hasIngredients = Array.isArray(recipe?.ingredients) && recipe.ingredients.length > 0;
  
  // Check if this is a YouTube Shorts video
  const isYouTubeShorts = recipe?.youtube?.url && (
    recipe.youtube.url.includes('/shorts/') || 
    recipe.youtube.url.includes('youtube.com/shorts/') || 
    recipe.youtube.url.includes('youtu.be/shorts/') ||
    (recipe.youtube.url.includes('youtube.com/') && recipe.youtube.url.includes('shorts'))
  );
  const hasStepImages = Array.isArray(recipe?.steps) && recipe.steps.some((step: any) => step.img || step.screenshot || step.image || step.screenshotPath);
  const hasMainImage = !!recipe?.image;
  const hasAnyImages = hasStepImages || hasMainImage;

  // Load existing notes and check if recipe is saved
  useEffect(() => {
    const loadNotesAndCheckSaved = async () => {
      try {
        const { createClientComponentClient } = await import('@/lib/supabase');
        const supabase = createClientComponentClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        // Load user-specific notes
        const notesResponse = await fetch(`/api/notes?recipe_id=${recipe.id}`, {
          headers: {
            ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` })
          }
        });
        const notesData = await notesResponse.json();
        const loadedNotes = notesData.body || "";
        setNotes(loadedNotes);
        setOriginalNotes(loadedNotes);
        
        // Check if recipe is in user's collection
        if (user && session) {
          const response = await fetch("/api/collection", {
            headers: {
              ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` })
            }
          });
          
          if (response.ok) {
            const collectionRecipes = await response.json();
            const isInCollection = Array.isArray(collectionRecipes) && 
              collectionRecipes.some((r: any) => r.id === recipe.id);
            setSaved(isInCollection);
          }
        }
      } catch (error) {
        console.error('Error loading notes or checking saved status:', error);
        // Fallback to loading notes without auth
        try {
          const notesResponse = await fetch(`/api/notes?recipe_id=${recipe.id}`);
          const notesData = await notesResponse.json();
          const loadedNotes = notesData.body || "";
          setNotes(loadedNotes);
          setOriginalNotes(loadedNotes);
        } catch (fallbackError) {
          console.error('Error loading notes (fallback):', fallbackError);
        }
      }
    };
    
    loadNotesAndCheckSaved();
  }, [recipe.id, user]);

  // Kitchen Mode – keep screen awake where supported
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // @ts-ignore
        if (stackMode && navigator.wakeLock?.request) {
          // @ts-ignore
          const lock = await navigator.wakeLock.request("screen");
          if (!active) return;
          wakeLockRef.current = lock;
        } else {
          await wakeLockRef.current?.release?.();
          wakeLockRef.current = null;
        }
      } catch {}
    })();
    return () => {
      active = false;
      try {
        wakeLockRef.current?.release?.();
      } catch {}
      wakeLockRef.current = null;
    };
  }, [stackMode]);


  const handleShare = async () => {
    try {
      // Prefer native share if available
      // @ts-ignore
      if (navigator.share) {
        // @ts-ignore
        await navigator.share({ title: recipe.title, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }
    } catch {}
  };

  const handlePrint = () => {
    setPrintShowImages(showImages);
    setPreviewShowImages(showImages);
    setShowPrintModal(true);
  };

  const handlePrintWithOptions = (options: { includeImages: boolean }) => {
    setPrintShowImages(options.includeImages);
    // Add a small delay to ensure state is updated before printing
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const handlePreviewOptions = (options: { includeImages: boolean }) => {
    setPrintShowImages(options.includeImages);
    setPreviewShowImages(options.includeImages);
  };

  const toggleSave = async () => {
    if (!user) {
      setShowSignupModal(true);
      return;
    }
    
    setIsSaving(true);
    try {
      // Get the current session token
      const { createClientComponentClient } = await import('@/lib/supabase');
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch("/api/collection", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` })
        },
        body: JSON.stringify({ recipe_id: recipe.id, action: "toggle" }),
      });
      
      if (response.ok) {
        setSaved((s) => !s);
      } else {
        const errorData = await response.json();
        console.error('Save failed:', errorData);
      }
    } catch (error) {
      console.error('Error saving recipe:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const saveNotes = async () => {
    setIsSavingNotes(true);
    setNotesSaved(false);
    
    try {
      const { createClientComponentClient } = await import('@/lib/supabase');
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` })
        },
        body: JSON.stringify({ recipe_id: recipe.id, body: notes }),
      });
      
      if (response.ok) {
        setOriginalNotes(notes);
        setHasUnsavedChanges(false);
        setIsEditingNotes(false);
        setNotesSaved(true);
        // Hide success message after 2 seconds
        setTimeout(() => setNotesSaved(false), 2000);
      }
    } catch (error) {
      console.error('Error saving notes:', error);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const startEditingNotes = () => {
    if (!user) {
      setShowSignupModal(true);
      return;
    }
    setIsEditingNotes(true);
    setHasUnsavedChanges(false);
  };

  const cancelEditingNotes = () => {
    setNotes(originalNotes);
    setHasUnsavedChanges(false);
    setIsEditingNotes(false);
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNotes(e.target.value);
    setHasUnsavedChanges(e.target.value !== originalNotes);
  };


  const handleEditClick = () => {
    if (!user) {
      setShowSignupModal(true);
      return;
    }
    
    // Initialize edit form with current recipe data
    setEditForm({
      title: recipe.title || '',
      ingredients: (recipe.ingredients || []).map((ing: any) => ({
        item: ing.item || `${ing.qty || ''} ${ing.item || ''}`.trim()
      })),
      steps: recipe.steps || [],
      tips: recipe.tips || [],
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!user) return;
    
    setIsEditing(true);
    try {
      const { createClientComponentClient } = await import('@/lib/supabase');
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`/api/recipes/${recipe.id}`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` })
        },
        body: JSON.stringify({
          title: editForm.title,
          content_json: {
            ...recipe,
            title: editForm.title,
            ingredients: editForm.ingredients.map((ing: any) => ({
              qty: '', // Keep empty since we're using combined format
              item: ing.item
            })),
            steps: editForm.steps,
            tips: editForm.tips,
          },
          is_public: true,
        }),
      });
      
      if (response.ok) {
        const newVersion = await response.json();
        setShowEditModal(false);
        // Optionally redirect to the new version or show success message
        window.location.href = `/recipe/${newVersion.id}`;
      } else {
        const errorData = await response.json();
        console.error('Edit failed:', errorData);
        alert('Failed to save your version. Please try again.');
      }
    } catch (error) {
      console.error('Error saving edit:', error);
      alert('Failed to save your version. Please try again.');
    } finally {
      setIsEditing(false);
    }
  };

  const updateIngredient = (index: number, value: string) => {
    const newIngredients = [...editForm.ingredients];
    newIngredients[index] = { item: value };
    setEditForm({ ...editForm, ingredients: newIngredients });
  };

  const addIngredient = () => {
    setEditForm({
      ...editForm,
      ingredients: [...editForm.ingredients, { item: '' }]
    });
  };

  const removeIngredient = (index: number) => {
    const newIngredients = editForm.ingredients.filter((_, i) => i !== index);
    setEditForm({ ...editForm, ingredients: newIngredients });
  };

  const updateStep = (index: number, value: string) => {
    const newSteps = [...editForm.steps];
    newSteps[index] = { ...newSteps[index], text: value };
    setEditForm({ ...editForm, steps: newSteps });
  };

  const addStep = () => {
    setEditForm({
      ...editForm,
      steps: [...editForm.steps, { text: '', order: editForm.steps.length + 1 }]
    });
  };

  const removeStep = (index: number) => {
    const newSteps = editForm.steps.filter((_, i) => i !== index);
    setEditForm({ ...editForm, steps: newSteps });
  };

  const updateTip = (index: number, value: string) => {
    const newTips = [...editForm.tips];
    newTips[index] = value;
    setEditForm({ ...editForm, tips: newTips });
  };

  const addTip = () => {
    setEditForm({
      ...editForm,
      tips: [...editForm.tips, '']
    });
  };

  const removeTip = (index: number) => {
    const newTips = editForm.tips.filter((_, i) => i !== index);
    setEditForm({ ...editForm, tips: newTips });
  };

  function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
    return (
      <div className="stat-card flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1.5 py-1 shadow-sm sm:gap-2.5 sm:px-4 sm:py-2">
        <div className="flex h-4 w-4 items-center justify-center rounded-md bg-slate-50 sm:h-7 sm:w-7">
          <Icon className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] font-medium uppercase tracking-wide text-text-secondary sm:text-[10px]">{label}</span>
          <span className="text-[10px] font-semibold text-slate-900 sm:text-sm">{value}</span>
        </div>
      </div>
    );
  }
  function DifficultyHat({ level }: { level?: string }) {
    const raw = String(level || "").toLowerCase();
    const count = raw.startsWith("e") ? 1 : raw.startsWith("m") ? 2 : raw ? 3 : 0;
    const color =
      count === 1 ? "text-emerald-600" :
      count === 2 ? "text-amber-600" :
      count === 3 ? "text-rose-600" :
      "text-slate-400";
  
    return (
      <span className="inline-flex items-center gap-0.5" aria-label={`Difficulty: ${level || "unknown"}`}>
        {[0,1,2].map(i => (
          <ChefHat key={i} className={`h-3.5 w-3.5 ${i < count ? color : "text-slate-400/60"}`} />
        ))}
        <span className="sr-only">{level}</span>
      </span>
    );
  }

  
  
  // Helper function to format quantities nicely
  function formatQuantity(qty: string | number | null | undefined): string {
    if (!qty) return '';
    
    // If it's a string, try to parse numeric strings; otherwise return as-is
    if (typeof qty === 'string') {
      const trimmed = qty.trim();
      const parsed = Number(trimmed);
      if (!Number.isNaN(parsed)) {
        qty = parsed;
      } else {
        return trimmed;
      }
    }
    
    // If it's a number, format it nicely
    const num = qty;
    if (isNaN(num)) return qty.toString();
    
    // For whole numbers, return as integer
    if (num % 1 === 0) {
      return num.toString();
    }
    
    // Handle common fractions that might be stored as decimals
    const fractionMap: { [key: number]: string } = {
      0.125: '1/8',
      0.25: '1/4', 
      0.333: '1/3',
      0.333333: '1/3',
      0.33333334326744: '1/3', // Your specific case
      0.375: '3/8',
      0.5: '1/2',
      0.625: '5/8',
      0.666: '2/3',
      0.666667: '2/3',
      0.75: '3/4',
      0.875: '7/8'
    };
    
    // Check for exact fraction matches (with small tolerance for floating point errors)
    for (const [decimal, fraction] of Object.entries(fractionMap)) {
      if (Math.abs(num - parseFloat(decimal)) < 0.001) {
        return fraction;
      }
    }
    
    // For other decimals, round to 2 decimal places and remove trailing zeros
    return parseFloat(num.toFixed(2)).toString();
  }

  function IngredientRow({ qty, unit, item }: { qty?: string | number; unit?: string; item: string }) {
    // Helper: convert leading decimal in item to a common fraction string
    const convertLeadingDecimalToFraction = (text: string): string => {
      const m = text.match(/^\s*(\d+(?:\.\d+)?)(\b|\s)/);
      if (!m) return text;
      const num = Number(m[1]);
      if (Number.isNaN(num)) return text;
      const whole = Math.floor(num);
      const frac = num - whole;
      const candidates: Array<{ v: number; s: string }> = [
        { v: 1/8, s: '1/8' }, { v: 1/6, s: '1/6' }, { v: 1/5, s: '1/5' }, { v: 1/4, s: '1/4' },
        { v: 1/3, s: '1/3' }, { v: 3/8, s: '3/8' }, { v: 1/2, s: '1/2' }, { v: 5/8, s: '5/8' },
        { v: 2/3, s: '2/3' }, { v: 3/4, s: '3/4' }, { v: 7/8, s: '7/8' }
      ];
      const best = candidates.reduce((b, c) => {
        const d = Math.abs(frac - c.v);
        return d < b.dist ? { dist: d, s: c.s } : b;
      }, { dist: Infinity, s: '' as string });
      if (best.dist < 0.02) {
        const rep = whole > 0 ? `${whole} ${best.s}` : best.s;
        return text.replace(/^\s*\d+(?:\.\d+)?/, rep);
      }
      // If very close to integer, use integer
      if (Math.abs(num - Math.round(num)) < 1e-6) {
        return text.replace(/^\s*\d+(?:\.\d+)?/, String(Math.round(num)));
      }
      return text;
    };
    // Check if the item already contains quantity/unit information (common for web sources)
    // This happens when the item text starts with a number or contains both numbers and units
    const hasQuantityInItem = item && (
      // Starts with a number (like "6 chicken breasts")
      /^\d+/.test(item) ||
      // Starts with a unicode fraction (½ ¼ ¾ ⅓ ⅔)
      /^[½¼¾⅓⅔]/.test(item) ||
      // Starts with a simple ASCII fraction like 1/3
      /^\d+\/\d+/.test(item) ||
      // Contains both numbers and units (like "1 tablespoon olive oil")
      (/\d+/.test(item) && /\b(tsp|tbsp|tablespoon|teaspoon|cup|c|g|kg|ml|l|pound|lb|oz|clove|bunch|pinch|dash|handful)\b/i.test(item))
    );
    
    let display: string;
    if (hasQuantityInItem) {
      // For web sources where item already contains full text, use item as-is
      display = convertLeadingDecimalToFraction(item);
    } else {
      // For video sources where qty/unit are separate, combine them with formatted quantity
      const formattedQty = formatQuantity(qty);
      const prefix = [formattedQty, unit].filter(Boolean).join(' ');
      display = prefix ? `${prefix} ${item}` : item;
    }
    
    return (
      <div className="ingredient-row border-b border-slate-100 py-2 last:border-b-0 sm:py-2.5">
        <span className="text-[13px] font-semibold text-primary sm:text-sm">{display}</span>
      </div>
    );
  }
  

  function StepCard({
    index,
    text,
    ts,
    youtubeUrl,
    chapterTitle,
    videoTimestampUrl,
    image,
    stackMode = false,
  }: {
    index: number;
    text: string;
    ts?: string;
    youtubeUrl: string;
    chapterTitle?: string;
    videoTimestampUrl?: string;
    image?: string;
    stackMode?: boolean;
  }) {
    // Use the pre-built timestamp URL if available, otherwise build it from base URL + timestamp
    const deepLink = videoTimestampUrl || (youtubeUrl && ts ? (() => {
      // Parse timestamp string (e.g., "1:53" or "1:23:45")
      const parts = (ts || "0:00").split(":").map((n) => parseInt(n, 10) || 0);
      let seconds = 0;
      
      if (parts.length === 2) {
        // MM:SS format
        seconds = parts[0] * 60 + parts[1];
      } else if (parts.length === 3) {
        // HH:MM:SS format
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 1) {
        // Just seconds
        seconds = parts[0];
      }
      
      // Validate reasonable timestamp (not more than 48 hours)
      if (seconds > 172800) {
        console.warn(`Invalid timestamp: ${ts} (${seconds} seconds) - too large`);
        return "";
      }
      
      return `${youtubeUrl}${youtubeUrl.includes('?') ? '&' : '?'}t=${seconds}s`;
    })() : "");

    // Show complete step text (removed one-sentence limitation)
    const stepText = useMemo(() => {
      return (text || "").trim();
    }, [text]);

    return (
      <div className="step-card flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-sm print:flex-row print:items-start print:gap-2 print:p-2 md:flex-row md:items-start md:gap-3 md:p-3.5">
        <div className="flex flex-row items-start gap-2">
          <div className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-primary print:h-5 print:w-5 md:h-7 md:w-7">
            {index + 1}
          </div>

          <div className="grow text-text-secondary">
            <div className="flex items-start justify-between gap-2 mb-1">
              {chapterTitle && (
                <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  {chapterTitle}
                </span>
              )}
            </div>
            <p className="step-text flex items-center gap-2 text-[12px] leading-3.5 print:text-[13px] print:leading-[1.35] sm:text-[15px] sm:leading-5">
              <span>{stepText}</span>
              {deepLink && (
                <a
                  href={deepLink}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Play step at ${ts || 'timestamp'}`}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-[12px] font-medium text-text-secondary hover:bg-slate-50 print:hidden"
                >
                  <Play className="h-3.5 w-3.5" />
                  {ts ? `Play @${ts}` : 'Play'}
                </a>
              )}
            </p>
          </div>
        </div>

        {/* Step Image */}
        {image && image.trim() !== '' && showImages && !stackMode && (
          <div className={`step-image mt-2 overflow-hidden rounded-lg ${
            !printShowImages ? 'print:hidden' : ''
          }`}>
            <img
              src={image}
              alt={`Step ${index + 1}`}
              className="h-40 w-full object-cover sm:h-48"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`stack ${
        stackMode ? "force-stack" : ""
      } mx-auto max-w-5xl px-3 py-4 print:max-w-letter print:px-0 sm:px-4 sm:py-6`}
    >
      {/* Action buttons above title */}
      <div className="mb-1 flex justify-end gap-1 print:hidden sm:hidden">
        {!isYouTubeShorts && (
          <button
            onClick={() => setStackMode((prev) => !prev)}
            aria-label={stackMode ? "Switch to Detail Mode" : "Switch to Stack Mode"}
            className={`rounded-md border p-1.5 transition-colors ${
              stackMode 
                ? "border-primary/20 bg-muted text-primary hover:bg-muted" 
                : "border-primary/20 bg-muted text-primary hover:bg-muted"
            }`}
          >
            {stackMode ? <List className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </button>
        )}

        <button
          onClick={handleEditClick}
          aria-label="Edit Recipe"
          className="rounded-md border border-slate-200 bg-white p-1.5 text-text-secondary hover:bg-slate-50"
        >
          <Edit3 className="h-4 w-4" />
        </button>

        <button
          onClick={toggleSave}
          disabled={isSaving}
          aria-label={saved ? "Unsave" : "Save to My Collection"}
          className={`rounded-md border border-slate-200 bg-white p-1.5 hover:bg-slate-50 disabled:opacity-50 ${
            saved ? "text-primary" : "text-text-secondary"
          }`}
        >
          {isSaving ? (
            <div className="h-4 w-4 animate-spin rounded-full border border-slate-600 border-t-transparent" />
          ) : saved ? (
            <BookmarkCheck className="h-4 w-4 fill-primary" />
          ) : (
            <Bookmark className="h-4 w-4" />
          )}
        </button>

        <button
          onClick={handleShare}
          aria-label="Share"
          className="rounded-md border border-slate-200 bg-white p-1.5 text-text-secondary hover:bg-slate-50"
        >
          <Share2 className="h-4 w-4" />
        </button>

        <details ref={mobileDetailsRef} className="group relative">
          <summary className="list-none rounded-md border border-slate-200 bg-white p-1.5 text-text-secondary hover:bg-slate-50">
            <MoreHorizontal className="h-4 w-4" />
          </summary>
          <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
            <button
              onClick={handlePrint}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" /> Print
            </button>
            <button 
              onClick={handleReportIssue}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <Sparkles className="h-4 w-4" /> Report Issue
            </button>
          </div>
        </details>
      </div>

      {/* Header with title only */}
      <header className="header relative mb-1 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm print:mb-3 print:p-3 sm:mb-5 sm:rounded-3xl sm:p-6">
        <div className="flex flex-col gap-1 sm:gap-2 pr-20 sm:pr-32">
          <div className="flex items-start gap-2 flex-wrap">
            <h1 className="title text-lg font-extrabold text-slate-900 print:text-2xl sm:text-3xl flex-1 min-w-0">
              {recipe.title}
            </h1>
          </div>
          {(() => {
            // Extract author from recipe steps if web author is "Web Source"
            // Handle case where web.author might be an object with @id key
            const webAuthor = recipe.web?.author;
            const authorString = typeof webAuthor === 'string' ? webAuthor : 
                                typeof webAuthor === 'object' && webAuthor?.['@id'] ? 'Web Source' : 
                                webAuthor;
            let author = recipe.youtube?.author ?? recipe.tiktok?.author ?? recipe.instagram?.author ?? authorString ?? recipe.author ?? "";
            
            if (recipe.web?.author === "Web Source" && recipe.steps) {
              for (const step of recipe.steps) {
                // Try multiple patterns for author extraction
                const patterns = [
                  /Recipe developed by ([^.]+)/i,
                  /By ([^.]+)/i,
                  /Recipe by ([^.]+)/i,
                  /Author: ([^.]+)/i
                ];
                
                for (const pattern of patterns) {
                  const match = step.text?.match(pattern);
                  if (match) {
                    author = match[1].trim();
                    break;
                  }
                }
                if (author !== "Web Source") break;
              }
            }
            
            // Show original author, then "edited by" if it's a user version
            const elements = []
            
            if (author && author !== "Web Source") {
              elements.push(
                <span key="author" className="text-sm text-slate-600 sm:text-base">
                  by <span className="font-semibold text-slate-900">{author}</span>
                </span>
              )
            }
            
            if (recipe.parent_id && recipe.owner_id && user && recipe.owner_id === user.id) {
              elements.push(
                <span key="edited" className="text-sm text-slate-600 sm:text-base">
                  • edited by <span className="font-semibold text-slate-900">{user.user_metadata?.full_name || user.email || 'you'}</span>
                </span>
              )
            }
            
            if (elements.length > 0) {
              return <p className="flex items-center gap-1 flex-wrap">{elements}</p>
            } else if (recipe.subtitle) {
              return (
                <p className="text-sm text-slate-600 sm:text-base">{recipe.subtitle}</p>
              )
            }
            return null;
          })()}
        </div>

        {/* Main Recipe Image */}
        {recipe.image && recipe.image.trim() !== '' && previewShowImages && (!stackMode || showPrintModal) && (
          <div className={`main-recipe-image mt-4 overflow-hidden rounded-xl ${
            !printShowImages ? 'print:hidden' : ''
          }`}>
            <img
              src={recipe.image}
              alt={recipe.title}
              className="h-48 w-full object-cover sm:h-64"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Desktop buttons - hidden on mobile */}
        <div className="absolute right-4 top-4 hidden items-center gap-2 print:hidden sm:flex">
          <button
            onClick={() => setStackMode((prev) => !prev)}
            aria-label={stackMode ? "Switch to Detail Mode" : "Switch to Stack Mode"}
            className={`rounded-xl border p-2 transition-colors ${
              stackMode 
                ? "border-primary/20 bg-muted text-primary hover:bg-muted" 
                : "border-primary/20 bg-muted text-primary hover:bg-muted"
            }`}
          >
            {stackMode ? <List className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          </button>

          <button
            onClick={handleEditClick}
            aria-label="Edit Recipe"
            className="rounded-xl border border-slate-200 bg-white p-2 text-text-secondary hover:bg-slate-50"
          >
            <Edit3 className="h-5 w-5" />
          </button>

          <button
            onClick={toggleSave}
            disabled={isSaving}
            aria-label={saved ? "Unsave" : "Save to My Collection"}
            className={`rounded-xl border border-slate-200 bg-white p-2 hover:bg-slate-50 disabled:opacity-50 ${
              saved ? "text-primary" : "text-text-secondary"
            }`}
          >
            {isSaving ? (
              <div className="h-5 w-5 animate-spin rounded-full border border-slate-600 border-t-transparent" />
            ) : saved ? (
              <BookmarkCheck className="h-5 w-5 fill-primary" />
            ) : (
              <Bookmark className="h-5 w-5" />
            )}
          </button>

          <button
            onClick={handleShare}
            aria-label="Share"
            className="rounded-xl border border-slate-200 bg-white p-2 text-text-secondary hover:bg-slate-50"
          >
            <Share2 className="h-5 w-5" />
          </button>

          <details ref={desktopDetailsRef} className="group relative">
            <summary className="list-none rounded-xl border border-slate-200 bg-white p-2 text-text-secondary hover:bg-slate-50">
              <MoreHorizontal className="h-5 w-5" />
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
              <button
                onClick={handlePrint}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <Printer className="h-4 w-4" /> Print
              </button>
              <button 
                onClick={handleReportIssue}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <Sparkles className="h-4 w-4" /> Report Issue
              </button>
            </div>
          </details>
        </div>
      </header>

      {/* Stats - Full width, compact - Only show if at least one stat has a value */}
      {(() => {
        const hasAnyStats = recipe.stats.prep || recipe.stats.cook || recipe.stats.serves || recipe.stats.difficulty;
        return hasAnyStats ? (
          <section className="stats-row mb-2 mt-4 grid grid-cols-2 gap-1 sm:mb-5 sm:mt-6 sm:grid-cols-4 sm:gap-3">
            <Stat icon={Clock3} label="Prep" value={recipe.stats.prep ? `${recipe.stats.prep}m` : "-"} />
            <Stat icon={Flame} label="Cook" value={recipe.stats.cook ? `${recipe.stats.cook}m` : "-"} />
            <Stat icon={Users} label="Serves" value={recipe.stats.serves || "-"} />
            <Stat icon={ChefHat} label="Difficulty" value={recipe.stats.difficulty ? <DifficultyHat level={recipe.stats.difficulty} /> : "-"} />
          </section>
        ) : null;
      })()}

      {/* Extraction Details removed */}

      {/* Main grid */}
      <div className="recipe-grid grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-3 print:grid-cols-[2fr_1fr]">
        {/* LEFT: instruction + tips + notes */}
        <div className="left-col md:col-span-2">

          {/* Instruction */}
          <section className="mb-2 print:mb-3 sm:mb-5">
            <div className="mb-1 flex items-center justify-between sm:mb-3">
              <h2 className="text-sm font-bold text-slate-900 sm:text-lg">Instruction</h2>
              {hasStepImages && !stackMode && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowImages((v) => !v)}
                    className="group relative inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-text-secondary shadow-sm transition-all duration-200 hover:bg-slate-50 hover:shadow-md print:hidden sm:px-4 sm:text-sm"
                  >
                    <div className="relative flex items-center gap-2">
                      <div className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${
                        showImages ? 'bg-primary' : 'bg-text-secondary'
                      }`}>
                        <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          showImages ? 'translate-x-4' : 'translate-x-0.5'
                        }`} />
                      </div>
                      <ImageIcon className={`h-4 w-4 transition-colors duration-200 ${
                        showImages ? 'text-primary' : 'text-text-secondary'
                      }`} />
                      <span className="text-text-secondary">
                        {showImages ? "Images On" : "Images Off"}
                      </span>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {stackMode ? (
              <div className="flex flex-col gap-1 print:gap-1.5 sm:gap-3">
                {recipe.steps
                  .filter((s: any) => typeof s.text === 'string' && s.text.trim())
                  .map((s: any, i: number) => (
                  <StepCard
                    key={i}
                    index={i}
                    text={s.text}
                    ts={s.formattedTimestamp || s.ts}
                    youtubeUrl={recipe.youtube?.url || ""}
                    chapterTitle={s.chapterTitle}
                    videoTimestampUrl={s.videoTimestampUrl}
                    image={s.img || s.screenshot || s.image}
                    stackMode={stackMode}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1 print:gap-1.5 sm:gap-3">
                {recipe.steps
                  .filter((s: any) => typeof s.text === 'string' && s.text.trim())
                  .map((s: any, i: number) => (
                  <StepCard
                    key={i}
                    index={i}
                    text={s.text}
                    ts={s.formattedTimestamp || s.ts}
                    youtubeUrl={recipe.youtube?.url || ""}
                    chapterTitle={s.chapterTitle}
                    videoTimestampUrl={s.videoTimestampUrl}
                    image={s.img || s.screenshot || s.image}
                    stackMode={stackMode}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Pro Tips (moved below instructions in print for better space usage) */}
          {hasTips && !stackMode && (
            <section className="pro-tips mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-slate-800 print:mb-3 sm:p-4">
              <div className="mb-1.5 font-semibold sm:mb-2">💡 Pro Tips</div>
              <ul className="list-disc space-y-1 pl-5 text-[13px] sm:text-sm">
                {recipe.tips.map((t: string, i: number) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Ingredients (mobile only—above Pro Tips) */}
          <section className="mb-4 block print:hidden md:hidden">
            <h2 className="mb-2 text-base font-bold text-slate-900 sm:text-lg">Ingredients</h2>
            <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:p-3">
              {recipe.ingredients.map((ing: any, i: number) => (
                <IngredientRow key={`${ing.item}-${i}`} qty={ing.qty} unit={ing.unit} item={ing.item} />
              ))}
            </div>
          </section>

          {/* Notes (included in print if not empty) */}
          {!stackMode && (
            <section className={`notes-section mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:mb-6 sm:p-4 ${notes.trim().length === 0 && !isEditingNotes ? "print:hidden" : ""}`}>
              <div className="mb-1.5 flex items-center gap-2 text-slate-900 sm:mb-2">
                <span className="text-lg">📝</span>
                <h3 className="text-base font-bold sm:text-lg">Your Notes (included in Print/PDF)</h3>
              </div>

              {/* Empty State */}
              {!notes.trim() && !isEditingNotes && (
                <div className="min-h-[90px] flex items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 sm:min-h-[110px]">
                  <div className="text-center">
                    <p className="text-slate-500 text-sm mb-3">Add your personal notes...</p>
                    <button
                      onClick={startEditingNotes}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow hover:bg-primary-hover print:hidden"
                    >
                      <Edit3 className="h-4 w-4" />
                      Add Notes
                    </button>
                  </div>
                </div>
              )}

              {/* View Mode */}
              {notes.trim() && !isEditingNotes && (
                <div className="space-y-3">
                  <div className="min-h-[90px] rounded-xl border border-slate-200 bg-slate-50 p-3 text-[14px] sm:min-h-[110px]">
                    <div className="whitespace-pre-wrap text-text-primary">{notes}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    {notesSaved && (
                      <div className="flex items-center gap-2 text-green-600 text-sm">
                        <CheckCircle className="h-4 w-4" />
                        Notes saved!
                      </div>
                    )}
                    <div className="ml-auto">
                      <button
                        onClick={startEditingNotes}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 shadow hover:bg-slate-200 print:hidden"
                      >
                        <Edit3 className="h-4 w-4" />
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Edit Mode */}
              {isEditingNotes && (
                <div className="space-y-3">
                  <textarea
                    value={notes}
                    onChange={handleNotesChange}
                    placeholder="Add substitutions, timing tweaks…"
                    className={`min-h-[90px] w-full resize-vertical rounded-xl border p-3 text-[14px] text-slate-800 outline-none focus:ring-0 sm:min-h-[110px] ${
                      hasUnsavedChanges 
                        ? 'border-orange-300 bg-orange-50 focus:border-orange-400' 
                        : 'border-slate-200 bg-slate-50 focus:border-border'
                    }`}
                    autoFocus
                  />
                  <div className="flex items-center justify-between">
                    {hasUnsavedChanges && (
                      <div className="flex items-center gap-2 text-orange-600 text-sm">
                        <AlertCircle className="h-4 w-4" />
                        Unsaved changes
                      </div>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={cancelEditingNotes}
                        disabled={isSavingNotes}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 shadow hover:bg-slate-200 disabled:opacity-50 print:hidden"
                      >
                        <X className="h-4 w-4" />
                        Cancel
                      </button>
                      <button
                        onClick={saveNotes}
                        disabled={isSavingNotes || !hasUnsavedChanges}
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white shadow print:hidden ${
                          isSavingNotes 
                            ? 'bg-primary/60 cursor-not-allowed' 
                            : hasUnsavedChanges
                              ? 'bg-primary hover:bg-primary-hover'
                              : 'bg-slate-300 cursor-not-allowed'
                        }`}
                      >
                        {isSavingNotes ? (
                          <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            Save
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* RIGHT: ingredients only (Pro Tips moved to left column in print) */}
        <aside className="ingredients-aside hidden h-fit md:sticky md:top-4 md:col-span-1 md:block print:block print:col-span-1">
          <section className="mb-4">
            <h2 className="mb-2 text-base font-bold text-slate-900 sm:text-lg">Ingredients</h2>
            <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:p-3">
              {recipe.ingredients.map((ing: any, i: number) => (
                <IngredientRow key={`${ing.item}-${i}`} qty={ing.qty} unit={ing.unit} item={ing.item} />
              ))}
            </div>
          </section>

        </aside>
      </div>

      {/* Footer attribution */}
      <footer className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-text-secondary shadow-sm sm:mt-6 sm:rounded-3xl sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              {recipe.youtube ? (
                <>
                  <span>
                    Recipe adapted from video by{" "}
                    <span className="font-semibold text-slate-900">{recipe.youtube.author}</span>
                  </span>
                  <a
                    href={recipe.youtube.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 underline hover:no-underline transition-all"
                    aria-label="Watch original video on YouTube"
                  >
                    <span className="text-xs sm:text-sm">Watch video</span>
                    <Youtube className="h-3 w-3" />
                  </a>
                </>
              ) : recipe.tiktok ? (
                <>
                  <span>
                    Recipe adapted from TikTok video by{" "}
                    <span className="font-semibold text-slate-900">{recipe.tiktok.author}</span>
                  </span>
                  <a
                    href={recipe.tiktok.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-pink-600 hover:text-pink-700 underline hover:no-underline transition-all"
                    aria-label="Watch original video on TikTok"
                  >
                    <span className="text-xs sm:text-sm">Watch video</span>
                    <PlayCircle className="h-3 w-3" />
                  </a>
                </>
              ) : recipe.instagram ? (
                <>
                  <span>
                    Recipe adapted from Instagram video by{" "}
                    <span className="font-semibold text-slate-900">{recipe.instagram.author}</span>
                  </span>
                  <a
                    href={recipe.instagram.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-700 underline hover:no-underline transition-all"
                    aria-label="Watch original video on Instagram"
                  >
                    <span className="text-xs sm:text-sm">Watch video</span>
                    <PlayCircle className="h-3 w-3" />
                  </a>
                </>
              ) : recipe.web ? (
                <>
                  <span>
                    Recipe adapted from{" "}
                    <span className="font-semibold text-slate-900">
                      {(() => {
                        // Extract author from recipe steps if web author is "Web Source"
                        if (recipe.web.author === "Web Source" && recipe.steps) {
                          for (const step of recipe.steps) {
                            // Try multiple patterns for author extraction
                            const patterns = [
                              /Recipe developed by ([^.]+)/i,
                              /By ([^.]+)/i,
                              /Recipe by ([^.]+)/i,
                              /Author: ([^.]+)/i
                            ];
                            
                            for (const pattern of patterns) {
                              const match = step.text?.match(pattern);
                              if (match) {
                                return match[1].trim();
                              }
                            }
                          }
                        }
                        return recipe.web.domain;
                      })()}
                    </span>
                  </span>
                  <a
                    href={recipe.web.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 underline hover:no-underline transition-all"
                    aria-label="Visit original recipe"
                  >
                    <span className="text-xs sm:text-sm">Visit source</span>
                    <LinkIcon className="h-3 w-3" />
                  </a>
                </>
              ) : (
                <span className="text-text-secondary">Recipe source not available</span>
              )}
            </div>

            <div className="flex items-center gap-2 print:hidden">
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-white shadow hover:bg-primary-hover sm:px-4 sm:text-sm"
              >
                <Share2 className="h-4 w-4" />
                Share
              </button>
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50 sm:px-4 sm:text-sm"
              >
                <FileType className="h-4 w-4" />
                Download PDF
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <img
              src="/images/red_logo.png"
              alt="Chef Stacks"
              className="h-12 w-auto opacity-80"
            />
          </div>
        </div>
      </footer>

      {/* Tiny toast when link is copied */}
      <div
        className={`pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center transition ${
          copied ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
          <Check className="h-3.5 w-3.5" /> Link copied
        </div>
      </div>

      {/* Signup Modal */}
      <SignupModal
        isOpen={showSignupModal}
        onClose={() => setShowSignupModal(false)}
        title="Save this recipe forever"
        description="Create an account to save recipes and access them across all your devices."
      />

      {/* Print Options Modal */}
      <PrintOptionsModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        onPrint={handlePrintWithOptions}
        onPreview={handlePreviewOptions}
        hasImages={hasAnyImages}
        currentShowImages={showImages}
      />

      {/* Edit Recipe Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Edit Recipe</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="rounded-lg p-2 text-text-secondary hover:bg-slate-100"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Recipe Title
                </label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full rounded-lg border border-border px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Enter recipe title"
                />
              </div>

              {/* Ingredients */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-text-secondary">
                    Ingredients
                  </label>
                  <button
                    onClick={addIngredient}
                    className="rounded-lg bg-primary px-3 py-1 text-sm text-white hover:bg-primary-hover"
                  >
                    Add Ingredient
                  </button>
                </div>
                <div className="space-y-2">
                  {editForm.ingredients.map((ingredient, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={ingredient.item || ''}
                        onChange={(e) => updateIngredient(index, e.target.value)}
                        className="flex-1 rounded-lg border border-border px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="e.g., 2 tsp olive oil, 1/2 cup sugar, 3 large eggs"
                      />
                      <button
                        onClick={() => removeIngredient(index)}
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Steps */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-text-secondary">
                    Instructions
                  </label>
                  <button
                    onClick={addStep}
                    className="rounded-lg bg-primary px-3 py-1 text-sm text-white hover:bg-primary-hover"
                  >
                    Add Step
                  </button>
                </div>
                <div className="space-y-3">
                  {editForm.steps.map((step, index) => (
                    <div key={index} className="flex gap-2">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold text-primary">
                        {index + 1}
                      </span>
                      <textarea
                        value={step.text || ''}
                        onChange={(e) => updateStep(index, e.target.value)}
                        className="flex-1 rounded-lg border border-border px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="Enter step instructions"
                        rows={2}
                      />
                      <button
                        onClick={() => removeStep(index)}
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tips */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-text-secondary">
                    Pro Tips
                  </label>
                  <button
                    onClick={addTip}
                    className="rounded-lg bg-primary px-3 py-1 text-sm text-white hover:bg-primary-hover"
                  >
                    Add Tip
                  </button>
                </div>
                <div className="space-y-2">
                  {editForm.tips.map((tip, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={tip}
                        onChange={(e) => updateTip(index, e.target.value)}
                        className="flex-1 rounded-lg border border-border px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="Enter a pro tip"
                      />
                      <button
                        onClick={() => removeTip(index)}
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-8 flex justify-end gap-3">
              <button
                onClick={() => setShowEditModal(false)}
                className="rounded-lg border border-border px-4 py-2 text-text-secondary hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isEditing}
                className="rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-hover disabled:opacity-50"
              >
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Saving...
                  </div>
                ) : (
                  'Save My Version'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Issue Modal */}
      <ReportIssueModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        recipe={{
          id: recipe.id,
          title: recipe.title,
          url: recipe.url
        }}
        userEmail={user?.email}
      />
    </div>
  );
}
