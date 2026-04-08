import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Singleton pattern — prevents "Multiple GoTrueClient instances" warning
const globalForSupabase = globalThis as unknown as {
  supabase: ReturnType<typeof createClient> | undefined
  supabaseAdmin: ReturnType<typeof createClient> | undefined
}

export const supabase =
  globalForSupabase.supabase ??
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, storageKey: 'ampm-auth' }
  })

if (process.env.NODE_ENV !== 'production') {
  globalForSupabase.supabase = supabase
}

export const supabaseAdmin =
  globalForSupabase.supabaseAdmin ??
  createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

if (process.env.NODE_ENV !== 'production') {
  globalForSupabase.supabaseAdmin = supabaseAdmin
}

export function hasValidConfig() {
  return !!(supabaseUrl && supabaseAnonKey)
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