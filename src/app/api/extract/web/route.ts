// src/app/api/extract/web/route.ts
export const runtime = "nodejs"; // needed for puppeteer
import { NextResponse } from "next/server";
import { extractRecipeFromWeb } from "@/lib/webRecipeExtractor.server";

export async function POST(req: Request) {
  const { url } = await req.json();
  
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }
  
  // Basic URL validation
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
  }
  
  try {
    const result = await extractRecipeFromWeb(url);
    const { hostname } = new URL(url);
    const domain = hostname.replace('www.', '');
    
    // Transform to expected format for backward compatibility
    const transformedResult = {
      url,
      recipe: {
        title: result.title,
        author: result.author,
        // Explicit source and link metadata
        source: 'web',
        source_url: url,
        web: {
          url,
          domain,
          author: result.author,
        },
        ingredients: result.ingredients.map(ing => ({
          line: ing.text,
          name: ing.text,
          qty: ing.qty,
          unit: ing.unit,
          from: ing.from
        })),
        steps: result.steps.map(step => ({
          step_no: step.order,
          text: step.text,
          from: step.from,
          image: step.image
        })),
        times: result.times,
        servings: result.servings,
        image: result.image,
        confidence: result.confidence,
        debug: result.debug
      }
    };
    
    return NextResponse.json(transformedResult);
  } catch (e: any) {
    console.error('Web recipe extraction error:', e);
    return NextResponse.json({ 
      error: e?.message ?? String(e) 
    }, { status: 500 });
  }
}
