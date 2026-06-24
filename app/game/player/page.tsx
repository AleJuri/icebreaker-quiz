'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { QUESTIONS } from '@/lib/questions'
import { useRouter } from 'next/navigation'

const MAX_POINTS = 1000
const MIN_POINTS = 100

function calcPoints(timeLimit: number, elapsedMs: number): number {
  const ratio = Math.max(0, 1 - elapsedMs / (timeLimit * 1000))
  return Math.round(MIN_POINTS + (MAX_POINTS - MIN_POINTS) * ratio)
}

export default function PlayerPage() {
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [gameState, setGameState] = useState<any>(null)
  const [answered, setAnswered] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [pointsEarned, setPointsEarned] = useState(0)
  const [totalScore, setTotalScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [phase, setPhase] = useState<'question'|'waiting'|'block_break'|'finished'>('question')
  const [blockRanking, setBlockRanking] = useState<any[]>([])
  const timerRef = useRef<any>(null)
  const questionStartRef = useRef<number>(0)
  const router = useRouter()

  useEffect(() => {
    const pid = sessionStorage.getItem('playerId')
    const pname = sessionStorage.getItem('playerName') || ''
    if (!pid) { router.push('/join'); return }
    setPlayerId(pid)
    setPlayerName(pname)

    // cargar score actual
    supabase.from('players').select('score').eq('id', pid).single().then(({ data }) => {
      if (data) setTotalScore(data.score)
    })

    // cargar game state inicial
    supabase.from('game_state').select('*').eq('id', 'game').single().then(({ data }) => {
      if (data) handleGameState(data, pid)
    })

    const sub = supabase
      .channel('player-game')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_state' }, (payload) => {
        handleGameState(payload.new, pid)
      })
      .subscribe()

    return () => { supabase.removeChannel(sub); clearInterval(timerRef.current) }
  }, [])

  const handleGameState = (gs: any, pid: string) => {
    setGameState(gs)
    if (gs.status === 'finished') { setPhase('finished'); return }
    if (gs.status === 'block_break') {
      setPhase('block_break')
      loadRanking()
      return
    }
    if (gs.status === 'playing' && gs.current_question > 0) {
      // verificar si ya respondió esta pregunta
      supabase.from('answers')
        .select('*')
        .eq('player_id', pid)
        .eq('question_id', gs.current_question)
        .single()
        .then(({ data }) => {
          if (data) {
            setAnswered(true)
            setSelectedIdx(data.answer_index)
            setIsCorrect(data.is_correct)
            setPointsEarned(data.points)
            setPhase('waiting')
          } else {
            setAnswered(false)
            setSelectedIdx(null)
            setIsCorrect(null)
            setPhase('question')
            startTimer(gs)
          }
        })
    }
  }

  const startTimer = (gs: any) => {
    clearInterval(timerRef.current)
    const q = QUESTIONS[gs.current_question - 1]
    if (!q) return
    questionStartRef.current = gs.question_started_at ? new Date(gs.question_started_at).getTime() : Date.now()
    const update = () => {
      const elapsed = Date.now() - questionStartRef.current
      const left = Math.max(0, q.timeLimit - elapsed / 1000)
      setTimeLeft(left)
      if (left <= 0) clearInterval(timerRef.current)
    }
    update()
    timerRef.current = setInterval(update, 200)
  }

  const loadRanking = async () => {
    const { data } = await supabase.from('players').select('name, score').order('score', { ascending: false })
    if (data) setBlockRanking(data)
  }

  const answer = async (idx: number) => {
    if (answered || !playerId || !gameState) return
    const q = QUESTIONS[gameState.current_question - 1]
    if (!q) return

    clearInterval(timerRef.current)
    const elapsed = Date.now() - questionStartRef.current
    const correct = idx === q.correct
    const pts = correct ? calcPoints(q.timeLimit, elapsed) : 0

    setAnswered(true)
    setSelectedIdx(idx)
    setIsCorrect(correct)
    setPointsEarned(pts)
    setPhase('waiting')

    // guardar respuesta
    await supabase.from('answers').insert({
      player_id: playerId,
      question_id: q.id,
      answer_index: idx,
      is_correct: correct,
      points: pts,
    })

    // actualizar score del jugador
    const { data: player } = await supabase.from('players').select('score').eq('id', playerId).single()
    const newScore = (player?.score || 0) + pts
    await supabase.from('players').update({ score: newScore }).eq('id', playerId)
    setTotalScore(newScore)

    // incrementar contador de respuestas
    await supabase.rpc('increment_answers')
  }

  const currentQ = gameState ? QUESTIONS[gameState.current_question - 1] : null
  const timerPct = currentQ ? (timeLeft / currentQ.timeLimit) * 100 : 0

  // ── FINISHED ─────────────────────────────────────────────────
  if (phase === 'finished') {
    return (
      <div style={{ minHeight:'100vh', background:'#0f172a', color:'#fff', fontFamily:'sans-serif', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:64, marginBottom:16 }}>🏆</div>
          <h2 style={{ fontSize:28, fontWeight:700, marginBottom:8 }}>¡Juego terminado!</h2>
          <p style={{ color:'#94a3b8', marginBottom:24 }}>tu puntaje final</p>
          <div style={{ fontSize:56, fontWeight:700, color:'#f59e0b' }}>{totalScore}</div>
          <p style={{ color:'#64748b', marginTop:8 }}>pts</p>
        </div>
      </div>
    )
  }

  // ── BLOCK BREAK ───────────────────────────────────────────────
  if (phase === 'block_break') {
    return (
      <div style={{ minHeight:'100vh', background:'#0f172a', color:'#fff', fontFamily:'sans-serif', padding:24 }}>
        <div style={{ maxWidth:400, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:24 }}>
            <div style={{ fontSize:40, marginBottom:8 }}>📊</div>
            <h2 style={{ fontSize:22, fontWeight:700 }}>Ranking parcial</h2>
          </div>
          {blockRanking.map((p, i) => (
            <div key={i} style={{
              display:'flex', alignItems:'center', gap:12,
              background: p.name === playerName ? '#1d4ed8' : '#1e293b',
              borderRadius:10, padding:'12px 16px', marginBottom:8
            }}>
              <div style={{ fontSize:20, minWidth:28 }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`}
              </div>
              <div style={{ flex:1, fontSize:15 }}>{p.name}</div>
              <div style={{ fontWeight:700, color:'#f59e0b' }}>{p.score} pts</div>
            </div>
          ))}
          <div style={{ textAlign:'center', marginTop:24, color:'#475569', fontSize:13 }}>
            esperando siguiente bloque...
          </div>
        </div>
      </div>
    )
  }

  if (!currentQ) return (
    <div style={{ minHeight:'100vh', background:'#0f172a', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'sans-serif' }}>
      <div style={{ color:'#94a3b8' }}>cargando...</div>
    </div>
  )

  const optColors = ['#3b82f6','#8b5cf6','#f59e0b','#10b981']
  const optEmojis = ['A','B','C','D']

  return (
    <div style={{ minHeight:'100vh', background:'#0f172a', color:'#fff', fontFamily:'sans-serif', padding:16 }}>
      <div style={{ maxWidth:480, margin:'0 auto' }}>

        {/* header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:11, color:'#94a3b8' }}>pregunta {gameState?.current_question}/20</div>
            <div style={{ fontSize:13, color:'#64748b' }}>{currentQ.blockLabel}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:11, color:'#94a3b8' }}>mis puntos</div>
            <div style={{ fontSize:18, fontWeight:700, color:'#f59e0b' }}>{totalScore}</div>
          </div>
        </div>

        {/* timer */}
        {!answered && (
          <div style={{ marginBottom:16 }}>
            <div style={{ background:'#1e293b', borderRadius:99, height:8, overflow:'hidden' }}>
              <div style={{
                height:8, borderRadius:99,
                background: timerPct > 50 ? '#22c55e' : timerPct > 25 ? '#f59e0b' : '#ef4444',
                width:`${timerPct}%`, transition:'width 0.2s linear'
              }} />
            </div>
            <div style={{ textAlign:'right', fontSize:12, color:'#64748b', marginTop:4 }}>
              {Math.ceil(timeLeft)}s
            </div>
          </div>
        )}

        {/* pregunta */}
        <div style={{ background:'#1e293b', borderRadius:16, padding:20, marginBottom:16 }}>
          <p style={{ fontSize:18, fontWeight:600, lineHeight:1.4 }}>{currentQ.question}</p>
        </div>

        {/* opciones */}
        <div style={{ display:'grid', gridTemplateColumns: currentQ.type === 'truefalse' ? '1fr 1fr' : '1fr', gap:10, marginBottom:16 }}>
          {currentQ.options.map((opt, i) => {
            let bg = optColors[i] + '22'
            let border = optColors[i] + '66'
            let textColor = '#fff'

            if (answered) {
              if (i === currentQ.correct) { bg = '#22c55e33'; border = '#22c55e'; }
              else if (i === selectedIdx && !isCorrect) { bg = '#ef444433'; border = '#ef4444'; }
              else { bg = '#1e293b'; border = '#334155'; textColor = '#475569' }
            } else if (selectedIdx === i) {
              bg = optColors[i] + '44'; border = optColors[i]
            }

            return (
              <button key={i} onClick={() => answer(i)} disabled={answered}
                style={{
                  background:bg, border:`2px solid ${border}`, borderRadius:12,
                  padding:'14px 16px', color:textColor, fontSize:15, fontWeight:500,
                  cursor: answered ? 'default' : 'pointer', textAlign:'left',
                  display:'flex', alignItems:'center', gap:10, transition:'all 0.15s'
                }}>
                <span style={{
                  width:28, height:28, borderRadius:'50%', background:answered?'transparent':optColors[i],
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:13, fontWeight:700, flexShrink:0
                }}>{optEmojis[i]}</span>
                {opt}
              </button>
            )
          })}
        </div>

        {/* feedback */}
        {answered && (
          <div style={{
            background: isCorrect ? '#14532d' : '#450a0a',
            borderRadius:12, padding:16, textAlign:'center'
          }}>
            <div style={{ fontSize:32, marginBottom:4 }}>{isCorrect ? '✅' : '❌'}</div>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>
              {isCorrect ? `+${pointsEarned} puntos` : 'incorrecto'}
            </div>
            <div style={{ fontSize:13, color:'#94a3b8' }}>
              {isCorrect ? 'esperando al resto...' : `la respuesta era: ${currentQ.options[currentQ.correct]}`}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
