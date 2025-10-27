// Description Parser for YouTube Recipe Videos
// Parses the specific structure of recipe descriptions

export interface ParsedStep {
  timestamp: number;
  title: string;
  instructions: string[];
  context: string;
}

export interface ParsedDescription {
  ingredients: string[];
  steps: ParsedStep[];
  chapters: Array<{ timestamp: number; title: string }>;
}

export function parseRecipeDescription(description: string): ParsedDescription {
  const lines = description.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  
  const result: ParsedDescription = {
    ingredients: [],
    steps: [],
    chapters: []
  };
  
  let inRecipeSection = false;
  let inChapterSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect recipe section start
    if (line.includes('RECIPE') && line.includes('*')) {
      inRecipeSection = true;
      continue;
    }
    
    // Detect chapter section start
    if (line.includes('CHAPTERS')) {
      inChapterSection = true;
      continue;
    }
    
    // Stop at other sections
    if (inRecipeSection && (
      line.includes('IF USING') || 
      line.includes('MUSIC') || 
      line.includes('DISCLAIMER') ||
      line.includes('CHAPTERS')
    )) {
      inRecipeSection = false;
    }
    
    if (inChapterSection && (
      line.includes('DISCLAIMER') ||
      line.includes('How this content was made')
    )) {
      inChapterSection = false;
    }
    
    // Parse ingredients (bullet points)
    if (inRecipeSection && line.startsWith('▪')) {
      const ingredient = line.replace(/^▪\s*/, '').trim();
      if (ingredient) {
        result.ingredients.push(ingredient);
      }
    }
    
    // Parse steps (lines with timestamps)
    if (inRecipeSection && line.includes('@')) {
      const timestampMatch = line.match(/@(\d{1,2}:\d{2}(?::\d{2})?)/);
      if (timestampMatch) {
        const timestamp = parseTimestamp(timestampMatch[1]);
        const stepText = line.replace(/@\d{1,2}:\d{2}(?::\d{2})?/g, '').trim();
        
        // Extract title from step text
        let title = stepText.split(/[.!?]/)[0].trim();
        if (title.length > 6) {
          title = title.split(' ').slice(0, 6).join(' ');
        }
        
        // Look for instructions in surrounding context
        const instructions: string[] = [];
        const contextStart = Math.max(0, i - 2);
        const contextEnd = Math.min(lines.length - 1, i + 2);
        
        for (let j = contextStart; j <= contextEnd; j++) {
          const contextLine = lines[j];
          
          // Skip lines with timestamps, URLs, or very short lines
          if (contextLine.includes('@') || contextLine.includes('http') || contextLine.length < 20) {
            continue;
          }
          
          // Look for lines that describe the step process
          if (contextLine.length > 20 && contextLine.length < 300) {
            // Split into sentences and take the first 1-2 sentences
            const sentences = contextLine.split(/[.!?]/).filter(s => s.trim().length > 10);
            for (const sentence of sentences.slice(0, 2)) {
              const words = sentence.trim().split(/\s+/).slice(0, 18);
              if (words.length > 5) {
                instructions.push(words.join(' '));
              }
            }
          }
        }
        
        // If no instructions found, use the step text itself
        if (instructions.length === 0 && stepText.length > 0) {
          const words = stepText.split(/\s+/).slice(0, 18);
          if (words.length > 5) {
            instructions.push(words.join(' '));
          }
        }
        
        result.steps.push({
          timestamp,
          title: title || 'Step',
          instructions: instructions.length > 0 ? instructions : ['Follow the video instructions at this timestamp'],
          context: stepText
        });
      }
    }
    
    // Parse chapters
    if (inChapterSection && line.match(/^\d+:\d+\s/)) {
      const chapterMatch = line.match(/^(\d+:\d+)\s(.+)/);
      if (chapterMatch) {
        const timestamp = parseTimestamp(chapterMatch[1]);
        const title = chapterMatch[2].trim();
        result.chapters.push({ timestamp, title });
      }
    }
  }
  
  return result;
}

function parseTimestamp(timestampStr: string): number {
  const parts = timestampStr.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}
