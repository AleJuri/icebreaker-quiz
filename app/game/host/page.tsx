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
  const currentQuestionRef = useRef<number>(0) // pregunta actual, para usar dentro de los callbacks de realtime
  const router = useRouter()

  useEffect(() => {
    loadAll()
    const gameSub = supabase.channel('host-game')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_state' }, (payload) => {
        setGameState(payload.new)
        currentQuestionRef.current = payload.new.current_question
        if (payload.new.status === 'block_break') setPhase('block_break')
        if (payload.new.status === 'finished') setPhase('finished')
        if (payload.new.status === 'playing') {
          setPhase('question')
          setAnswers([]) // nueva pregunta: reinicia el contador de respuestas
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

    // realtime de puntajes: cualquier cambio en players refresca el ranking
    const playersSub = supabase.channel('host-players')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
        loadPlayers()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(gameSub)
      supabase.removeChannel(answersSub)
      supabase.removeChannel(playersSub)
      clearInterval(timerRef.current)
    }
  }, [])

  const loadAll = async () => {
    const [gs, ps] = await Promise.all([
      supabase.from('game_state').select('*').eq('id', 'game').single(),
      supabase.from('players').select('*').order('score', { ascending: false }),
    ])
    if (gs.data) { setGameState(gs.data); currentQuestionRef.current = gs.data.current_question; startTimer(gs.data) }
    if (ps.data) setPlayers(ps.data)
    loadAnswers()
  }

  const loadPlayers = async () => {
    const { data } = await supabase.from('players').select('*').order('score', { ascending: false })
    if (data) setPlayers(data)
  }

  const loadAnswers = async () => {
    const q = currentQuestionRef.current
    if (!q) return
    const { data } = await supabase.from('answers').select('*').eq('question_id', q)
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

  const resetGame = async () => {
    if (!confirm('¿Reiniciar el juego? Se borran jugadores, respuestas y puntajes.')) return
    clearInterval(timerRef.current)
    await supabase.rpc('reset_game')
    router.push('/')
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
          {/* podio top 3 */}
          {players.slice(0,3).map((p, i) => (
            <div key={p.id} style={{
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
          {/* resto de jugadores (4° en adelante) */}
          {players.slice(3).map((p, i) => (
            <div key={p.id} style={{
              display:'flex', alignItems:'center', gap:16,
              background:'#1e293b', borderRadius:12, padding:'10px 24px', marginBottom:6
            }}>
              <div style={{ fontSize:16, fontWeight:700, color:'#64748b', minWidth:32 }}>{i+4}°</div>
              <div style={{ flex:1, textAlign:'left', fontSize:17, fontWeight:600 }}>{p.name}</div>
              <div style={{ fontSize:18, fontWeight:700, color:'#f59e0b' }}>{p.score} pts</div>
            </div>
          ))}
          <button onClick={resetGame} style={{
            marginTop:24, padding:'14px 32px', borderRadius:12, border:'none',
            background:'#22c55e', color:'#fff', fontSize:16, fontWeight:700, cursor:'pointer'
          }}>↺ Reiniciar y nueva partida</button>
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
          <div style={{ display:'flex', gap:12 }}>
            <button onClick={continueAfterBreak} style={{
              flex:1, padding:18, borderRadius:14, border:'none', cursor:'pointer',
              background:'#3b82f6', color:'#fff', fontSize:18, fontWeight:700
            }}>
              Continuar → {nextBlock?.label}
            </button>
            <button onClick={resetGame} style={{
              padding:'18px 24px', borderRadius:14, border:'1px solid #7f1d1d', cursor:'pointer',
              background:'transparent', color:'#f87171', fontSize:15, fontWeight:600
            }}>↺ reset</button>
          </div>
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

  const blockBg: Record<string, string> = {
    messi: '/messi-copa.jpg',
    nerd: '/gandalf.webp',
  }
  const bgImage = blockBg[currentQ.block]

  return (
    <div style={{ minHeight:'100vh', background:'#0f172a', color:'#fff', fontFamily:'sans-serif', padding:24, position:'relative', overflow:'hidden' }}>
      {/* imagen decorativa lateral del bloque (no tapa el contenido) */}
      {bgImage && (
        <>
          <img src={bgImage} alt="" style={{
            position:'fixed', right:0, bottom:0, height:'90vh', maxWidth:'46vw',
            objectFit:'contain', objectPosition:'right bottom', opacity:0.9,
            zIndex:0, pointerEvents:'none',
            WebkitMaskImage:'linear-gradient(to left, #000 55%, transparent 100%)',
            maskImage:'linear-gradient(to left, #000 55%, transparent 100%)',
          }} />
          <img src={bgImage} alt="" style={{
            position:'fixed', left:0, top:0, height:'70vh', maxWidth:'34vw',
            objectFit:'contain', objectPosition:'left top', opacity:0.18,
            zIndex:0, pointerEvents:'none', transform:'scaleX(-1)',
            WebkitMaskImage:'linear-gradient(to right, #000 40%, transparent 100%)',
            maskImage:'linear-gradient(to right, #000 40%, transparent 100%)',
          }} />
        </>
      )}
      <div style={{ maxWidth:1000, margin:'0 auto', position:'relative', zIndex:1 }}>

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
            <button onClick={resetGame} title="Reiniciar juego" style={{
              background:'transparent', border:'1px solid #7f1d1d', color:'#f87171',
              borderRadius:10, padding:'8px 14px', fontSize:13, cursor:'pointer', fontWeight:600
            }}>↺ reset</button>
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
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={{ fontSize:12, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' }}>tabla de puntajes</div>
              <div style={{ fontSize:11, color:'#22c55e' }}>● en vivo</div>
            </div>
            <div>
              {players.map((p, i) => (
                <div key={p.id} style={{
                  display:'flex', gap:10, alignItems:'center', padding:'7px 10px',
                  borderRadius:8, marginBottom:3,
                  background: i===0 ? '#92400e33' : i===1 ? '#37415133' : i===2 ? '#1c191733' : 'transparent',
                }}>
                  <div style={{ fontSize:15, minWidth:30, textAlign:'center', fontWeight:700, color:'#64748b' }}>
                    {i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}`}
                  </div>
                  <div style={{ flex:1, fontSize:15, fontWeight:500 }}>{p.name}</div>
                  <div style={{ fontSize:16, fontWeight:700, color:'#f59e0b' }}>{p.score}</div>
                </div>
              ))}
              {players.length === 0 && (
                <div style={{ color:'#475569', fontSize:13, textAlign:'center', padding:16 }}>sin jugadores</div>
              )}
            </div>
          </div>

          <button onClick={nextQuestion} style={{
            padding:'16px 32px', borderRadius:14, border:'none', cursor:'pointer',
            background: answeredCount >= totalPlayers && totalPlayers > 0 ? '#22c55e' : '#3b82f6',
            color:'#fff', fontSize:16, fontWeight:700,
            minWidth:180, alignSelf:'stretch'
          }}>
            {answeredCount >= totalPlayers && totalPlayers > 0 ? '✅ Siguiente' : '⏭️ Siguiente'}
            <div style={{ fontSize:12, fontWeight:400, marginTop:4, opacity:0.8 }}>
              {answeredCount}/{totalPlayers} respondieron
            </div>
          </button>
        </div>

      </div>
    </div>
  )
}
