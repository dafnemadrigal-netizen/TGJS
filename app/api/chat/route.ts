import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildSystemPrompt } from '@/lib/system-prompt'

const MONTHLY_LIMIT = parseInt(process.env.MONTHLY_QUERY_LIMIT || '200')
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!
const GEMINI_MODEL = 'gemini-2.5-flash'

// ── Direct Gemini REST call (avoids SDK system_instruction format issues) ──
async function callGemini(
  history: { role: string; content: string }[],
  systemPrompt: string,
  newMessageParts: { text?: string; inlineData?: { mimeType: string; data: string } }[],
  maxTokens = 2048
): Promise<string> {
  // Convert history to Gemini format
  const contents = [
    ...history.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    })),
    { role: 'user', parts: newMessageParts }
  ]

  const body = {
    system_instruction: {
      parts: [{ text: systemPrompt }]
    },
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.7
    }
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data?.error?.message || `Gemini error ${res.status}`)
  }

  return data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || ''
}

// ── Mini call for memory extraction and title generation ──
async function callGeminiMini(prompt: string): Promise<string> {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 300, temperature: 0.3 }
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || ''
}

async function extractInsights(userMsg: string, aiReply: string): Promise<string[]> {
  const prompt = `Eres un sistema de memoria para AMPM CAM.
Dado este intercambio:
USUARIO: ${userMsg.slice(0, 800)}
ASESOR: ${aiReply.slice(0, 1200)}
Extrae 1-3 aprendizajes concisos (máximo 20 palabras cada uno) sobre problemas, decisiones, datos o contexto operativo relevante de AMPM CAM.
Responde SOLO con un JSON array de strings. Si no hay nada relevante: []`
  try {
    const raw = (await callGeminiMini(prompt)).trim().replace(/```json|```/g, '')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

async function generateTitle(firstMessage: string): Promise<string> {
  const prompt = `Resume este mensaje en máximo 6 palabras como título. Solo el título, sin comillas ni puntuación final.\n\nMensaje: ${firstMessage.slice(0, 200)}`
  try {
    return (await callGeminiMini(prompt)).trim().slice(0, 60)
  } catch { return firstMessage.slice(0, 50) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, conversationId, message, fileData } = body

    if (!userId || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // ── 1. Get user profile ──
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles').select('*').eq('id', userId).single()
    if (profileError || !profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // ── 2. Check monthly usage ──
    const monthStart = new Date()
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
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
        .select().single()
      convId = newConv?.id
    }

    // ── 4. Load conversation history (last 20 messages) ──
    const { data: history } = await supabaseAdmin
      .from('messages').select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true }).limit(20)

    // ── 5. Load personal memory ──
    const { data: personalMemory } = await supabaseAdmin
      .from('knowledge').select('insight')
      .eq('created_by', userId).eq('source', 'conversation')
      .order('created_at', { ascending: false }).limit(15)

    // ── 6. Load shared knowledge ──
    const { data: sharedKnowledge } = await supabaseAdmin
      .from('knowledge').select('insight')
      .neq('created_by', userId)
      .order('upvotes', { ascending: false }).limit(20)

    // ── 7. Build system prompt ──
    const systemPrompt = buildSystemPrompt({
      userName: profile.name,
      userRole: profile.role || '',
      userCountry: profile.country || '',
      personalMemory: (personalMemory || []).map(k => k.insight),
      sharedKnowledge: (sharedKnowledge || []).map(k => k.insight),
    })

    // ── 8. Build message parts for this turn ──
    const userParts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = []

    if (fileData && fileData.length > 0) {
      for (const file of fileData) {
        if (file.type === 'text' && file.content) {
          userParts.push({ text: `[Archivo adjunto: ${file.name}]\n\n${file.content}` })
        } else if (file.type === 'image' && file.base64) {
          userParts.push({ inlineData: { mimeType: file.mimeType, data: file.base64 } })
        }
      }
    }
    userParts.push({ text: message })

    // ── 9. Call Gemini ──
    const reply = await callGemini(history || [], systemPrompt, userParts)

    // ── 10. Save messages ──
    const fileRefs = (fileData || []).map((f: { name: string; mimeType: string; size?: number }) => ({
      name: f.name, type: f.mimeType, size: f.size || 0
    }))

    await supabaseAdmin.from('messages').insert([
      { conversation_id: convId, user_id: userId, role: 'user', content: message, file_refs: fileRefs },
      { conversation_id: convId, user_id: userId, role: 'assistant', content: reply, file_refs: [] }
    ])

    // ── 11. Update conversation title if first message ──
    if (!history || history.length === 0) {
      const title = await generateTitle(message)
      await supabaseAdmin.from('conversations')
        .update({ title, updated_at: new Date().toISOString() }).eq('id', convId)
    } else {
      await supabaseAdmin.from('conversations')
        .update({ updated_at: new Date().toISOString() }).eq('id', convId)
    }

    // ── 12. Log usage ──
    await supabaseAdmin.from('usage_log').insert({
      user_id: userId, conversation_id: convId,
      tokens_used: Math.round(reply.length / 4)
    })

    // ── 13. Extract insights (background, non-blocking) ──
    extractInsights(message, reply).then(async (insights) => {
      if (!insights.length) return
      await supabaseAdmin.from('knowledge').insert(
        insights.map(insight => ({
          insight, source: 'conversation',
          country: profile.country, created_by: userId, tags: []
        }))
      )
    }).catch(() => {})

    // ── 14. Update last_seen ──
    await supabaseAdmin.from('profiles')
      .update({ last_seen_at: new Date().toISOString() }).eq('id', userId)

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
