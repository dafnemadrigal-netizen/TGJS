'use client'
import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile, Conversation, Message } from '@/lib/supabase'

// Simple markdown renderer - no external deps
function SimpleMarkdown({ text }: { text: string }) {
  const html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^─+$/gm, '<hr/>').replace(/^═+$/gm, '<hr/>')
    .replace(/^\* (.+)$/gm, '<li>$1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^• (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
  return (
    <div
      className="markdown"
      style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--text)' }}
      dangerouslySetInnerHTML={{ __html: `<p>${html}</p>` }}
    />
  )
}

type PendingFile = {
  name: string
  type: 'image' | 'text'
  mimeType: string
  size: number
  extractedText?: string
  base64?: string
  previewUrl?: string
}

const QUICK_PROMPTS = [
  'Tenemos rotación alta en tiendas. ¿Cómo diagnostico la causa raíz?',
  '¿Qué dice Zeynep Ton sobre los puestos de alta rotación en retail?',
  'Quiero un roadmap Good Jobs Strategy para AMPM Nicaragua.',
  '¿Qué haría QuikTrip en nuestra situación de crecimiento?',
  '¿Cómo mejorar la experiencia del cliente sin aumentar headcount?',
  'Problemas de cobertura en turnos nocturnos. ¿Qué hacer?',
]

export default function ChatApp({ user }: { user: User }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [usage, setUsage] = useState({ count: 0, limit: 200 })
  const [activeCountry, setActiveCountry] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showProfile, setShowProfile] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', user.id).single()
      .then(({ data }) => {
        if (data) {
          setProfile(data)
          setActiveCountry(data.country || '')
          // If profile has no name, show the modal right away
          if (!data.name) setShowProfile(true)
        }
      })
    loadConversations()
    loadUsage()
  }, [user.id])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function loadConversations() {
    const { data } = await supabase
      .from('conversations').select('*').eq('user_id', user.id)
      .order('updated_at', { ascending: false }).limit(30)
    setConversations(data || [])
  }

  async function loadUsage() {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
    const { count } = await supabase
      .from('usage_log').select('*', { count: 'exact', head: true })
      .eq('user_id', user.id).gte('created_at', monthStart.toISOString())
    setUsage(u => ({ ...u, count: count || 0 }))
  }

  async function loadMessages(convId: string) {
    const { data } = await supabase
      .from('messages').select('*').eq('conversation_id', convId)
      .order('created_at', { ascending: true })
    setMessages(data || [])
  }

  async function selectConversation(conv: Conversation) {
    setActiveConvId(conv.id)
    await loadMessages(conv.id)
  }

  function newConversation() {
    setActiveConvId(null)
    setMessages([])
    setPendingFiles([])
    setInput('')
  }

  async function saveProfile() {
    const name = (document.getElementById('profile-name') as HTMLInputElement)?.value.trim()
    const role = (document.getElementById('profile-role') as HTMLInputElement)?.value.trim()
    const country = (document.getElementById('profile-country') as HTMLSelectElement)?.value
    if (!name) return
    await supabase.from('profiles').update({ name, role, country }).eq('id', user.id)
    setProfile(p => p ? { ...p, name, role, country } : p)
    setActiveCountry(country)
    setShowProfile(false)
  }

  async function handleFileUpload(files: FileList) {
    if (!files.length) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('userId', user.id)
        formData.append('isShared', 'false')
        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        const data = await res.json()
        if (data.error) { alert('Error subiendo archivo: ' + data.error); continue }
        setPendingFiles(prev => [...prev, {
          name: data.name, type: data.type, mimeType: data.mimeType,
          size: data.size, extractedText: data.extractedText,
          base64: data.base64,
          previewUrl: data.type === 'image' ? `data:${data.mimeType};base64,${data.base64}` : undefined
        }])
      }
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function sendMessage() {
    const text = input.trim()
    if ((!text && pendingFiles.length === 0) || loading) return
    if (usage.count >= usage.limit) return

    const displayText = text || '(Ver archivos adjuntos)'
    const filesToSend = [...pendingFiles]
    setInput('')
    setPendingFiles([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // Optimistic UI
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`, conversation_id: activeConvId || '',
      user_id: user.id, role: 'user', content: displayText,
      file_refs: filesToSend.map(f => ({ name: f.name, type: f.mimeType, size: f.size })),
      created_at: new Date().toISOString()
    }
    setMessages(prev => [...prev, optimisticMsg])
    setLoading(true)

    try {
      const prefix = activeCountry ? `[País: ${activeCountry}]\n\n` : ''
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          conversationId: activeConvId,
          message: prefix + (text || 'Analiza los archivos adjuntos desde una perspectiva de personas y operaciones AMPM CAM.'),
          fileData: filesToSend.map(f => ({
            name: f.name, type: f.type, mimeType: f.mimeType,
            size: f.size, content: f.extractedText, base64: f.base64
          }))
        })
      })

      const data = await res.json()

      if (data.error === 'LIMIT_REACHED') {
        setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id))
        alert(data.message); return
      }
      if (data.error) throw new Error(data.error)

      if (!activeConvId) {
        setActiveConvId(data.conversationId)
        await loadConversations()
      }
      await loadMessages(data.conversationId)
      setUsage({ count: data.usageCount, limit: data.usageLimit })

    } catch (err: unknown) {
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id))
      alert('Error: ' + (err instanceof Error ? err.message : 'Error desconocido'))
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 150) + 'px'
  }

  const usagePct = Math.min(100, (usage.count / usage.limit) * 100)
  const usageColor = usagePct >= 100 ? 'var(--red)' : usagePct >= 75 ? 'var(--yellow)' : 'var(--green)'
  const initials = profile?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??'
  const firstName = profile?.name?.split(' ')[0] || ''

  return (
    <div style={s.root}>

      {/* ── PROFILE MODAL ── */}
      {showProfile && (
        <div style={s.modalOverlay}>
          <div style={s.modalCard}>
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 20, marginBottom: 6 }}>
              Mi perfil
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>
              Esta información personaliza las respuestas del asesor.
            </div>
            {[
              { label: 'Nombre completo', id: 'profile-name', placeholder: 'Ej. Dafne Madrigal', defaultValue: profile?.name || '' },
              { label: 'Puesto', id: 'profile-role', placeholder: 'Ej. Directora de Operaciones', defaultValue: profile?.role || '' },
            ].map(({ label, id, placeholder, defaultValue }) => (
              <div key={id} style={{ marginBottom: 14 }}>
                <label style={s.fieldLabel}>{label}</label>
                <input id={id} defaultValue={defaultValue} placeholder={placeholder} style={s.fieldInput} />
              </div>
            ))}
            <div style={{ marginBottom: 24 }}>
              <label style={s.fieldLabel}>País principal</label>
              <select id="profile-country" defaultValue={profile?.country || ''} style={s.fieldInput}>
                <option value="">Selecciona un país</option>
                <option value="Nicaragua">Nicaragua</option>
                <option value="Panamá">Panamá</option>
                <option value="El Salvador">El Salvador</option>
                <option value="Todos">Todos los países</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={s.primaryBtn} onClick={saveProfile}>Guardar cambios</button>
              <button style={s.secondaryBtn} onClick={() => setShowProfile(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <header style={s.header}>
        <div style={s.headerLeft}>
          <button style={s.menuBtn} onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
          <div style={s.logoBadge}>AP</div>
          <div>
            <div style={s.logoTitle}>AMPM People Strategy</div>
            <div style={s.logoSub}>Good Jobs Framework · Asesor estratégico</div>
          </div>
        </div>
        <div style={s.headerRight}>
          {/* Usage badge */}
          <div style={{ ...s.usageBadge, borderColor: usageColor + '44', color: usageColor }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: usageColor }} />
            <span>{usage.count} / {usage.limit} este mes</span>
          </div>
          {/* Profile chip */}
          <div style={s.userChip} onClick={() => setShowProfile(true)} title="Editar perfil">
            <div style={s.userAvatar}>{initials}</div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.2 }}>
                {profile?.name || 'Mi perfil'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                {profile?.country || 'Sin país'} · editar
              </div>
            </div>
          </div>
          {/* Logout button */}
          <button
            onClick={() => supabase.auth.signOut()}
            style={s.logoutBtn}
            title="Cerrar sesión"
          >
            ↩ Salir
          </button>
        </div>
      </header>

      <div style={s.main}>
        {/* ── SIDEBAR ── */}
        {sidebarOpen && (
          <aside style={s.sidebar}>
            {/* Country filter */}
            <div style={s.sideSection}>
              <div style={s.sideLabel}>País</div>
              {[['', '🌎', 'Todos'], ['Nicaragua', '🇳🇮', 'Nicaragua'], ['Panamá', '🇵🇦', 'Panamá'], ['El Salvador', '🇸🇻', 'El Salvador']].map(([val, flag, label]) => (
                <div key={val}
                  style={{ ...s.chip, ...(activeCountry === val ? s.chipActive : {}) }}
                  onClick={() => setActiveCountry(val)}>
                  <span>{flag}</span> {label}
                </div>
              ))}
            </div>

            {/* New conversation */}
            <div style={s.sideSection}>
              <button style={s.newChatBtn} onClick={newConversation}>✦ Nueva consulta</button>
            </div>

            {/* Conversation history */}
            <div style={{ ...s.sideSection, flex: 1, overflowY: 'auto' }}>
              <div style={s.sideLabel}>Conversaciones recientes</div>
              {conversations.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                  Sin conversaciones aún
                </div>
              )}
              {conversations.map(conv => (
                <div key={conv.id}
                  style={{ ...s.convItem, ...(activeConvId === conv.id ? s.convItemActive : {}) }}
                  onClick={() => selectConversation(conv)}>
                  <div style={{ fontSize: 12, color: activeConvId === conv.id ? 'var(--text)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conv.title}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                    {new Date(conv.updated_at).toLocaleDateString('es', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              ))}
            </div>

            {/* Quick prompts */}
            <div style={s.sideSection}>
              <div style={s.sideLabel}>Preguntas rápidas</div>
              {QUICK_PROMPTS.map((p, i) => (
                <button key={i} style={s.quickBtn}
                  onClick={() => { setInput(p); textareaRef.current?.focus() }}>
                  {p}
                </button>
              ))}
            </div>

            {/* Usage bar */}
            <div style={s.sideSection}>
              <div style={s.sideLabel}>Uso mensual</div>
              <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: usagePct + '%', background: usageColor, borderRadius: 3, transition: 'width .4s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11, color: 'var(--muted)' }}>
                <span>{usage.count} usadas</span>
                <span>límite: {usage.limit}</span>
              </div>
            </div>
          </aside>
        )}

        {/* ── CHAT AREA ── */}
        <div style={s.chatArea}>
          <div style={s.messages}>

            {/* Welcome screen */}
            {messages.length === 0 && (
              <div style={s.welcome}>
                <div style={s.welcomeIcon}>⚡</div>
                <h2 style={s.welcomeTitle}>
                  {firstName ? `Hola, ${firstName} 👋` : '¿En qué puedo ayudarte hoy?'}
                </h2>
                <p style={s.welcomeDesc}>
                  Soy tu asesor estratégico de personas para AMPM CAM. Analizo problemas
                  operativos usando Good Jobs Strategy, los libros de Zeynep Ton y los casos Harvard.
                  Puedo leer imágenes, Excel y PDFs.
                </p>
                <div style={s.chipRow}>
                  {['Alta rotación en tiendas', 'Cobertura de turnos', 'Roadmap Good Jobs',
                    'Mala experiencia del cliente', 'Liderazgo en tienda', 'Sobrecarga operativa'].map(c => (
                      <div key={c} style={s.welcomeChip}
                        onClick={() => { setInput(c); textareaRef.current?.focus() }}>
                        {c}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map(msg => (
              <div key={msg.id} style={s.messageRow}>
                <div style={{ ...s.avatar, ...(msg.role === 'assistant' ? s.avatarAI : s.avatarUser) }}>
                  {msg.role === 'assistant' ? 'AP' : initials}
                </div>
                <div style={s.msgContent}>
                  <div style={s.msgRole}>
                    {msg.role === 'assistant' ? 'AMPM People Strategy' : (profile?.name || 'Tú')}
                  </div>
                  {/* File attachments */}
                  {msg.file_refs && msg.file_refs.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {msg.file_refs.map((f, i) => (
                        <div key={i} style={s.fileChip}>
                          {/\.(jpg|jpeg|png|gif|webp)$/i.test(f.name) ? '🖼️'
                            : /\.pdf$/i.test(f.name) ? '📕'
                              : /\.csv$/i.test(f.name) ? '📄' : '📊'} {f.name}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={s.msgText}>
                    {msg.role === 'assistant'
                      ? <SimpleMarkdown text={msg.content} />
                      : <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                    }
                  </div>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div style={s.messageRow}>
                <div style={{ ...s.avatar, ...s.avatarAI }}>AP</div>
                <div style={s.msgContent}>
                  <div style={s.msgRole}>AMPM People Strategy</div>
                  <div style={{ display: 'flex', gap: 5, padding: '10px 0', alignItems: 'center' }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{
                        width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)',
                        animation: `bounce 1.2s ${i * 0.2}s infinite`
                      }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ── INPUT AREA ── */}
          <div style={s.inputArea}>
            {usage.count >= usage.limit && (
              <div style={s.limitBanner}>
                🚫 Has alcanzado el límite de {usage.limit} consultas este mes.
                Se restablecerá automáticamente el 1 del próximo mes.
              </div>
            )}

            {/* File previews */}
            {pendingFiles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 8 }}>
                {pendingFiles.map((f, i) => (
                  <div key={i} style={s.filePrev}>
                    {f.previewUrl
                      ? <img src={f.previewUrl} alt={f.name} style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4 }} />
                      : <span style={{ fontSize: 16 }}>
                        {/\.pdf$/i.test(f.name) ? '📕' : /\.csv$/i.test(f.name) ? '📄' : '📊'}
                      </span>
                    }
                    <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {f.name}
                    </span>
                    <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}
                      onClick={() => setPendingFiles(prev => prev.filter((_, pi) => pi !== i))}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <div style={s.inputWrapper}>
              <button style={s.attachBtn}
                onClick={() => fileInputRef.current?.click()}
                title="Adjuntar archivo"
                disabled={uploading}>
                {uploading ? '⏳' : '📎'}
              </button>
              <input ref={fileInputRef} type="file" style={{ display: 'none' }}
                accept="image/*,.xlsx,.xls,.csv,.pdf,.txt,.md" multiple
                onChange={e => e.target.files && handleFileUpload(e.target.files)} />
              <textarea
                ref={textareaRef}
                style={{ ...s.textarea, opacity: usage.count >= usage.limit ? 0.4 : 1 }}
                placeholder="Describe el problema, sube un Excel de rotación, una imagen, un PDF..."
                value={input}
                onChange={e => { setInput(e.target.value); autoResize(e.target) }}
                onKeyDown={handleKeyDown}
                disabled={loading || usage.count >= usage.limit}
                rows={1}
              />
              <button
                style={{ ...s.sendBtn, opacity: (loading || (!input.trim() && pendingFiles.length === 0)) ? 0.4 : 1 }}
                onClick={sendMessage}
                disabled={loading || usage.count >= usage.limit}>
                ↑
              </button>
            </div>
            <div style={s.inputHint}>
              Enter para enviar · Shift+Enter para nueva línea · 📎 para adjuntar imagen, Excel o PDF
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce { 0%,60%,100%{transform:translateY(0);opacity:.4} 30%{transform:translateY(-7px);opacity:1} }
        input:focus, textarea:focus, select:focus { border-color: var(--accent) !important; outline: none; }
      `}</style>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' },

  // Modal
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, backdropFilter: 'blur(4px)' },
  modalCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, width: 400, maxWidth: '92vw', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' },
  fieldLabel: { display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: 'var(--muted)', marginBottom: 6 },
  fieldInput: { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontFamily: 'DM Sans, sans-serif', fontSize: 14, outline: 'none' },
  primaryBtn: { flex: 1, padding: 11, background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  secondaryBtn: { padding: '11px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', fontSize: 13 },

  // Header
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0, gap: 12 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  menuBtn: { background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18, padding: '4px 8px', borderRadius: 6 },
  logoBadge: { width: 32, height: 32, background: 'var(--accent)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 12, color: '#fff', flexShrink: 0 },
  logoTitle: { fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, lineHeight: 1 },
  logoSub: { fontSize: 11, color: 'var(--muted)' },
  usageBadge: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 500, border: '1px solid', background: 'var(--surface2)' },
  userChip: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '6px 12px', cursor: 'pointer' },
  userAvatar: { width: 26, height: 26, borderRadius: 7, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 10, color: '#fff', flexShrink: 0 },
  logoutBtn: { background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', fontSize: 12, padding: '7px 12px', fontFamily: 'DM Sans, sans-serif' },

  // Layout
  main: { display: 'flex', flex: 1, overflow: 'hidden' },

  // Sidebar
  sidebar: { width: 260, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' },
  sideSection: { padding: '16px 14px 12px', borderBottom: '1px solid var(--border)' },
  sideLabel: { fontSize: 10, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: 'var(--muted)', marginBottom: 10 },
  chip: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, background: 'var(--surface2)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, marginBottom: 5 },
  chipActive: { borderColor: 'var(--accent)', background: 'rgba(255,77,28,.08)', color: 'var(--accent2)' },
  newChatBtn: { width: '100%', padding: 10, background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 12, cursor: 'pointer' },
  convItem: { padding: '8px 10px', borderRadius: 7, cursor: 'pointer', marginBottom: 4, border: '1px solid transparent' },
  convItemActive: { background: 'rgba(255,77,28,.08)', borderColor: 'var(--accent)' },
  quickBtn: { background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 10px', color: 'var(--muted)', fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, cursor: 'pointer', textAlign: 'left' as const, lineHeight: 1.4, width: '100%', marginBottom: 5 },

  // Chat
  chatArea: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  messages: { flex: 1, overflowY: 'auto', padding: '28px 36px', scrollBehavior: 'smooth' as const },

  // Welcome
  welcome: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' as const, padding: 40 },
  welcomeIcon: { width: 64, height: 64, background: 'linear-gradient(135deg, var(--accent), #ff8c5a)', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, marginBottom: 22, boxShadow: '0 0 40px rgba(255,77,28,.2)' },
  welcomeTitle: { fontFamily: 'Syne, sans-serif', fontSize: 24, fontWeight: 700, marginBottom: 10 },
  welcomeDesc: { fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 480, marginBottom: 28 },
  chipRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 8, justifyContent: 'center' as const, maxWidth: 560 },
  welcomeChip: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 20, padding: '7px 16px', fontSize: 12, color: 'var(--muted)', cursor: 'pointer' },

  // Messages
  messageRow: { display: 'flex', gap: 14, padding: '18px 0', borderBottom: '1px solid rgba(255,255,255,.04)' },
  avatar: { width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, fontFamily: 'Syne, sans-serif', marginTop: 2 },
  avatarAI: { background: 'linear-gradient(135deg, var(--accent), #ff8c5a)', color: '#fff' },
  avatarUser: { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)' },
  msgContent: { flex: 1, minWidth: 0 },
  msgRole: { fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase' as const, color: 'var(--muted)', marginBottom: 7 },
  msgText: { fontSize: 14, lineHeight: 1.75, color: 'var(--text)' },
  fileChip: { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 10px', fontSize: 12, color: 'var(--muted)' },

  // Input
  inputArea: { padding: '14px 36px 18px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 },
  limitBanner: { background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: 'var(--red)', marginBottom: 10, textAlign: 'center' as const },
  filePrev: { display: 'flex', alignItems: 'center', gap: 7, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px', fontSize: 12, maxWidth: 200 },
  inputWrapper: { display: 'flex', alignItems: 'flex-end', gap: 9, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 13px' },
  attachBtn: { width: 34, height: 34, background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 },
  textarea: { flex: 1, background: 'none', border: 'none', color: 'var(--text)', fontFamily: 'DM Sans, sans-serif', fontSize: 14, lineHeight: 1.5, resize: 'none' as const, outline: 'none', minHeight: 22, maxHeight: 150 },
  sendBtn: { width: 34, height: 34, background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 },
  inputHint: { fontSize: 11, color: 'var(--muted)', marginTop: 7, textAlign: 'center' as const },
}
