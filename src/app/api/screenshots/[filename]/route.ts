// Screenshot serving API endpoint
import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const screenshotsDir = path.join(process.cwd(), "public", "screenshots");
    const filePath = path.join(screenshotsDir, filename);
    
    // Security check: ensure the file is within the screenshots directory
    const resolvedPath = path.resolve(filePath);
    const resolvedDir = path.resolve(screenshotsDir);
    
    if (!resolvedPath.startsWith(resolvedDir)) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }
    
    const fileBuffer = await fs.readFile(filePath);
    const ext = path.extname(filename).toLowerCase();
    
    let contentType = "image/jpeg"; // default
    if (ext === ".png") {
      contentType = "image/png";
    } else if (ext === ".webp") {
      contentType = "image/webp";
    }
    
    return new Response(fileBuffer as any, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400", // Cache for 24 hours
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Screenshot not found" }, { status: 404 });
  }
}
