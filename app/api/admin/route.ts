import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const userId = searchParams.get('userId')

  // Verify admin
  if (userId) {
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('is_admin').eq('id', userId).single()
    if (!(profile as { is_admin?: boolean } | null)?.is_admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
  }

  if (action === 'users') {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('id, name, role, country, created_at, last_seen_at')
      .order('last_seen_at', { ascending: false })
    return NextResponse.json(data)
  }

  if (action === 'usage') {
    const { data } = await supabaseAdmin
      .from('usage_log')
      .select('user_id, created_at, profiles(name, country)')
      .order('created_at', { ascending: false })
      .limit(200)
    return NextResponse.json(data)
  }

  if (action === 'knowledge') {
    const { data } = await supabaseAdmin
      .from('knowledge')
      .select('*, profiles(name, country)')
      .order('created_at', { ascending: false })
      .limit(100)
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// Make a user admin or delete knowledge
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, targetId, requesterId } = body

  const { data: requester, error: requesterError } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', requesterId)
    .single() as { data: { is_admin: boolean } | null; error: unknown }

  if (requesterError || !requester?.is_admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  if (action === 'make_admin') {
    await (supabaseAdmin.from('profiles') as any)
      .update({ is_admin: true })
      .eq('id', targetId)

    return NextResponse.json({ success: true })
  }

  if (action === 'delete_knowledge') {
    await supabaseAdmin.from('knowledge').delete().eq('id', targetId)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
