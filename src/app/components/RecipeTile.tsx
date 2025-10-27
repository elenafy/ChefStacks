"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Clock3,
  Flame,
  PlayCircle,
  ChefHat,
  Link as LinkIcon,
  CheckCircle,
  AlertCircle,
  Share2,
  Users,
  User,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import SignupModal from "./SignupModal";

function TinyChip({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold text-slate-800 ring-1 ring-slate-200 backdrop-blur">
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

/** 1–3 chef hats (Easy/Medium/Hard) */
function DifficultyHat({ level }: { level?: string | null }) {
  if (level === null || level === undefined) {
    return (
      <span
        className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-white/85 px-1 py-0.5 ring-1 ring-slate-200 backdrop-blur"
        aria-label="Difficulty: unknown"
        title="Difficulty: unknown"
      >
        <span className="text-[10px] font-semibold text-slate-800">-</span>
      </span>
    );
  }

  const raw = String(level).toLowerCase();
  const count =
    raw.startsWith("e") ? 1 : raw.startsWith("m") ? 2 : raw ? 3 : 0;
  const color =
    count === 1 ? "text-emerald-600" :
    count === 2 ? "text-amber-600" :
    count === 3 ? "text-rose-600" : "text-slate-400";

  return (
    <span
      className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-white/85 px-1 py-0.5 ring-1 ring-slate-200 backdrop-blur"
      aria-label={`Difficulty: ${level}`}
      title={`Difficulty: ${level}`}
    >
      {[0, 1, 2].map((i) => (
        <ChefHat
          key={i}
          className={`h-3 w-3 ${i < count ? color : "text-slate-400/60"}`}
        />
      ))}
      <span className="sr-only">{level}</span>
    </span>
  );
}

function fmtMinutes(min?: number | null) {
  if (min === null || min === undefined) return "-";
  const m = Number(min);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h}h${r}m` : `${h}h`;
  }
  return `${m}m`;
}

function getYouTubeId(recipe: any): string {
  if (recipe.youtube?.id) return recipe.youtube.id;
  try {
    const u = new URL(recipe.youtube?.url || "");
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v") || "";
  } catch {}
  return "";
}

function getExtractionSourceInfo(recipe: any) {
  const debug = recipe.debug;
  if (!debug) return null;

  // Determine primary extraction source (excluding structured data)
  if (debug.usedTranscript) {
    return { type: "transcript", icon: PlayCircle, color: "text-blue-600", label: "Transcript" };
  }
  if (debug.usedNotes) {
    return { type: "notes", icon: LinkIcon, color: "text-green-600", label: "Notes" };
  }
  if (debug.parsedFromHtml) {
    return { type: "parsed", icon: AlertCircle, color: "text-primary", label: "Parsed" };
  }
  return null;
}



export default function RecipeTile({
  recipe,
}: {
  recipe: any;
}) {
  const router = useRouter();
  const { user, getAnonymousId } = useAuth();
  const [showSignupModal, setShowSignupModal] = useState(false);
  
  const prep = recipe.stats?.prep ?? recipe.prep ?? null;
  const cook = recipe.stats?.cook ?? recipe.cook ?? null;
  const difficulty = recipe.stats?.difficulty ?? recipe.difficulty ?? null;
  
  // Check if this recipe was created by the current user
  const isUserRecipe = user && recipe.owner_id === user.id;
  const isAnonymousUserRecipe = !user && recipe.owner_id === getAnonymousId();
  const isOwnedByUser = isUserRecipe || isAnonymousUserRecipe;
  
  // Check if this is a recently created recipe (within last 5 minutes)
  const isRecentlyCreated = recipe.created_at && 
    (Date.now() - new Date(recipe.created_at).getTime()) < 5 * 60 * 1000;
  // Extract author from recipe steps if web author is "Web Source"
  const getAuthorFromSteps = (recipe: any) => {
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
            return match[1].trim();
          }
        }
      }
    }
    return null;
  };

  const extractedAuthor = getAuthorFromSteps(recipe);
  // Handle case where web.author might be an object with @id key
  const webAuthor = recipe.web?.author;
  const authorString = typeof webAuthor === 'string' ? webAuthor : 
                      typeof webAuthor === 'object' && webAuthor?.['@id'] ? 'Web Source' : 
                      webAuthor;
  const author = recipe.youtube?.author ?? recipe.tiktok?.author ?? recipe.instagram?.author ?? (extractedAuthor || authorString) ?? recipe.author ?? "";
  const handle = recipe.youtube?.handle ?? recipe.web?.domain ?? recipe.handle ?? "";
  const youtubeId = getYouTubeId(recipe);
  const webUrl = recipe.web?.url;
  const extractionSource = getExtractionSourceInfo(recipe);

  // Detect platform for display
  const getPlatform = () => {
    if (recipe.youtube?.url || youtubeId) return "YouTube";
    if (recipe.tiktok?.url) return "TikTok";
    if (recipe.instagram?.url) return "Instagram";
    if (webUrl) {
      // For web recipes, show the domain/source instead of just "Web"
      return recipe.web?.domain || "Web";
    }
    return null;
  };
  const platform = getPlatform();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    router.push(`/recipe/${recipe.id}`);
  };



  return (
    <div 
      className={`group block overflow-hidden rounded-2xl border transition hover:shadow-md cursor-pointer ${
        isOwnedByUser 
          ? 'border-primary/30 bg-muted/30 shadow-primary/10' 
          : 'border-slate-200 bg-white shadow-sm'
      } ${
        isRecentlyCreated && isOwnedByUser 
          ? 'animate-pulse ring-2 ring-primary/20' 
          : ''
      }`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`Open ${recipe.title}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick(e as any);
        }
      }}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {recipe.image && recipe.image.trim() !== '' ? (
          <img
            src={recipe.image}
            alt={recipe.title}
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <div className="text-gray-400 text-center">
              <div className="text-4xl mb-2">🍽️</div>
              <div className="text-sm font-medium">No Image</div>
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />

        {/* User ownership indicator */}
        {isOwnedByUser && (
          <div className="absolute left-2 top-2 flex items-center gap-1">
            <div className="flex items-center gap-1 rounded-full bg-primary/90 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur">
              <User className="h-3 w-3" />
              {isRecentlyCreated ? 'New' : 'Yours'}
            </div>
          </div>
        )}

        {/* Meta stats hidden for cleaner look */}
        {/* <div className="absolute left-2 right-12 top-2 flex flex-nowrap items-center gap-1.5">
          <TinyChip icon={Clock3} label={fmtMinutes(prep)} />
          <TinyChip icon={Flame} label={fmtMinutes(cook)} />
          <DifficultyHat level={difficulty} />
          {extractionSource && (
            <span className={`shrink-0 inline-flex items-center gap-1 rounded-full bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-slate-200 backdrop-blur ${extractionSource.color}`}>
              <extractionSource.icon className="h-3 w-3" />
              {extractionSource.label}
            </span>
          )}
        </div> */}

        {/* Save Count Display - Hidden for cleaner look */}
        {/* <div className="absolute right-2 top-2 flex items-center gap-1">
          <div className="flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 shadow ring-1 ring-slate-200 backdrop-blur">
            <Users className="h-3 w-3 text-slate-600" />
            <span className="text-xs font-medium text-slate-600">
              {recipe.saveCount || 0}
            </span>
          </div>
        </div> */}

        {youtubeId && (
          <a
            href={`https://www.youtube.com/watch?v=${youtubeId}`}
            target="_blank"
            rel="noreferrer"
            className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[12px] font-medium text-slate-800 ring-1 ring-slate-200 hover:bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <PlayCircle className="h-4 w-4" /> Watch
          </a>
        )}
      </div>

      <div className="p-3">
        <h3 className="line-clamp-1 text-sm font-bold text-slate-900">{recipe.title}</h3>
        <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
          <span className="inline-flex items-center gap-1">
            {author ? <>by <span className="font-semibold">{author}</span></> : <span className="text-slate-400">by —</span>}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">{platform || "—"}</span>
          </div>
        </div>
      </div>

      {/* Signup Modal */}
      <SignupModal
        isOpen={showSignupModal}
        onClose={() => {
          setShowSignupModal(false);
        }}
        onSuccess={() => {
          setShowSignupModal(false);
        }}
        title="Save this recipe"
        description="Create an account to save recipes to your collection."
      />
    </div>
  );
}
