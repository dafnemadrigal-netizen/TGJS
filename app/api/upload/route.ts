import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import * as XLSX from 'xlsx'

export const config = { api: { bodyParser: false } }

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const userId = formData.get('userId') as string
    const isShared = formData.get('isShared') === 'true'

    if (!file || !userId) {
      return NextResponse.json({ error: 'Missing file or userId' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const ext = file.name.split('.').pop()?.toLowerCase() || ''

    let extractedText = ''

    // ── Extract text based on file type ──
    if (['xlsx', 'xls', 'csv'].includes(ext)) {
      try {
        const wb = XLSX.read(buffer, { type: 'buffer' })
        const parts: string[] = []
        wb.SheetNames.forEach(sheetName => {
          const ws = wb.Sheets[sheetName]
          const csv = XLSX.utils.sheet_to_csv(ws)
          const rows = csv.split('\n').slice(0, 500).join('\n')
          parts.push(`=== Hoja: ${sheetName} ===\n${rows}`)
        })
        extractedText = parts.join('\n\n')
      } catch (e) {
        extractedText = `[No se pudo extraer el contenido del archivo Excel: ${file.name}]`
      }
    } else if (ext === 'pdf') {
      try {
        const pdfParse = (await import('pdf-parse')).default
        const data = await pdfParse(buffer)
        extractedText = data.text.slice(0, 50000)
      } catch (e) {
        extractedText = `[No se pudo extraer el contenido del PDF: ${file.name}]`
      }
    } else if (['txt', 'md', 'json', 'csv'].includes(ext)) {
      extractedText = buffer.toString('utf-8').slice(0, 50000)
    }

    // ── Upload file to Supabase Storage ──
    const storagePath = `${userId}/${Date.now()}_${file.name}`
    const { error: uploadError } = await supabaseAdmin.storage
      .from('documents')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
    }

    // ── Save document record ──
    const { data: doc } = await supabaseAdmin
      .from('documents')
      .insert({
        user_id: userId,
        filename: file.name,
        filetype: ext,
        size_bytes: buffer.length,
        storage_path: storagePath,
        extracted_text: extractedText,
        is_shared: isShared
      })
      .select()
      .single()

    // ── For images, return base64 ──
    let base64: string | null = null
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      base64 = buffer.toString('base64')
    }

    return NextResponse.json({
      id: doc?.id,
      name: file.name,
      type: ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? 'image' : 'text',
      mimeType: file.type,
      size: buffer.length,
      extractedText: extractedText,
      base64: base64,
      storagePath
    })

  } catch (error: unknown) {
    console.error('Upload error:', error)
    const message = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
