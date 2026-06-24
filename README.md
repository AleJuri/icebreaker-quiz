# 🎮 Icebreaker Quiz

Quiz multijugador en tiempo real para icebreakers empresariales.

## Stack
- **Next.js 14** — frontend
- **Supabase** — base de datos + realtime (gratis)
- **Vercel** — deploy (gratis)

---

## Setup paso a paso

### 1. Supabase (5 min)

1. Entrá a https://supabase.com y creá una cuenta gratis
2. Creá un nuevo proyecto
3. Andá a **SQL Editor** y ejecutá todo el contenido de `lib/schema.sql`
4. Andá a **Settings → API** y copiá:
   - `Project URL`
   - `anon public key`

### 2. Variables de entorno

Copiá `.env.example` como `.env.local`:

```bash
cp .env.example .env.local
```

Completá con tus datos de Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=https://XXXXXXXXXX.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 3. Función increment_answers en Supabase

En el **SQL Editor** de Supabase ejecutá también esto:

```sql
create or replace function increment_answers()
returns void as $$
begin
  update game_state set answers_count = answers_count + 1 where id = 'game';
end;
$$ language plpgsql;
```

### 4. Correr local

```bash
npm install
npm run dev
```

Abrí http://localhost:3000

### 5. Deploy en Vercel (5 min)

1. Subí el código a GitHub
2. Entrá a https://vercel.com → New Project → importá el repo
3. En **Environment Variables** agregá las dos variables de Supabase
4. Deploy → listo

---

## Cómo jugar

| URL | quién | qué hace |
|-----|-------|----------|
| `/` | host (proyector) | lobby con QR, botón comenzar |
| `/join` | jugadores (celu) | ingresan nombre |
| `/game/host` | host | pantalla del juego para proyector |
| `/game/player` | jugadores | responden desde celu |

### Flujo completo

1. Host abre `/` en el proyector
2. Jugadores escanean QR o entran a `/join`
3. Cada uno ingresa su nombre → aparece en el lobby con ✓
4. Host aprieta **Comenzar juego**
5. Todos ven preguntas en su celu, responden
6. Más rápido + correcto = más puntos (max 1000, min 100)
7. Al terminar cada bloque se ve el ranking parcial
8. Al final se muestra el podio 🏆

---

## Personalizar preguntas

Editá `lib/questions.ts`. Cada pregunta tiene:

```ts
{
  id: 6,
  block: 'empresa',         // messi | empresa | verdadero_falso
  blockLabel: '🏢 Bloque Empresa',
  type: 'multiple',         // multiple | truefalse
  question: '¿En qué año fue fundada la empresa?',
  options: ['2005', '2008', '2010', '2015'],
  correct: 1,               // índice (0-based) de la opción correcta
  timeLimit: 25,            // segundos para responder
}
```

---

## Resetear el juego

En la página del lobby hay un botón **reset** que borra todos los jugadores y respuestas.
También podés ejecutar en Supabase SQL Editor:

```sql
select reset_game();
```
