import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { callGeminiRest } from '@/lib/gemini'
import { buildSystemPrompt } from '@/lib/system-prompt'

const MONTHLY_LIMIT = parseInt(process.env.MONTHLY_QUERY_LIMIT || '200')

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, conversationId, message, fileData } = body

    if (!userId || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 1. Get user profile
    const { data: profile, error: profileError } = await (supabaseAdmin.from('profiles') as any)
      .select('*')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // 2. Check monthly usage
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const { count } = await (supabaseAdmin.from('usage_log') as any)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', monthStart.toISOString())

    if ((count || 0) >= MONTHLY_LIMIT) {
      return NextResponse.json(
        {
          error: 'LIMIT_REACHED',
          message: `Has alcanzado el límite de ${MONTHLY_LIMIT} consultas este mes.`,
        },
        { status: 429 }
      )
    }

    // 3. Get or create conversation
    let convId = conversationId

    if (!convId) {
      const { data: newConv } = await (supabaseAdmin.from('conversations') as any)
        .insert({ user_id: userId, title: 'Nueva consulta' })
        .select()
        .single()

      convId = newConv?.id
    }

    if (!convId) {
      return NextResponse.json({ error: 'Could not create conversation' }, { status: 500 })
    }

    // 4. Load conversation history
    const { data: history } = await (supabaseAdmin.from('messages') as any)
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(20)

    // 5. Load personal memory
    const { data: personalMemory } = await (supabaseAdmin.from('knowledge') as any)
      .select('insight')
      .eq('created_by', userId)
      .eq('source', 'conversation')
      .order('created_at', { ascending: false })
      .limit(15)

    // 6. Load shared knowledge
    const { data: sharedKnowledge } = await (supabaseAdmin.from('knowledge') as any)
      .select('insight')
      .neq('created_by', userId)
      .order('upvotes', { ascending: false })
      .limit(20)

    // 7. Build system prompt
    const systemPrompt = buildSystemPrompt({
      userName: profile.name,
      userRole: profile.role || '',
      userCountry: profile.country || '',
      personalMemory: (personalMemory || []).map((k: any) => k.insight),
      sharedKnowledge: (sharedKnowledge || []).map((k: any) => k.insight),
    })

    // 8. Build prompt for Gemini REST
    let fileContext = ''

    if (fileData && fileData.length > 0) {
      for (const file of fileData) {
        if (file.type === 'text' && file.content) {
          const truncated = file.content && file.content.length > 8000 ? file.content.slice(0, 8000) + '\n...[truncado]' : file.content
          fileContext += `\n\n[Archivo adjunto: ${file.name}]\n${truncated}`
        } else if (file.type === 'image') {
          fileContext += `\n\n[Imagen adjunta: ${file.name}]`
        }
      }
    }

    const recentHistory = (history || []).slice(-6)
    const historyText = recentHistory
      .map((m: any) => {
        const role = m.role === 'assistant' ? 'Asistente' : 'Usuario'
        const content = m.content.length > 800 ? m.content.slice(0, 800) + '...' : m.content
        return `${role}: ${content}`
      })
      .join('\n\n')

    const fullPrompt = `
${systemPrompt}

Historial reciente:
${historyText || 'Sin historial previo.'}

${fileContext ? `Contexto de archivos:\n${fileContext}\n` : ''}

Mensaje actual del usuario:
${message}

Responde en español, con enfoque estratégico, práctico y útil para AMPM CAM.
`.trim()

    // Retry up to 3 times for high-demand errors
    let reply = ''
    let lastError = ''
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        reply = await callGeminiRest(fullPrompt, 8000)
        break
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : 'Unknown error'
        const isOverloaded = lastError.includes('high demand') || lastError.includes('overloaded') || lastError.includes('503') || lastError.includes('429')
        if (isOverloaded && attempt < 3) {
          await new Promise(res => setTimeout(res, attempt * 3000))
          continue
        }
        throw err
      }
    }

    // 9. Save messages to DB
    const fileRefs =
      fileData?.map((f: any) => ({
        name: f.name,
        type: f.mimeType,
        size: f.size || 0,
      })) || []

    await (supabaseAdmin.from('messages') as any).insert([
      {
        conversation_id: convId,
        user_id: userId,
        role: 'user',
        content: message,
        file_refs: fileRefs,
      },
      {
        conversation_id: convId,
        user_id: userId,
        role: 'assistant',
        content: reply || 'No se recibió respuesta del modelo.',
        file_refs: [],
      },
    ])

    // 10. Update conversation title or timestamp
    if (!history || history.length === 0) {
      const title = message.slice(0, 60) || 'Nueva consulta'
      await (supabaseAdmin.from('conversations') as any)
        .update({ title, updated_at: new Date().toISOString() })
        .eq('id', convId)
    } else {
      await (supabaseAdmin.from('conversations') as any)
        .update({ updated_at: new Date().toISOString() })
        .eq('id', convId)
    }

    // 11. Log usage
    await (supabaseAdmin.from('usage_log') as any).insert({
      user_id: userId,
      conversation_id: convId,
      tokens_used: Math.ceil((reply || '').length / 4),
    })

    // 12. Update last_seen_at
    await (supabaseAdmin.from('profiles') as any)
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