'use client'
import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile, Conversation, Message } from '@/lib/supabase'

// Rich markdown renderer with tables, scorecards, visual elements
function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0
  let keyCounter = 0
  const k = () => keyCounter++

  function fmt(t: string): string {
    return t
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:1px 5px;font-size:12px">$1</code>')
  }

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) { i++; continue }

    // Horizontal rules
    if (/^[─═━\-]{3,}$/.test(line.trim())) {
      elements.push(<hr key={k()} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '14px 0' }} />)
      i++; continue
    }

    // Box/scorecard lines: ┌ │ └
    if (/^[┌│└├]/.test(line)) {
      const boxLines: string[] = []
      while (i < lines.length && /^[┌│└├─]/.test(lines[i])) {
        boxLines.push(lines[i]); i++
      }
      elements.push(
        <div key={k()} style={{
          background: 'rgba(255,77,28,0.05)', border: '1px solid rgba(255,77,28,0.25)',
          borderRadius: 8, padding: '12px 16px', margin: '12px 0',
          fontFamily: 'monospace', fontSize: 13, lineHeight: 1.9, color: 'var(--text)'
        }}>
          {boxLines.map((bl, bi) => (
            <div key={bi} dangerouslySetInnerHTML={{ __html: fmt(bl) }} />
          ))}
        </div>
      )
      continue
    }

    // Tables
    if (/^\|.+\|/.test(line)) {
      const tableLines: string[] = []
      while (i < lines.length && /^\|/.test(lines[i])) {
        tableLines.push(lines[i]); i++
      }
      const rows = tableLines.filter(l => !/^\|[\-| :]+\|$/.test(l.trim()))
      elements.push(
        <div key={k()} style={{ overflowX: 'auto', margin: '12px 0', borderRadius: 8, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {rows.map((row, ri) => {
                const cells = row.split('|').slice(1, -1).map(c => c.trim())
                return (
                  <tr key={ri}>
                    {cells.map((cell, ci) => {
                      const isHead = ri === 0
                      return isHead
                        ? <th key={ci} style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', textAlign: 'left', fontWeight: 600, color: 'var(--accent2)', background: 'var(--surface2)', fontFamily: 'Syne, sans-serif', fontSize: 12 }} dangerouslySetInnerHTML={{ __html: fmt(cell) }} />
                        : <td key={ci} style={{ padding: '7px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', borderRight: '1px solid var(--border)', color: 'var(--text)', background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }} dangerouslySetInnerHTML={{ __html: fmt(cell) }} />
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    // Headings
    const h3 = line.match(/^### (.+)/)
    if (h3) {
      elements.push(<h3 key={k()} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent2)', margin: '18px 0 6px', fontFamily: 'Syne, sans-serif', textTransform: 'uppercase' as const, letterSpacing: '0.8px' }} dangerouslySetInnerHTML={{ __html: fmt(h3[1]) }} />)
      i++; continue
    }
    const h2 = line.match(/^## (.+)/)
    if (h2) {
      elements.push(<h2 key={k()} style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent2)', margin: '20px 0 8px', fontFamily: 'Syne, sans-serif' }} dangerouslySetInnerHTML={{ __html: fmt(h2[1]) }} />)
      i++; continue
    }
    const h1 = line.match(/^# (.+)/)
    if (h1) {
      elements.push(<h1 key={k()} style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)', margin: '22px 0 10px', fontFamily: 'Syne, sans-serif' }} dangerouslySetInnerHTML={{ __html: fmt(h1[1]) }} />)
      i++; continue
    }

    // Progress bars
    if (/[▓░]/.test(line)) {
      elements.push(
        <div key={k()} style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--accent2)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', margin: '4px 0' }}
          dangerouslySetInnerHTML={{ __html: fmt(line) }} />
      )
      i++; continue
    }

    // Lists
    if (/^[\*\-•➜→] /.test(line) || /^\d+\. /.test(line)) {
      const items: string[] = []
      const ordered = /^\d+\./.test(line)
      while (i < lines.length && (/^[\*\-•➜→] /.test(lines[i]) || /^\d+\. /.test(lines[i]))) {
        items.push(lines[i].replace(/^[\*\-•➜→] /, '').replace(/^\d+\. /, ''))
        i++
      }
      elements.push(ordered
        ? <ol key={k()} style={{ paddingLeft: 22, margin: '8px 0' }}>
          {items.map((item, li) => <li key={li} style={{ marginBottom: 5, fontSize: 14, lineHeight: 1.65 }} dangerouslySetInnerHTML={{ __html: fmt(item) }} />)}
        </ol>
        : <ul key={k()} style={{ paddingLeft: 22, margin: '8px 0', listStyleType: 'none' }}>
          {items.map((item, li) => <li key={li} style={{ marginBottom: 5, fontSize: 14, lineHeight: 1.65, paddingLeft: 4 }} dangerouslySetInnerHTML={{ __html: '• ' + fmt(item) }} />)}
        </ul>
      )
      continue
    }

    // Regular line
    elements.push(
      <p key={k()} style={{ margin: '5px 0', fontSize: 14, lineHeight: 1.75, color: 'var(--text)' }}
        dangerouslySetInnerHTML={{ __html: fmt(line) }} />
    )
    i++
  }

  return <div className="markdown" style={{ fontSize: 14, lineHeight: 1.75 }}>{elements}</div>
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
  const [quickPromptsOpen, setQuickPromptsOpen] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editCountry, setEditCountry] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', user.id).single()
      .then(({ data }) => {
        if (data) {
          const profileData = data as any
          setProfile(profileData)
          setActiveCountry(profileData.country || '')
          if (!profileData.name) {
            setEditName('')
            setEditRole('')
            setEditCountry('')
            setShowProfile(true)
          }
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
    if (!editName.trim()) {
      alert('El nombre es obligatorio')
      return
    }

    const { data, error } = await (supabase.from('profiles') as any)
      .update({
        name: editName.trim(),
        role: editRole.trim(),
        country: editCountry
      })
      .eq('id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Error saving profile:', error)
      alert('No se pudo guardar el perfil: ' + error.message)
      return
    }

    setProfile(data)
    setActiveCountry(data?.country || '')
    setShowProfile(false)
  }

  function openProfileModal() {
    setEditName(profile?.name || '')
    setEditRole(profile?.role || '')
    setEditCountry(profile?.country || '')
    setShowProfile(true)
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
            <div style={{ marginBottom: 14 }}>
              <label style={s.fieldLabel}>Nombre completo</label>
              <input
                style={s.fieldInput}
                placeholder="Ej. Dafne Madrigal"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                autoFocus
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={s.fieldLabel}>Puesto</label>
              <input
                style={s.fieldInput}
                placeholder="Ej. Directora de Operaciones"
                value={editRole}
                onChange={e => setEditRole(e.target.value)}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={s.fieldLabel}>País principal</label>
              <select
                style={s.fieldInput}
                value={editCountry}
                onChange={e => setEditCountry(e.target.value)}
              >
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
          <div style={s.userChip} onClick={openProfileModal} title="Editar perfil">
            <div style={s.userAvatar}>{initials}</div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.2 }}>
                {profile?.name ? `${profile.name.split(' ')[0]} · ${profile.country || 'Sin país'}` : 'Mi perfil'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                {profile?.role || 'editar perfil'}
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
              <button style={{ ...s.newChatBtn, width: 'calc(100% - 26px)' } as React.CSSProperties} onClick={newConversation}>✦ Nueva consulta</button>
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

            {/* Quick prompts - collapsible */}
            <div style={s.sideSection}>
              <div
                style={{ ...s.sideLabel, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: quickPromptsOpen ? 10 : 0 }}
                onClick={() => setQuickPromptsOpen(o => !o)}
              >
                <span>Preguntas rápidas</span>
                <span style={{ fontSize: 14, color: 'var(--muted)', transition: 'transform .2s', display: 'inline-block', transform: quickPromptsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
              </div>
              {quickPromptsOpen && QUICK_PROMPTS.map((p, i) => (
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
        input:focus, textarea:focus, select:focus { border-color: var(--accent) !important; outline: none; box-shadow: 0 0 0 3px rgba(234,108,0,0.1); }
        button:hover { opacity: 0.88; }
        .conv-item:hover { background: var(--surface2) !important; }
        .welcome-chip:hover { border-color: var(--accent-border) !important; background: var(--accent-bg) !important; color: var(--accent) !important; }
        .chip:hover { border-color: var(--border2) !important; }
        .quick-btn:hover { border-color: var(--accent-border) !important; background: var(--accent-bg) !important; color: var(--accent) !important; }
      \`}</style>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg)' },

  // Modal
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, backdropFilter: 'blur(4px)' },
  modalCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, width: 420, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' },
  fieldLabel: { display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: 'var(--muted)', marginBottom: 6 },
  fieldInput: { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontFamily: 'Inter, sans-serif', fontSize: 14, outline: 'none' },
  primaryBtn: { flex: 1, padding: 11, background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 3px 10px rgba(234,108,0,0.2)' },
  secondaryBtn: { padding: '11px 16px', background: 'none', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text2)', cursor: 'pointer', fontSize: 13 },

  // Header
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0, gap: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  menuBtn: { background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18, padding: '4px 8px', borderRadius: 6 },
  logoBadge: { width: 34, height: 34, background: 'linear-gradient(135deg, #ea6c00, #f97316)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 800, fontSize: 13, color: '#fff', flexShrink: 0, boxShadow: '0 3px 10px rgba(234,108,0,0.25)' },
  logoTitle: { fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: 14, lineHeight: 1, color: 'var(--text)' },
  logoSub: { fontSize: 11, color: 'var(--muted)', marginTop: 2 },
  usageBadge: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 20, fontSize: 11.5, fontWeight: 500, border: '1px solid var(--blue-border)', background: 'var(--blue-bg)', color: 'var(--blue)' },
  userChip: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10, padding: '5px 12px', cursor: 'pointer' },
  userAvatar: { width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg, #ea6c00, #f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 800, fontSize: 10, color: '#fff', flexShrink: 0 },
  logoutBtn: { background: 'none', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', fontSize: 12, padding: '7px 12px', fontFamily: 'Inter, sans-serif' },

  // Layout
  main: { display: 'flex', flex: 1, overflow: 'hidden' },

  // Sidebar
  sidebar: { width: 256, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' },
  sideSection: { padding: '14px 13px 12px', borderBottom: '1px solid var(--border)' },
  sideLabel: { fontSize: 10, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: 'var(--muted)', marginBottom: 9 },
  chip: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, marginBottom: 4, color: 'var(--text2)' },
  chipActive: { borderColor: 'var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--accent)' },
  newChatBtn: { margin: '11px 13px', padding: 10, background: 'var(--accent)', border: 'none', borderRadius: 9, color: '#fff', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 3px 10px rgba(234,108,0,0.2)' } as React.CSSProperties,
  convItem: { padding: '8px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 3, border: '1px solid transparent' },
  convItemActive: { background: 'var(--blue-bg)', borderColor: 'var(--blue-border)' },
  quickBtn: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 10px', color: 'var(--text2)', fontFamily: 'Inter, sans-serif', fontSize: 11.5, cursor: 'pointer', textAlign: 'left' as const, lineHeight: 1.4, width: '100%', marginBottom: 4 },

  // Chat
  chatArea: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' },
  messages: { flex: 1, overflowY: 'auto', padding: '28px 36px', scrollBehavior: 'smooth' as const },

  // Welcome
  welcome: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' as const, padding: 40 },
  welcomeIcon: { width: 64, height: 64, background: 'linear-gradient(135deg, #ea6c00, #f97316)', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, marginBottom: 22, boxShadow: '0 8px 24px rgba(234,108,0,0.2)' },
  welcomeTitle: { fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: 24, fontWeight: 700, marginBottom: 10, color: 'var(--text)' },
  welcomeDesc: { fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, maxWidth: 480, marginBottom: 28 },
  chipRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 8, justifyContent: 'center' as const, maxWidth: 560 },
  welcomeChip: { background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 20, padding: '7px 16px', fontSize: 12, color: 'var(--text2)', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },

  // Messages
  messageRow: { display: 'flex', gap: 14, padding: '18px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' },
  avatar: { width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, fontFamily: 'Plus Jakarta Sans, sans-serif', marginTop: 2 },
  avatarAI: { background: 'linear-gradient(135deg, #ea6c00, #f97316)', color: '#fff', boxShadow: '0 2px 8px rgba(234,108,0,0.2)' },
  avatarUser: { background: 'var(--blue-bg)', border: '1px solid var(--blue-border)', color: 'var(--blue)' },
  msgContent: { flex: 1, minWidth: 0 },
  msgRole: { fontSize: 10.5, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase' as const, color: 'var(--muted)', marginBottom: 6 },
  msgText: { fontSize: 14, lineHeight: 1.75, color: 'var(--text)' },
  fileChip: { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 10px', fontSize: 12, color: 'var(--text2)' },

  // Input
  inputArea: { padding: '14px 36px 18px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0, boxShadow: '0 -1px 3px rgba(0,0,0,0.04)' },
  limitBanner: { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: 'var(--red)', marginBottom: 10, textAlign: 'center' as const },
  filePrev: { display: 'flex', alignItems: 'center', gap: 7, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px', fontSize: 12, maxWidth: 200 },
  inputWrapper: { display: 'flex', alignItems: 'flex-end', gap: 9, background: 'var(--surface2)', border: '1.5px solid var(--border2)', borderRadius: 12, padding: '10px 12px' },
  attachBtn: { width: 34, height: 34, background: 'none', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 },
  textarea: { flex: 1, background: 'none', border: 'none', color: 'var(--text)', fontFamily: 'Inter, sans-serif', fontSize: 14, lineHeight: 1.5, resize: 'none' as const, outline: 'none', minHeight: 22, maxHeight: 150 },
  sendBtn: { width: 34, height: 34, background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16, boxShadow: '0 2px 8px rgba(234,108,0,0.25)' },
  inputHint: { fontSize: 11, color: 'var(--muted)', marginTop: 7, textAlign: 'center' as const },
}

