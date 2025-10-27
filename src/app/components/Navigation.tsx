'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { User, LogOut, Settings, Heart, ArrowLeft } from 'lucide-react'
import Brand from './Brand'

export default function Navigation() {
  const { user, signOut } = useAuth()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const pathname = usePathname()
  const isCollectionPage = pathname === '/collection'
  

  const handleSignOut = async () => {
    await signOut()
    setShowUserMenu(false)
  }

  return (
    <nav className="flex items-center justify-between py-1 sm:py-2">
      <Brand />
      
      <div className="flex items-center gap-2 sm:gap-4">
        {user ? (
          <>
            {/* Show Back to home on collection page, My Collection on other pages */}
            {isCollectionPage ? (
              <Link
                href="/"
                className="inline-flex items-center gap-1 rounded-lg sm:rounded-xl border border-slate-200 bg-white px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Back to home</span>
                <span className="sm:hidden">Back</span>
              </Link>
            ) : (
              <Link
                href="/collection"
                className="inline-flex items-center gap-1 rounded-lg sm:rounded-xl border border-slate-200 bg-white px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Heart className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">My Collection</span>
                <span className="sm:hidden">Collection</span>
              </Link>
            )}
            
            {/* User Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-1 sm:gap-2 p-1 sm:p-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                {user.user_metadata?.avatar_url ? (
                  <img
                    src={user.user_metadata.avatar_url}
                    alt={user.user_metadata.display_name || user.email}
                    className="w-6 h-6 sm:w-8 sm:h-8 rounded-full"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      target.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <div className={`w-6 h-6 sm:w-8 sm:h-8 bg-muted rounded-full flex items-center justify-center ${user.user_metadata?.avatar_url ? 'hidden' : ''}`}>
                  <User className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
                </div>
                <span className="text-xs sm:text-sm font-medium text-slate-700 hidden sm:inline">
                  {user.user_metadata?.display_name || user.email?.split('@')[0]}
                </span>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-40 sm:w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50">
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <LogOut className="h-3 w-3 sm:h-4 sm:w-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Show Back to home on collection page, My Collection on other pages for non-authenticated users */}
            {isCollectionPage ? (
              <Link
                href="/"
                className="inline-flex items-center gap-1 rounded-lg sm:rounded-xl border border-slate-200 bg-white px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Back to home</span>
                <span className="sm:hidden">Back</span>
              </Link>
            ) : (
              <Link
                href="/collection"
                className="inline-flex items-center gap-1 rounded-lg sm:rounded-xl border border-slate-200 bg-white px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Heart className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">My Collection</span>
                <span className="sm:hidden">Collection</span>
              </Link>
            )}
          </>
        )}
      </div>
    </nav>
  )
}
