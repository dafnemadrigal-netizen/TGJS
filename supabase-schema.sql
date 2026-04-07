-- ============================================================
-- AMPM People Strategy — Supabase Schema
-- Run this in Supabase → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ── USERS (extends Supabase auth.users) ──
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  role          TEXT,
  country       TEXT CHECK (country IN ('Nicaragua', 'Panamá', 'El Salvador', 'Todos')),
  is_admin      BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── CONVERSATIONS ──
CREATE TABLE IF NOT EXISTS public.conversations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       TEXT DEFAULT 'Nueva consulta',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── MESSAGES ──
CREATE TABLE IF NOT EXISTS public.messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  file_refs       JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── SHARED KNOWLEDGE (what the system learns about AMPM Nicaragua/CAM) ──
CREATE TABLE IF NOT EXISTS public.knowledge (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  insight     TEXT NOT NULL,
  source      TEXT,              -- 'conversation', 'document', 'manual'
  country     TEXT,
  tags        TEXT[],
  upvotes     INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  created_by  UUID REFERENCES public.profiles(id)
);

-- ── UPLOADED DOCUMENTS ──
CREATE TABLE IF NOT EXISTS public.documents (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  filetype     TEXT NOT NULL,
  size_bytes   INTEGER,
  storage_path TEXT,
  extracted_text TEXT,
  summary      TEXT,
  is_shared    BOOLEAN DEFAULT false,  -- shared with all users
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── USAGE TRACKING ──
CREATE TABLE IF NOT EXISTS public.usage_log (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id),
  tokens_used    INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── MONTHLY USAGE VIEW ──
CREATE OR REPLACE VIEW public.monthly_usage AS
SELECT
  user_id,
  DATE_TRUNC('month', created_at) AS month,
  COUNT(*) AS query_count,
  SUM(tokens_used) AS total_tokens
FROM public.usage_log
GROUP BY user_id, DATE_TRUNC('month', created_at);

-- ── ROW LEVEL SECURITY ──
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_log   ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own
CREATE POLICY "Users can view own profile"    ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"  ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles"  ON public.profiles FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- Conversations: own only
CREATE POLICY "Users own conversations"       ON public.conversations FOR ALL USING (auth.uid() = user_id);

-- Messages: own conversations only
CREATE POLICY "Users own messages"            ON public.messages FOR ALL USING (auth.uid() = user_id);

-- Knowledge: everyone can read, authenticated can insert
CREATE POLICY "Anyone can read knowledge"     ON public.knowledge FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can add knowledge" ON public.knowledge FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Documents: own + shared
CREATE POLICY "Users own documents"           ON public.documents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can read shared docs"    ON public.documents FOR SELECT USING (is_shared = true AND auth.role() = 'authenticated');

-- Usage: own only
CREATE POLICY "Users own usage"               ON public.usage_log FOR ALL USING (auth.uid() = user_id);

-- ── FUNCTION: Auto-create profile on signup ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role, country)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'role',
    NEW.raw_user_meta_data->>'country'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── TRIGGER ──
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── STORAGE BUCKET for file uploads ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT DO NOTHING;

-- Storage policy
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'documents' AND auth.role() = 'authenticated');

CREATE POLICY "Users can read own files"
ON storage.objects FOR SELECT
USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);
