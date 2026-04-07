# AMPM People Strategy — Guía de Deploy
## Vercel + Supabase

---

## PASO 1 — Configurar Supabase (5 minutos)

1. Ve a **https://supabase.com** → abre tu proyecto
2. En el menú lateral ve a **SQL Editor** → **New Query**
3. Copia todo el contenido del archivo `supabase-schema.sql` y pégalo
4. Haz clic en **Run** (▶)
5. Deberías ver "Success. No rows returned"

Esto crea:
- Tabla `profiles` (datos de usuarios)
- Tabla `conversations` (historial de chats)
- Tabla `messages` (mensajes)
- Tabla `knowledge` (memoria compartida aprendida)
- Tabla `documents` (archivos subidos)
- Tabla `usage_log` (registro de consultas)
- Storage bucket `documents` para archivos
- Trigger automático para crear perfil al registrarse

---

## PASO 2 — Habilitar Auth en Supabase (2 minutos)

1. En Supabase → **Authentication** → **Providers**
2. Verifica que **Email** esté habilitado (debería estar por defecto)
3. En **Authentication** → **Email Templates** puedes personalizar el email de confirmación
4. En **Authentication** → **URL Configuration** → agrega la URL de tu app Vercel (la agregas después del deploy)

**Opcional — deshabilitar confirmación de email para facilitar el acceso:**
En Supabase → Authentication → Settings → desactiva "Enable email confirmations"
Esto permite que los usuarios entren inmediatamente sin confirmar email.

---

## PASO 3 — Subir el código a GitHub (3 minutos)

1. Crea un repositorio en **https://github.com/new** (puede ser privado)
2. Abre una terminal en la carpeta del proyecto y ejecuta:

```bash
git init
git add .
git commit -m "Initial commit — AMPM People Strategy"
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

---

## PASO 4 — Deploy en Vercel (5 minutos)

1. Ve a **https://vercel.com** → **Add New Project**
2. Conecta tu cuenta de GitHub y selecciona el repositorio
3. Vercel detecta automáticamente que es un proyecto Next.js
4. Antes de hacer clic en Deploy, configura las **Environment Variables**:

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xhbbkbzvrgksrnuuwfbs.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_BT-lhQQtXQ80IZ3AqvH6SA_wn-2NG-u` |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (la key completa) |
| `GEMINI_API_KEY` | `AIzaSyA6DGuAACxdI7ZUZ4IixCz7bclVLUv_JAU` |
| `MONTHLY_QUERY_LIMIT` | `200` |
| `NEXT_PUBLIC_APP_NAME` | `AMPM People Strategy` |

5. Haz clic en **Deploy**
6. Espera 2-3 minutos. Vercel te dará una URL como `ampm-chat.vercel.app`

---

## PASO 5 — Configurar URL en Supabase (1 minuto)

1. Copia la URL que te dio Vercel (ej. `https://ampm-chat.vercel.app`)
2. En Supabase → **Authentication** → **URL Configuration**
3. En **Site URL** pon tu URL de Vercel
4. En **Redirect URLs** agrega: `https://ampm-chat.vercel.app/**`
5. Guarda

---

## PASO 6 — Crear el primer usuario admin (2 minutos)

1. Ve a tu app en Vercel → Regístrate con tu email y contraseña
2. En Supabase → **Table Editor** → tabla `profiles`
3. Busca tu usuario → edita el campo `is_admin` a `true`

---

## ✅ LISTO

Tu app estará disponible en `https://ampm-chat.vercel.app` (o el dominio personalizado que configures).

Cada vez que hagas cambios y los subas a GitHub, Vercel hace el deploy automáticamente.

---

## CÓMO FUNCIONA

**Para usuarios:**
- Entran al link, se registran con email/contraseña
- El sistema les pregunta nombre, puesto y país
- Pueden chatear con el asesor, subir Excel, PDFs e imágenes
- El historial de conversaciones se guarda
- Tienen un límite de 200 consultas por mes

**Aprendizaje compartido:**
- Después de cada respuesta, el sistema extrae automáticamente 1-3 insights de la conversación
- Estos insights se guardan en la tabla `knowledge`
- Todos los usuarios se benefician del conocimiento que generan las conversaciones del equipo
- El asesor usa este conocimiento acumulado en futuras respuestas

**Para ver qué aprende el sistema:**
- En Supabase → Table Editor → tabla `knowledge`
- Ahí verás todos los insights acumulados, quién los generó y de qué país

---

## DOMINIO PERSONALIZADO (opcional)

En Vercel → tu proyecto → **Settings** → **Domains** → agrega `chat.ampm.com` o el subdominio que prefieras.

---

## LÍMITE DE CONSULTAS

El límite por defecto es 200 por usuario por mes. Para cambiarlo:
- En Vercel → Settings → Environment Variables → cambia `MONTHLY_QUERY_LIMIT`
- O per-usuario: puedes agregar una columna `monthly_limit` a la tabla `profiles`

---

## SOPORTE

Si algo falla en el deploy, los errores más comunes son:
1. **Build error** → verifica que todas las env variables estén correctas en Vercel
2. **Auth no funciona** → verifica la Site URL en Supabase Authentication
3. **Archivos no suben** → verifica que el bucket `documents` se creó en Supabase Storage
