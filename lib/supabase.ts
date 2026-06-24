import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type Player = {
  id: string
  name: string
  is_admin: boolean
  score: number
  joined_at: string
}

export type GameState = {
  id: string
  status: 'lobby' | 'playing' | 'block_break' | 'finished'
  current_question: number
  question_started_at: string | null
  answers_count: number
}

export type Answer = {
  id: string
  player_id: string
  question_id: number
  answer_index: number
  is_correct: boolean
  points: number
  answered_at: string
}
