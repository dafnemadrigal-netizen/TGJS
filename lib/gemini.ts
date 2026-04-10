const GEMINI_API_KEY = process.env.GEMINI_API_KEY!
const GEMINI_MODEL = 'gemini-2.5-flash'

export async function callGeminiRest(prompt: string, maxTokens = 6000): Promise<string> {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 }
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data?.error?.message || `Gemini HTTP ${res.status}`)
  }

  const candidate = data?.candidates?.[0]
  const text =
    candidate?.content?.parts
      ?.map((p: { text?: string }) => p.text || '')
      .join('') || ''

  if (!text.trim()) {
    throw new Error(candidate?.finishReason || 'Gemini returned empty content')
  }

  return text
}