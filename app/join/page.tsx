'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function JoinPage() {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [gameStatus, setGameStatus] = useState('lobby')
  const router = useRouter()

  useEffect(() => {
    // si ya tiene playerId en session, redirigir directo
    const pid = sessionStorage.getItem('playerId')
    if (pid) { router.push('/game/player'); return }

    supabase.from('game_state').select('status').eq('id', 'game').single().then(({ data }) => {
      if (data) setGameStatus(data.status)
    })

    const sub = supabase
      .channel('join-game')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_state' }, (payload) => {
        setGameStatus(payload.new.status)
        const pid = sessionStorage.getItem('playerId')
        if (payload.new.status === 'playing' && pid) router.push('/game/player')
      })
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [])

  const join = async () => {
    if (!name.trim()) { setError('escribí tu nombre'); return }
    if (name.trim().length < 2) { setError('nombre muy corto'); return }
    setLoading(true)
    setError('')

    // contar jugadores pa saber si es admin
    const { count } = await supabase.from('players').select('*', { count: 'exact', head: true })
    const isAdmin = count === 0

    const { data, error: err } = await supabase.from('players').insert({
      name: name.trim(),
      is_admin: isAdmin,
      score: 0,
    }).select().single()

    if (err) { setError('error al entrar, intentá de nuevo'); setLoading(false); return }

    sessionStorage.setItem('playerId', data.id)
    sessionStorage.setItem('playerName', data.name)
    sessionStorage.setItem('isAdmin', String(isAdmin))

    if (gameStatus === 'playing') {
      router.push('/game/player')
    } else {
      router.push('/game/waiting')
    }
  }

  if (gameStatus === 'finished') {
    return (
      <div style={{ minHeight:'100vh', background:'#0f172a', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'sans-serif' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:16 }}>🏁</div>
          <h2 style={{ fontSize:24, marginBottom:8 }}>el juego ya terminó</h2>
          <p style={{ color:'#94a3b8' }}>preguntale al host cuándo es el próximo</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight:'100vh', background:'#0f172a', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'sans-serif', padding:24 }}>
      <div style={{ width:'100%', maxWidth:400 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🎮</div>
          <h1 style={{ fontSize:28, fontWeight:700, marginBottom:8 }}>ICEBREAKER QUIZ</h1>
          <p style={{ color:'#94a3b8', fontSize:14 }}>ingresá tu nombre para unirte</p>
        </div>

        <div style={{ background:'#1e293b', borderRadius:16, padding:24 }}>
          <label style={{ fontSize:13, color:'#94a3b8', display:'block', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>
            tu nombre
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && join()}
            placeholder="ej: Juan García"
            maxLength={20}
            autoFocus
            style={{
              width:'100%', padding:'12px 16px', borderRadius:10, border:'1px solid #334155',
              background:'#0f172a', color:'#fff', fontSize:16, marginBottom:16,
              outline:'none', boxSizing:'border-box'
            }}
          />

          {error && <div style={{ color:'#f87171', fontSize:13, marginBottom:12 }}>{error}</div>}

          <button
            onClick={join}
            disabled={loading}
            style={{
              width:'100%', padding:14, borderRadius:10, border:'none', cursor:'pointer',
              background: loading ? '#374151' : '#3b82f6',
              color:'#fff', fontSize:16, fontWeight:600
            }}
          >
            {loading ? 'entrando...' : 'Entrar al juego →'}
          </button>
        </div>
      </div>
    </div>
  )
}
