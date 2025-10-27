🧑‍🍳 ChefStacks
“All your recipes — saved, simplified, and shareable.”

🌟 Project Overview

ChefStacks is an AI-powered platform that turns scattered recipe sources — from blogs, web pages, or videos — into clean, structured, and editable recipe cards.

We built ChefStacks to solve a modern cooking problem:

Recipes today come from everywhere — YouTube, TikTok, Pinterest, food blogs —
but they’re often hard to read, full of ads, or impossible to use while you cook.

ChefStacks transforms those sources into a unified, ad-free experience. Every recipe becomes a clean, consistent card that’s easy to save, edit, and share.

Our long-term vision is to build the Spotify of recipes —
a platform where anyone can discover, remix, and organize recipes from across the internet, just as Spotify unified how people collect and share music.

Demo video: https://youtu.be/NiptSUfNUhQ

👩‍💻 Team Introduction

👋 Yi Feng Sindell
📍 California, USA
🎯 Role: Product Lead, Designer & Developer
💬 Background in EdTech and AI product management — previously Product Lead at Vocabulary.com, now building human-centered AI tools like The Learning Dictionary, LingoE, and ChefStacks.

Yi led end-to-end design, development, and integration for ChefStacks — from UX and data modeling to AI orchestration and system optimization.

⚙️ Key Features

1. AI Recipe Extraction
Converts any YouTube, TikTok, or blog URL into a structured recipe card with ingredients, steps, and timestamps.

2. Editable Recipe Cards
Users can tweak ingredients, measurements, or steps, then save personalized versions in their own collection.

3. Ad-Free Reading Mode
Strips away clutter, pop-ups, and long intros from blogs for a clean, readable layout.

4. Visual Context
Automatically captures thumbnails and step visuals from videos for clarity and engagement.

5. Community Recipes (MVP Stage)
A shared collection of base recipes and public “remixes” — the foundation of ChefStacks’ Spotify-style discovery experience.

6.Interactive Loading Experience
Engages users during AI processing with rotating chef tips, cooking science facts, and trivia.


🧰 Tech Stack
Layer	Technology
Frontend	React + Vite + TailwindCSS
Backend	FastAPI (Python)
Database & Auth	Supabase (PostgreSQL, Auth, Storage)
AI Processing	Memories.ai API (video ingestion & transcript analysis)
Hosting	Vercel (frontend) + Render (backend)
Version Control	GitHub


🤝 Sponsor Tools & Integrations
Tool	Purpose	Integration Highlights
Memories.ai	Video understanding & recipe extraction	Async REST integration with polling and structured JSON parsing
YouTube Data API	Smart filtering for recipe relevance	Used to analyze titles, descriptions, and durations before triggering AI calls
Supabase	Database, storage, authentication	Handles user data, public recipes, and versioning
Vercel & Render	Deployment & hosting	Vercel for frontend; Render for backend
OpenAI (optional)	Text refinement	Polishes recipe instructions and summaries for readability

💡 Challenges & Learnings

1. Detecting non-recipe content efficiently
Avoiding wasted AI calls became a major focus.
For YouTube, we leveraged the YouTube Data API to analyze metadata (title, tags, category, duration) and predict recipe relevance.
However, TikTok and Instagram lacked public APIs, so we implemented a fallback system using duration thresholds, content confidence scoring, and heuristic text checks.
This hybrid approach achieved a strong balance between accuracy, cost efficiency, and user inclusiveness.

2. Diverse content formats
Recipes come from HTML blogs, long YouTube videos, or short clips. We designed flexible extraction logic to normalize them into a shared JSON recipe structure.

3. Long AI processing times
AI-based video analysis can take up to a minute. Instead of leaving users waiting, we turned it into a micro-learning moment — showing cooking tips and fun facts while progress updates.

4. Balancing automation and creativity
ChefStacks automatically generates a base recipe but gives users full control to edit and remix. This model supports community creativity — much like remixing or playlist curation on Spotify.

🚀 Future Improvements / Next Steps

⚡ Smarter Recipe Detection: Further refine non-recipe detection using vision and NLP cues.
📸 Smart Screenshot Capture: Auto-select key frames for step visuals.
📱 Mobile App (Capacitor): Hands-free cooking and saving on mobile devices.
🎙️ Chef Mode: Step-by-step voice-guided cooking view.
🌐 Social Discovery Layer: Follow creators, explore trending dishes, and share collections.
🧾 Improved HTML Parsing: Expand to more blog structures and formats.



🧩 Technical Design Insight

ChefStacks optimizes the balance between AI cost efficiency and user experience:

Pre-checks metadata to prevent wasteful AI calls.

Uses async polling and retry logic for large tasks.

Saves structured results to Supabase for caching and fast reloads.

Designed modularly so each extraction step (fetch → process → refine → display) can evolve independently.


🏁 Summary

ChefStacks turns any video recipe or blog post — from YouTube, TikTok, Instagram, or the web — into a clean, structured recipe card you can actually cook from.
See only what matters: ingredients, steps, and visuals.
Save your favorites, edit your own versions, and share them with the community.

Built by a solo creator, powered by AI, and designed for every curious cook who believes recipes deserve a better home.
