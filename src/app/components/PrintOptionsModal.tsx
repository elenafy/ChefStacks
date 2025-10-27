"use client";

import React, { useState, useEffect } from "react";
import { Save, X, Image as ImageIcon, Eye, EyeOff } from "lucide-react";

interface PrintOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPrint: (options: PrintOptions) => void;
  onPreview: (options: PrintOptions) => void;
  hasImages: boolean;
  currentShowImages: boolean;
}

interface PrintOptions {
  includeImages: boolean;
}

export default function PrintOptionsModal({
  isOpen,
  onClose,
  onPrint,
  onPreview,
  hasImages,
  currentShowImages,
}: PrintOptionsModalProps) {
  const [includeImages, setIncludeImages] = useState(currentShowImages);

  // Update state when modal opens
  useEffect(() => {
    if (isOpen) {
      setIncludeImages(currentShowImages);
    }
  }, [isOpen, currentShowImages, hasImages]);

  if (!isOpen) return null;


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Save Options</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <ImageIcon className="h-5 w-5 text-slate-600" />
                <div>
                  <div className="font-medium text-slate-900">Include Images</div>
                </div>
            </div>
            <button
              onClick={() => {
                const newState = !includeImages;
                setIncludeImages(newState);
                // Update preview immediately
                onPreview({ includeImages: newState });
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                includeImages ? "bg-primary" : "bg-text-secondary"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  includeImages ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              // Apply the print settings and show print preview
              onPrint({ includeImages });
              onClose();
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            <Save className="h-4 w-4" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
