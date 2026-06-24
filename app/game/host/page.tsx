'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { QUESTIONS, BLOCKS } from '@/lib/questions'
import { useRouter } from 'next/navigation'

export default function HostPage() {
  const [gameState, setGameState] = useState<any>(null)
  const [players, setPlayers] = useState<any[]>([])
  const [answers, setAnswers] = useState<any[]>([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [phase, setPhase] = useState<'question'|'block_break'|'finished'>('question')
  const timerRef = useRef<any>(null)
  const router = useRouter()

  useEffect(() => {
    loadAll()
    const gameSub = supabase.channel('host-game')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_state' }, (payload) => {
        setGameState(payload.new)
        if (payload.new.status === 'block_break') setPhase('block_break')
        if (payload.new.status === 'finished') setPhase('finished')
        if (payload.new.status === 'playing') {
          setPhase('question')
          startTimer(payload.new)
        }
      })
      .subscribe()

    const answersSub = supabase.channel('host-answers')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'answers' }, () => {
        loadAnswers()
        loadPlayers()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(gameSub)
      supabase.removeChannel(answersSub)
      clearInterval(timerRef.current)
    }
  }, [])

  const loadAll = async () => {
    const [gs, ps] = await Promise.all([
      supabase.from('game_state').select('*').eq('id', 'game').single(),
      supabase.from('players').select('*').order('score', { ascending: false }),
    ])
    if (gs.data) { setGameState(gs.data); startTimer(gs.data) }
    if (ps.data) setPlayers(ps.data)
    loadAnswers()
  }

  const loadPlayers = async () => {
    const { data } = await supabase.from('players').select('*').order('score', { ascending: false })
    if (data) setPlayers(data)
  }

  const loadAnswers = async () => {
    if (!gameState) return
    const { data } = await supabase.from('answers').select('*').eq('question_id', gameState.current_question)
    if (data) setAnswers(data)
  }

  const startTimer = (gs: any) => {
    clearInterval(timerRef.current)
    const q = QUESTIONS[(gs.current_question || 1) - 1]
    if (!q || !gs.question_started_at) return
    const startedAt = new Date(gs.question_started_at).getTime()
    const update = () => {
      const elapsed = Date.now() - startedAt
      const left = Math.max(0, q.timeLimit - elapsed / 1000)
      setTimeLeft(left)
    }
    update()
    timerRef.current = setInterval(update, 200)
  }

  const nextQuestion = async () => {
    if (!gameState) return
    const next = gameState.current_question + 1

    // detectar fin de bloque
    const currentQ = QUESTIONS[gameState.current_question - 1]
    const nextQ = QUESTIONS[next - 1]
    const blockChange = nextQ && currentQ && nextQ.block !== currentQ.block

    if (next > QUESTIONS.length) {
      await supabase.from('game_state').update({ status: 'finished' }).eq('id', 'game')
      return
    }

    if (blockChange) {
      await supabase.from('game_state').update({ status: 'block_break' }).eq('id', 'game')
      return
    }

    await supabase.from('game_state').update({
      current_question: next,
      question_started_at: new Date().toISOString(),
      answers_count: 0,
    }).eq('id', 'game')
    setAnswers([])
  }

  const continueAfterBreak = async () => {
    if (!gameState) return
    const next = gameState.current_question + 1
    await supabase.from('game_state').update({
      status: 'playing',
      current_question: next,
      question_started_at: new Date().toISOString(),
      answers_count: 0,
    }).eq('id', 'game')
    setAnswers([])
  }

  const currentQ = gameState ? QUESTIONS[gameState.current_question - 1] : null
  const answeredCount = answers.length
  const totalPlayers = players.length
  const timerPct = currentQ ? (timeLeft / currentQ.timeLimit) * 100 : 0
  const correctCount = answers.filter(a => a.is_correct).length

  // ── FINISHED ─────────────────────────────────────────────────
  if (phase === 'finished') {
    return (
      <div style={{ minHeight:'100vh', background:'#0f172a', color:'#fff', fontFamily:'sans-serif', padding:32, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ maxWidth:700, width:'100%', textAlign:'center' }}>
          <div style={{ fontSize:80, marginBottom:16 }}>🏆</div>
          <h1 style={{ fontSize:40, fontWeight:800, marginBottom:32 }}>¡JUEGO TERMINADO!</h1>
          {players.slice(0,3).map((p, i) => (
            <div key={i} style={{
              display:'flex', alignItems:'center', gap:16,
              background: i===0?'#92400e':i===1?'#374151':'#1c1917',
              borderRadius:16, padding:'16px 24px', marginBottom:12,
              border: i===0?'2px solid #f59e0b':'none'
            }}>
              <div style={{ fontSize:40 }}>{i===0?'🥇':i===1?'🥈':'🥉'}</div>
              <div style={{ flex:1, textAlign:'left' }}>
                <div style={{ fontSize:22, fontWeight:700 }}>{p.name}</div>
              </div>
              <div style={{ fontSize:28, fontWeight:800, color:'#f59e0b' }}>{p.score} pts</div>
            </div>
          ))}
          <button onClick={() => router.push('/')} style={{
            marginTop:24, padding:'14px 32px', borderRadius:12, border:'1px solid #475569',
            background:'transparent', color:'#94a3b8', fontSize:16, cursor:'pointer'
          }}>volver al inicio</button>
        </div>
      </div>
    )
  }

  // ── BLOCK BREAK ───────────────────────────────────────────────
  if (phase === 'block_break') {
    const nextBlock = BLOCKS.find(b => b.range[0] === (gameState?.current_question || 0) + 1)
    return (
      <div style={{ minHeight:'100vh', background:'#0f172a', color:'#fff', fontFamily:'sans-serif', padding:32 }}>
        <div style={{ maxWidth:800, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:32 }}>
            <div style={{ fontSize:48, marginBottom:8 }}>📊</div>
            <h2 style={{ fontSize:32, fontWeight:800 }}>Ranking parcial</h2>
            {nextBlock && <p style={{ color:'#94a3b8', marginTop:8 }}>próximo bloque: {nextBlock.label}</p>}
          </div>
          <div style={{ marginBottom:24 }}>
            {players.map((p, i) => (
              <div key={i} style={{
                display:'flex', alignItems:'center', gap:16,
                background:'#1e293b', borderRadius:12, padding:'14px 20px', marginBottom:8
              }}>
                <div style={{ fontSize:24, minWidth:36 }}>
                  {i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`}
                </div>
                <div style={{ flex:1, fontSize:18, fontWeight:600 }}>{p.name}</div>
                <div style={{ fontSize:22, fontWeight:700, color:'#f59e0b' }}>{p.score} pts</div>
              </div>
            ))}
          </div>
          <button onClick={continueAfterBreak} style={{
            width:'100%', padding:18, borderRadius:14, border:'none', cursor:'pointer',
            background:'#3b82f6', color:'#fff', fontSize:18, fontWeight:700
          }}>
            Continuar → {nextBlock?.label}
          </button>
        </div>
      </div>
    )
  }

  if (!currentQ || !gameState) return (
    <div style={{ minHeight:'100vh', background:'#0f172a', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'sans-serif' }}>
      <div>cargando...</div>
    </div>
  )

  const optColors = ['#3b82f6','#8b5cf6','#f59e0b','#10b981']

  return (
    <div style={{ minHeight:'100vh', background:'#0f172a', color:'#fff', fontFamily:'sans-serif', padding:24 }}>
      <div style={{ maxWidth:1000, margin:'0 auto' }}>

        {/* top bar */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:13, color:'#94a3b8' }}>{currentQ.blockLabel}</div>
            <div style={{ fontSize:18, fontWeight:700 }}>Pregunta {gameState.current_question} de 20</div>
          </div>
          <div style={{ display:'flex', gap:12, alignItems:'center' }}>
            <div style={{ background:'#1e293b', borderRadius:10, padding:'8px 16px', textAlign:'center' }}>
              <div style={{ fontSize:11, color:'#94a3b8' }}>respondieron</div>
              <div style={{ fontSize:20, fontWeight:700 }}>{answeredCount}/{totalPlayers}</div>
            </div>
            <div style={{ background:'#1e293b', borderRadius:10, padding:'8px 16px', textAlign:'center' }}>
              <div style={{ fontSize:11, color:'#94a3b8' }}>correctas</div>
              <div style={{ fontSize:20, fontWeight:700, color:'#22c55e' }}>{correctCount}</div>
            </div>
            <div style={{
              background:'#1e293b', borderRadius:10, padding:'8px 16px', textAlign:'center',
              color: timeLeft < 5 ? '#ef4444' : '#fff'
            }}>
              <div style={{ fontSize:11, color:'#94a3b8' }}>tiempo</div>
              <div style={{ fontSize:20, fontWeight:700 }}>{Math.ceil(timeLeft)}s</div>
            </div>
          </div>
        </div>

        {/* timer bar */}
        <div style={{ background:'#1e293b', borderRadius:99, height:10, marginBottom:24, overflow:'hidden' }}>
          <div style={{
            height:10, borderRadius:99,
            background: timerPct > 50 ? '#22c55e' : timerPct > 25 ? '#f59e0b' : '#ef4444',
            width:`${timerPct}%`, transition:'width 0.2s linear'
          }} />
        </div>

        {/* pregunta */}
        <div style={{ background:'#1e293b', borderRadius:20, padding:32, marginBottom:20, textAlign:'center' }}>
          <p style={{ fontSize:28, fontWeight:700, lineHeight:1.3 }}>{currentQ.question}</p>
        </div>

        {/* opciones */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:24 }}>
          {currentQ.options.map((opt, i) => (
            <div key={i} style={{
              background: optColors[i] + '22', border:`2px solid ${optColors[i]}44`,
              borderRadius:14, padding:'16px 20px',
              display:'flex', alignItems:'center', gap:12
            }}>
              <div style={{
                width:36, height:36, borderRadius:'50%', background:optColors[i],
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:16, fontWeight:800, flexShrink:0
              }}>{['A','B','C','D'][i]}</div>
              <span style={{ fontSize:17, fontWeight:500 }}>{opt}</span>
            </div>
          ))}
        </div>

        {/* ranking lateral + botón next */}
        <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
          <div style={{ flex:1, background:'#1e293b', borderRadius:14, padding:16 }}>
            <div style={{ fontSize:12, color:'#94a3b8', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>top jugadores</div>
            {players.slice(0,5).map((p, i) => (
              <div key={i} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
                <div style={{ fontSize:14, minWidth:24, color:'#64748b' }}>{i+1}.</div>
                <div style={{ flex:1, fontSize:14 }}>{p.name}</div>
                <div style={{ fontSize:14, fontWeight:600, color:'#f59e0b' }}>{p.score}</div>
              </div>
            ))}
          </div>

          <button onClick={nextQuestion} style={{
            padding:'16px 32px', borderRadius:14, border:'none', cursor:'pointer',
            background:'#3b82f6', color:'#fff', fontSize:16, fontWeight:700,
            minWidth:180, alignSelf:'stretch'
          }}>
            {answeredCount >= totalPlayers ? '✅ Todos respondieron' : '⏭️ Forzar siguiente'}
            <div style={{ fontSize:12, fontWeight:400, marginTop:4, opacity:0.8 }}>
              {answeredCount}/{totalPlayers} respondieron
            </div>
          </button>
        </div>

      </div>
    </div>
  )
}
