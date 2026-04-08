'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import type { User } from '@supabase/supabase-js'

// Dynamic imports to avoid SSR issues with browser-only libraries
const AuthScreen = dynamic(() => import('@/components/AuthScreen'), { ssr: false })
const ChatApp = dynamic(() => import('@/components/ChatApp'), { ssr: false })

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [envError, setEnvError] = useState('')

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || url === 'https://placeholder.supabase.co' || !key || key === 'placeholder') {
      setEnvError(
        `Variables de entorno faltantes en Vercel:\n` +
        `${!url ? '❌ NEXT_PUBLIC_SUPABASE_URL\n' : '✅ NEXT_PUBLIC_SUPABASE_URL\n'}` +
        `${!key ? '❌ NEXT_PUBLIC_SUPABASE_ANON_KEY' : '✅ NEXT_PUBLIC_SUPABASE_ANON_KEY'}`
      )
      setLoading(false)
      return
    }

    import('@/lib/supabase').then(({ supabase }) => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }).catch(err => {
        setEnvError('Error conectando con Supabase: ' + err.message)
        setLoading(false)
      })

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null)
      })
      return () => subscription.unsubscribe()
    }).catch(err => {
      setEnvError('Error cargando Supabase: ' + err.message)
      setLoading(false)
    })
  }, [])

  if (envError) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#0a0a0f', padding: 40, fontFamily: 'monospace'
      }}>
        <div style={{
          background: '#111118', border: '1px solid #ef4444', borderRadius: 12,
          padding: 32, maxWidth: 520, color: '#e8e8f0', width: '100%'
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#ef4444' }}>
            ⚠️ Error de configuración
          </div>
          <pre style={{
            fontSize: 13, color: '#9ca3af', lineHeight: 1.8, whiteSpace: 'pre-wrap',
            background: '#0a0a0f', padding: 16, borderRadius: 8, marginBottom: 16
          }}>{envError}</pre>
          <div style={{ fontSize: 12, color: '#6b6b80', lineHeight: 1.7 }}>
            Ve a <strong style={{ color: '#ff8c5a' }}>Vercel → Settings → Environment Variables</strong>
            {' '}y verifica que ambas variables estén configuradas para el entorno <strong style={{ color: '#ff8c5a' }}>Production</strong>.
            Luego redespliega.
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#0a0a0f', gap: 8
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 10, height: 10, borderRadius: '50%', background: '#ff4d1c',
            animation: `bounce 1.2s ${i * 0.2}s infinite`
          }} />
        ))}
        <style>{`
          @keyframes bounce {
            0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
            30% { transform: translateY(-10px); opacity: 1; }
          }
        `}</style>
      </div>
    )
  }

  if (!user) return <AuthScreen />
  return <ChatApp user={user} />
}
