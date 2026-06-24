'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { QRCodeSVG } from 'qrcode.react'
import { useRouter } from 'next/navigation'

const MIN_PLAYERS = 1 // mínimo de jugadores para poder comenzar

export default function LobbyPage() {
  const [players, setPlayers] = useState<any[]>([])
  const [gameStatus, setGameStatus] = useState('lobby')
  const [gameUrl, setGameUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setGameUrl(window.location.origin + '/join')

    // cargar jugadores iniciales
    supabase.from('players').select('*').order('joined_at').then(({ data }) => {
      if (data) setPlayers(data)
    })

    // cargar estado del juego
    supabase.from('game_state').select('*').eq('id', 'game').single().then(({ data }) => {
      if (data) setGameStatus(data.status)
    })

    // realtime jugadores
    const playersSub = supabase
      .channel('lobby-players')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
        supabase.from('players').select('*').order('joined_at').then(({ data }) => {
          if (data) setPlayers(data)
        })
      })
      .subscribe()

    // realtime game state
    const gameSub = supabase
      .channel('lobby-game')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_state' }, (payload) => {
        const s = payload.new.status
        setGameStatus(s)
        if (s === 'playing') router.push('/game/host')
      })
      .subscribe()

    return () => {
      supabase.removeChannel(playersSub)
      supabase.removeChannel(gameSub)
    }
  }, [])

  const copyLink = () => {
    navigator.clipboard.writeText(gameUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const startGame = async () => {
    if (players.length < MIN_PLAYERS) { alert(`necesitás al menos ${MIN_PLAYERS} jugador(es)`); return }
    await supabase.from('game_state').update({
      status: 'playing',
      current_question: 1,
      question_started_at: new Date().toISOString(),
      answers_count: 0,
    }).eq('id', 'game')
  }

  const resetGame = async () => {
    await supabase.rpc('reset_game')
    setPlayers([])
    setGameStatus('lobby')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', fontFamily: 'sans-serif', padding: '24px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', position: 'relative', zIndex: 1 }}>

        {/* header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 8 }}>🎮 ICEBREAKER HMM</div>
          <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Sala de espera</h1>
          <p style={{ color: '#94a3b8' }}>Escaneá el QR o entrá al link para unirte</p>
        </div>

        <div className="lobby-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>

          {/* QR */}
          <div style={{ background: '#1e293b', borderRadius: 16, padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>escanear para entrar</div>
            {gameUrl && (
              <div style={{ background: '#fff', display: 'inline-block', padding: 16, borderRadius: 12, marginBottom: 16 }}>
                <QRCodeSVG value={gameUrl} size={180} />
              </div>
            )}
            <div style={{ fontSize: 13, color: '#cbd5e1', wordBreak: 'break-all', marginBottom: 12 }}>{gameUrl || 'cargando link...'}</div>
            <button
              onClick={copyLink}
              style={{
                padding: '10px 16px', borderRadius: 10, border: '1px solid #475569',
                background: copied ? '#22c55e' : '#0f172a', color: '#fff', fontSize: 13,
                fontWeight: 600, cursor: 'pointer', width: '100%'
              }}
            >
              {copied ? '✓ copiado' : '📋 copiar link'}
            </button>
          </div>

          {/* jugadores */}
          <div style={{ background: '#1e293b', borderRadius: 16, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>jugadores</div>
              <div style={{ background: '#3b82f6', borderRadius: 99, padding: '2px 12px', fontSize: 14, fontWeight: 600 }}>
                {players.length}
              </div>
            </div>

            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {players.length === 0 && (
                <div style={{ color: '#475569', fontSize: 14, textAlign: 'center', padding: 20 }}>
                  esperando jugadores...
                </div>
              )}
              {players.map((p, i) => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 0', borderBottom: '1px solid #334155',
                  animation: 'fadeIn 0.3s ease'
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: p.is_admin ? '#f59e0b' : '#3b82f6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 600
                  }}>
                    {p.name[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14 }}>{p.name}</span>
                    {p.is_admin && <span style={{ fontSize: 11, color: '#f59e0b', marginLeft: 6 }}>👑 admin</span>}
                  </div>
                  <div style={{ color: '#22c55e', fontSize: 16 }}>✓</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* zona inferior: botones con el video HMM de fondo */}
        <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', paddingBottom: 200 }}>
          {/* video de fondo, arranca acá (debajo del QR y jugadores) */}
          <video
            autoPlay loop muted playsInline
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, opacity: 0.6 }}
          >
            <source src="/hmm-gotas.mp4" type="video/mp4" />
          </video>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.3)', zIndex: 0 }} />

          {/* botones admin */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 12 }}>
            <button
              onClick={startGame}
              disabled={players.length < MIN_PLAYERS || gameStatus !== 'lobby'}
              style={{
                flex: 1, padding: '16px', borderRadius: 12, border: 'none',
                cursor: players.length >= MIN_PLAYERS ? 'pointer' : 'not-allowed',
                background: players.length >= MIN_PLAYERS ? '#22c55e' : '#374151',
                color: '#fff', fontSize: 16, fontWeight: 700,
                opacity: players.length >= MIN_PLAYERS ? 1 : 0.5
              }}
            >
              {players.length < MIN_PLAYERS ? 'esperando jugadores...' : `🚀 Comenzar juego (${players.length} jugadores)`}
            </button>
            <button
              onClick={resetGame}
              style={{
                padding: '16px 24px', borderRadius: 12, border: '1px solid #475569',
                background: 'rgba(15,23,42,0.6)', color: '#94a3b8', fontSize: 14, cursor: 'pointer'
              }}
            >
              reset
            </button>
          </div>
        </div>

        <style>{`
          @keyframes fadeIn { from { opacity:0; transform:translateY(-4px) } to { opacity:1; transform:translateY(0) } }
          @media (max-width: 640px) { .lobby-grid { grid-template-columns: 1fr !important; } }
        `}</style>
      </div>
    </div>
  )
}
