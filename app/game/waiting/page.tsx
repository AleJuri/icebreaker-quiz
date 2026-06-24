'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function WaitingPage() {
  const [playerCount, setPlayerCount] = useState(0)
  const [playerName, setPlayerName] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const name = sessionStorage.getItem('playerName') || ''
    const admin = sessionStorage.getItem('isAdmin') === 'true'
    setPlayerName(name)
    setIsAdmin(admin)

    supabase.from('players').select('*', { count: 'exact', head: true }).then(({ count }) => {
      setPlayerCount(count || 0)
    })

    const playersSub = supabase
      .channel('waiting-players')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
        supabase.from('players').select('*', { count: 'exact', head: true }).then(({ count }) => {
          setPlayerCount(count || 0)
        })
      })
      .subscribe()

    const gameSub = supabase
      .channel('waiting-game')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_state' }, (payload) => {
        if (payload.new.status === 'playing') router.push('/game/player')
      })
      .subscribe()

    return () => {
      supabase.removeChannel(playersSub)
      supabase.removeChannel(gameSub)
    }
  }, [])

  const EMOJIS = ['🎯','🔥','⚡','🎮','🏆','🚀','💥','🎲']
  const emoji = EMOJIS[playerName.length % EMOJIS.length]

  return (
    <div style={{ minHeight:'100vh', background:'#0f172a', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'sans-serif', padding:24 }}>
      <div style={{ textAlign:'center', width:'100%', maxWidth:360 }}>
        <div style={{ fontSize:64, marginBottom:16 }}>{emoji}</div>
        <h2 style={{ fontSize:24, fontWeight:700, marginBottom:4 }}>Hola, {playerName}!</h2>
        {isAdmin && <div style={{ color:'#f59e0b', fontSize:13, marginBottom:8 }}>👑 sos el admin del juego</div>}
        <p style={{ color:'#94a3b8', marginBottom:32 }}>esperando que el host empiece el juego...</p>

        <div style={{ background:'#1e293b', borderRadius:16, padding:24, marginBottom:24 }}>
          <div style={{ fontSize:13, color:'#94a3b8', marginBottom:8 }}>jugadores en sala</div>
          <div style={{ fontSize:48, fontWeight:700, color:'#3b82f6' }}>{playerCount}</div>
        </div>

        <div style={{ display:'flex', justifyContent:'center', gap:8 }}>
          {[0,1,2].map(i => (
            <div key={i} style={{
              width:8, height:8, borderRadius:'50%', background:'#3b82f6',
              animation: `pulse 1.4s ease-in-out ${i*0.2}s infinite`
            }} />
          ))}
        </div>

        <style>{`
          @keyframes pulse {
            0%, 80%, 100% { opacity: 0.3; transform: scale(0.8) }
            40% { opacity: 1; transform: scale(1.2) }
          }
        `}</style>
      </div>
    </div>
  )
}
