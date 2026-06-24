import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Icebreaker HMM',
  description: 'Quiz interactivo para icebreaker empresarial',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, padding: 0, background: '#0f172a' }}>
        {children}
      </body>
    </html>
  )
}
