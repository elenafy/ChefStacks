import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { recipeId, recipeTitle, recipeUrl, userEmail, message } = await req.json()

    // Validate required fields
    if (!recipeId || !recipeTitle || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Prepare email content
    const emailSubject = `Recipe Issue Report - ${recipeTitle}`
    const emailBody = `
A user has reported an issue with a recipe on Chef Stacks.

Recipe Details:
- ID: ${recipeId}
- Title: ${recipeTitle}
- URL: ${recipeUrl || 'N/A'}

User Details:
- Email: ${userEmail || 'Anonymous'}

Issue Description:
${message}

---
This report was submitted from the Chef Stacks application.
    `.trim()

    // Try to send email via webhook if configured
    const webhookUrl = process.env.REPORT_ISSUE_WEBHOOK_URL
    
    if (webhookUrl) {
      try {
        const webhookResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: 'support@chefstacks.com',
            subject: emailSubject,
            body: emailBody,
            from: 'noreply@chefstacks.com',
            recipeId,
            recipeTitle,
            recipeUrl,
            userEmail
          })
        })

        if (!webhookResponse.ok) {
          throw new Error('Webhook failed')
        }
      } catch (error) {
        console.error('Webhook email failed, falling back to logging:', error)
        // Fall through to logging
      }
    }

    // For development/testing or as fallback, log the email content
    console.log('=== RECIPE ISSUE REPORT ===')
    console.log('To: support@chefstacks.com')
    console.log('Subject:', emailSubject)
    console.log('Body:', emailBody)
    console.log('========================')

    return NextResponse.json({ 
      success: true, 
      message: 'Report submitted successfully' 
    })

  } catch (error) {
    console.error('Error submitting report:', error)
    return NextResponse.json(
      { error: 'Failed to submit report' },
      { status: 500 }
    )
  }
}
