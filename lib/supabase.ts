import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Browser client (uses anon key + RLS)
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  { auth: { persistSession: true } }
)

// Server/admin client (bypasses RLS — only use in API routes)
export const supabaseAdmin = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseServiceKey || 'placeholder',
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export function hasValidConfig() {
  return !!(supabaseUrl && supabaseAnonKey &&
    supabaseUrl !== 'https://placeholder.supabase.co')
}

export type Profile = {
  id: string
  name: string
  role: string
  country: string
  is_admin: boolean
  created_at: string
  last_seen_at: string
}

export type Conversation = {
  id: string
  user_id: string
  title: string
  created_at: string
  updated_at: string
}

export type Message = {
  id: string
  conversation_id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  file_refs: FileRef[]
  created_at: string
}

export type FileRef = {
  name: string
  type: string
  size: number
  url?: string
}

export type KnowledgeItem = {
  id: string
  insight: string
  source: string
  country: string
  tags: string[]
  created_at: string
}
