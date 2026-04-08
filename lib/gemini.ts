const GEMINI_API_KEY = process.env.GEMINI_API_KEY!
const GEMINI_MODEL = 'gemini-2.5-flash''

export async function callGeminiRest(prompt: string, maxTokens = 300): Promise<string> {
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

  console.log('Gemini status:', res.status)
  console.log('Gemini response:', JSON.stringify(data))

  if (!res.ok) {
    throw new Error(data?.error?.message || `Gemini HTTP ${res.status}`)
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || '')
      .join('') || ''

  if (!text.trim()) {
    throw new Error('Gemini returned empty content')
  }

  return text
}