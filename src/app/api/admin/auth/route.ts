import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// Admin authentication - requires ADMIN_PASSWORD environment variable
// In production, this MUST be set via environment variables
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Fail fast if admin password is not set in production
if (!ADMIN_PASSWORD && process.env.NODE_ENV === 'production') {
  throw new Error('ADMIN_PASSWORD environment variable must be set in production');
}

export async function POST(req: NextRequest) {
  try {
    // Check if admin password is configured
    if (!ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: "Admin authentication not configured" },
        { status: 500 }
      );
    }
    
    const { password } = await req.json();
    
    if (password === ADMIN_PASSWORD) {
      // Set HTTP-only cookie for session management
      const cookieStore = await cookies();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      cookieStore.set('adminSession', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: expiresAt,
        path: '/'
      });
      
      return NextResponse.json({ 
        success: true, 
        message: "Authentication successful" 
      });
    } else {
      return NextResponse.json(
        { error: "Invalid password" },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete('adminSession');
    
    return NextResponse.json({ 
      success: true, 
      message: "Logged out successfully" 
    });
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
