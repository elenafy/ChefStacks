'use client'

import { useState } from 'react'
import { X, Send, AlertCircle } from 'lucide-react'

interface ReportIssueModalProps {
  isOpen: boolean
  onClose: () => void
  recipe: {
    id: string
    title: string
    url?: string
  }
  userEmail?: string
}

export default function ReportIssueModal({ isOpen, onClose, recipe, userEmail }: ReportIssueModalProps) {
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return

    setIsSubmitting(true)
    setSubmitStatus('idle')
    setErrorMessage('')

    try {
      const response = await fetch('/api/report-issue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipeId: recipe.id,
          recipeTitle: recipe.title,
          recipeUrl: recipe.url,
          userEmail: userEmail || 'anonymous',
          message: message.trim(),
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to submit report')
      }

      setSubmitStatus('success')
      setMessage('')
      
      // Close modal after 2 seconds
      setTimeout(() => {
        onClose()
        setSubmitStatus('idle')
      }, 2000)
    } catch (error) {
      setSubmitStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      onClose()
      setMessage('')
      setSubmitStatus('idle')
      setErrorMessage('')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50" 
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Report an Issue</h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-1 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {submitStatus === 'success' ? (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-4">
                <Send className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-2">Report Sent!</h3>
              <p className="text-slate-600">
                Thank you for your feedback. We'll review your report and get back to you if needed.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <p className="text-sm text-slate-600 mb-2">
                  Help us improve by reporting issues with this recipe:
                </p>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="font-medium text-slate-900 text-sm">{recipe.title}</p>
                  {recipe.url && (
                    <p className="text-xs text-slate-500 mt-1 break-all">{recipe.url}</p>
                  )}
                </div>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label htmlFor="message" className="block text-sm font-medium text-slate-700 mb-2">
                    What's the issue? *
                  </label>
                  <textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Please describe the issue you encountered (e.g., incorrect ingredients, missing steps, broken links, etc.)"
                    className="w-full h-32 px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                    required
                    disabled={isSubmitting}
                  />
                </div>

                {submitStatus === 'error' && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-800">Failed to submit report</p>
                      <p className="text-sm text-red-600">{errorMessage}</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-border rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!message.trim() || isSubmitting}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Send Report
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
