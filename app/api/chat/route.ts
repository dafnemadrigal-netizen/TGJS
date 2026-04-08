import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { geminiModel, extractInsights, generateTitle, toGeminiHistory } from '@/lib/gemini'
import { buildSystemPrompt } from '@/lib/system-prompt'
import { Part } from '@google/generative-ai'

const MONTHLY_LIMIT = parseInt(process.env.MONTHLY_QUERY_LIMIT || '200')

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, conversationId, message, fileData } = body

    if (!userId || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // ── 1. Get user profile ──
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // ── 2. Check monthly usage ──
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const { count } = await supabaseAdmin
      .from('usage_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', monthStart.toISOString())

    if ((count || 0) >= MONTHLY_LIMIT) {
      return NextResponse.json({
        error: 'LIMIT_REACHED',
        message: `Has alcanzado el límite de ${MONTHLY_LIMIT} consultas este mes.`
      }, { status: 429 })
    }

    // ── 3. Get or create conversation ──
    let convId = conversationId
    if (!convId) {
      const { data: newConv } = await supabaseAdmin
        .from('conversations')
        .insert({ user_id: userId, title: 'Nueva consulta' })
        .select()
        .single()
      convId = newConv?.id
    }

    // ── 4. Load conversation history ──
    const { data: history } = await supabaseAdmin
      .from('messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(20)

    // ── 5. Load personal memory ──
    const { data: personalMemory } = await supabaseAdmin
      .from('knowledge')
      .select('insight')
      .eq('created_by', userId)
      .eq('source', 'conversation')
      .order('created_at', { ascending: false })
      .limit(15)

    // ── 6. Load shared knowledge ──
    const { data: sharedKnowledge } = await supabaseAdmin
      .from('knowledge')
      .select('insight')
      .neq('created_by', userId)
      .order('upvotes', { ascending: false })
      .limit(20)

    // ── 7. Build system prompt ──
    const systemPrompt = buildSystemPrompt({
      userName: profile.name,
      userRole: profile.role || '',
      userCountry: profile.country || '',
      personalMemory: (personalMemory || []).map(k => k.insight),
      sharedKnowledge: (sharedKnowledge || []).map(k => k.insight),
    })

    // ── 8. Build Gemini message parts ──
    const userParts: Part[] = []

    // Attach file data if any
    if (fileData && fileData.length > 0) {
      for (const file of fileData) {
        if (file.type === 'text') {
          userParts.push({ text: `[Archivo adjunto: ${file.name}]\n\n${file.content}` })
        } else if (file.type === 'image') {
          userParts.push({
            inlineData: {
              mimeType: file.mimeType,
              data: file.base64
            }
          })
        }
      }
    }

    userParts.push({ text: message })

    // ── 9. Call Gemini ──
    const geminiHistory = toGeminiHistory(history || [])

    const chat = geminiModel.startChat({
      systemInstruction: systemPrompt,
      history: geminiHistory,
    })

    const result = await chat.sendMessage(userParts)
    const reply = result.response.text()

    // ── 10. Save messages to DB ──
    const fileRefs = fileData?.map((f: { name: string; mimeType: string; size: number }) => ({
      name: f.name,
      type: f.mimeType,
      size: f.size || 0
    })) || []

    await supabaseAdmin.from('messages').insert([
      {
        conversation_id: convId,
        user_id: userId,
        role: 'user',
        content: message,
        file_refs: fileRefs
      },
      {
        conversation_id: convId,
        user_id: userId,
        role: 'assistant',
        content: reply,
        file_refs: []
      }
    ])

    // ── 11. Update conversation title if first message ──
    if (!history || history.length === 0) {
      const title = await generateTitle(message)
      await supabaseAdmin
        .from('conversations')
        .update({ title, updated_at: new Date().toISOString() })
        .eq('id', convId)
    } else {
      await supabaseAdmin
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', convId)
    }

    // ── 12. Log usage ──
    await supabaseAdmin.from('usage_log').insert({
      user_id: userId,
      conversation_id: convId,
      tokens_used: reply.length / 4 // rough estimate
    })

    // ── 13. Extract & save insights (background, non-blocking) ──
    extractInsights(message, reply).then(async (insights) => {
      if (insights.length === 0) return
      await supabaseAdmin.from('knowledge').insert(
        insights.map(insight => ({
          insight,
          source: 'conversation',
          country: profile.country,
          created_by: userId,
          tags: []
        }))
      )
    }).catch(() => {})

    // ── 14. Update last_seen_at ──
    await supabaseAdmin
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', userId)

    return NextResponse.json({
      reply,
      conversationId: convId,
      usageCount: (count || 0) + 1,
      usageLimit: MONTHLY_LIMIT,
    })

  } catch (error: unknown) {
    console.error('Chat API error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
