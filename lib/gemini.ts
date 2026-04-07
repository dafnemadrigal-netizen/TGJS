import { GoogleGenerativeAI, Part } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export const geminiModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash-preview-05-20',
  generationConfig: {
    maxOutputTokens: 2048,
    temperature: 0.7,
  }
})

export const geminiMiniModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash-preview-05-20',
  generationConfig: {
    maxOutputTokens: 300,
    temperature: 0.3,
  }
})

export type GeminiMessage = {
  role: 'user' | 'model'
  parts: Part[]
}

// Convert our DB messages to Gemini format
export function toGeminiHistory(messages: { role: string; content: string }[]): GeminiMessage[] {
  return messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }))
}

// Extract memory insights from a conversation turn
export async function extractInsights(userMsg: string, aiReply: string): Promise<string[]> {
  const prompt = `Eres un sistema de memoria para AMPM CAM.

Dado este intercambio:
USUARIO: ${userMsg.slice(0, 800)}
ASESOR: ${aiReply.slice(0, 1200)}

Extrae 1-3 aprendizajes concisos (máximo 20 palabras cada uno) sobre:
- Problemas específicos que enfrenta AMPM CAM
- Decisiones o acciones que se están tomando
- Datos o hechos importantes mencionados
- Contexto operativo relevante (país, área, métricas)

Responde SOLO con un JSON array de strings. Si no hay nada relevante: []
Ejemplo: ["Rotación en Nicaragua supera el 80% anualmente", "Están implementando horarios fijos en turno nocturno"]`

  try {
    const result = await geminiMiniModel.generateContent(prompt)
    const text = result.response.text().trim().replace(/```json|```/g, '')
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Generate a conversation title from the first message
export async function generateTitle(firstMessage: string): Promise<string> {
  const prompt = `Resume este mensaje en máximo 6 palabras como título de conversación. Solo el título, sin comillas ni puntuación final.

Mensaje: ${firstMessage.slice(0, 200)}`

  try {
    const result = await geminiMiniModel.generateContent(prompt)
    return result.response.text().trim().slice(0, 60)
  } catch {
    return firstMessage.slice(0, 50) + '...'
  }
}
