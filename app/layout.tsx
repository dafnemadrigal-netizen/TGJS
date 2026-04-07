import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AMPM People Strategy',
  description: 'Asesor estratégico interno — Good Jobs Framework',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
