'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type Mode = 'login' | 'register'

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [country, setCountry] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    if (mode === 'register') {
      if (!name.trim()) { setError('El nombre es requerido'); setLoading(false); return }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email, password,
        options: {
          data: { name, role, country },
          emailRedirectTo: window.location.origin
        }
      })

      if (signUpError) { setError(signUpError.message); setLoading(false); return }

      // Insertar perfil manualmente — no dependemos del trigger
      if (data.user) {
        const { error: profileError } = await (supabase as any)
          .from('profiles')
          .insert({
            id: data.user.id,
            name: name.trim(),
            role: role.trim() || null,
            country: country || null,
            is_admin: false,
          })

        if (profileError) {
          // Si falla por duplicate key, el trigger ya lo creó — no es un error real
          if (!profileError.message.includes('duplicate') && !profileError.code?.includes('23505')) {
            console.error('Profile insert error:', profileError)
          }
        }
      }

      setMessage('¡Cuenta creada! Ahora puedes iniciar sesión.')
      setMode('login')

    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) { setError('Email o contraseña incorrectos'); setLoading(false); return }
    }

    setLoading(false)
  }

  const s = styles
  return (
    <div style={s.overlay}>
      <div style={s.card}>
        {/* Logo */}
        <div style={s.logo}>
          <div style={s.logoMark}>AP</div>
          <div>
            <div style={s.logoTitle}>AMPM People Strategy</div>
            <div style={s.logoSub}>Asesor estratégico interno · Good Jobs Framework</div>
          </div>
        </div>

        <div style={s.title}>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</div>
        <div style={s.desc}>
          {mode === 'login'
            ? 'Accede con tu cuenta de AMPM CAM.'
            : 'Crea tu cuenta para acceder al asesor estratégico.'}
        </div>

        {error && <div style={s.errorBox}>{error}</div>}
        {message && <div style={s.successBox}>{message}</div>}

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <>
              <div style={s.field}>
                <label style={s.label}>Nombre completo</label>
                <input style={s.input} type="text" placeholder="Ej. Pablo Andonie"
                  value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div style={s.field}>
                <label style={s.label}>Puesto</label>
                <input style={s.input} type="text" placeholder="Ej. Director de Operaciones"
                  value={role} onChange={e => setRole(e.target.value)} />
              </div>
              <div style={s.field}>
                <label style={s.label}>País principal</label>
                <select style={s.input} value={country} onChange={e => setCountry(e.target.value)}>
                  <option value="">Selecciona un país</option>
                  <option value="Nicaragua">Nicaragua</option>
                  <option value="Panamá">Panamá</option>
                  <option value="El Salvador">El Salvador</option>
                  <option value="Todos">Todos los países</option>
                </select>
              </div>
            </>
          )}

          <div style={s.field}>
            <label style={s.label}>Email</label>
            <input style={s.input} type="email" placeholder="tu@ampm.com"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div style={s.field}>
            <label style={s.label}>Contraseña</label>
            <input style={s.input} type="password" placeholder="Mínimo 6 caracteres"
              value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          </div>

          <button style={{ ...s.btn, opacity: loading ? 0.6 : 1 }} type="submit" disabled={loading}>
            {loading ? 'Cargando...' : mode === 'login' ? 'Entrar →' : 'Crear cuenta →'}
          </button>
        </form>

        <div style={s.toggle}>
          {mode === 'login' ? (
            <span>¿No tienes cuenta? <button style={s.link} onClick={() => setMode('register')}>Regístrate</button></span>
          ) : (
            <span>¿Ya tienes cuenta? <button style={s.link} onClick={() => setMode('login')}>Inicia sesión</button></span>
          )}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg)', padding: 20
  },
  card: {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20,
    padding: '40px 44px', maxWidth: 440, width: '100%',
    boxShadow: '0 40px 80px rgba(0,0,0,0.6)'
  },
  logo: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 },
  logoMark: {
    width: 44, height: 44, background: 'var(--accent)', borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 16, color: '#fff', flexShrink: 0
  },
  logoTitle: { fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, lineHeight: 1.2 },
  logoSub: { fontSize: 11, color: 'var(--muted)', marginTop: 2 },
  title: { fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 700, marginBottom: 8 },
  desc: { fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24 },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 7 },
  input: {
    width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 9, padding: '11px 14px', color: 'var(--text)',
    fontFamily: 'DM Sans, sans-serif', fontSize: 14, outline: 'none',
  },
  btn: {
    width: '100%', marginTop: 8, padding: 13, background: 'var(--accent)', border: 'none',
    borderRadius: 10, color: '#fff', fontFamily: 'Syne, sans-serif', fontWeight: 700,
    fontSize: 14, cursor: 'pointer', letterSpacing: 0.3
  },
  errorBox: {
    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--red)',
    marginBottom: 16, lineHeight: 1.5
  },
  successBox: {
    background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
    borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--green)',
    marginBottom: 16, lineHeight: 1.5
  },
  toggle: { textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--muted)' },
  link: { background: 'none', border: 'none', color: 'var(--accent2)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }
}
