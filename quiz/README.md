# Quiz · Organización corporal — Despliegue (2026-II)

Instrumento de autoevaluación con la arquitectura antifraude de 3 capas del curso.
**Regla de oro (§6 del HANDOFF): para cada instrumento nuevo → token nuevo, hoja nueva, `STORAGE_KEY` nuevo.**

## Archivos
- `quiz_organizacion_corporal.html` — Capa 1 (cliente autocontenido: roster, A/B, contadores, `sendBeacon`).
- `Code.gs` — Capa 2 (Apps Script: routing por token + **recálculo en servidor** + logueo de 3 eventos).
- `dashboard.html` — Capa 3 (panel con token, auto-refresh 15 s, export CSV).

## Valores de este instrumento (YA CONFIGURADOS)
| Parámetro | Dónde | Valor |
|---|---|---|
| `STORAGE_KEY` | quiz HTML | `MORFO_ORGCORP_2026II_v1` ✔ |
| `TOKEN` | quiz HTML **y** `Code.gs` | `QUIZ_ORGCORP_MORF_2026II_8dd5f3` ✔ (coincide en ambos) |
| `ENDPOINT` | quiz HTML **y** dashboard | `.../AKfycbwI9SiJIwScuhYtnpczk2V-js_WGAE97Xtm--nmK3waDqoZES-FQi320HsyK5Ir62_C/exec` ✔ |
| Hoja nueva | Google Sheets | ligada al Apps Script; `Respuestas` y `Eventos` se autocrean |

> ⚠️ **Importante:** el `Code.gs` que desplegaste tenía el token placeholder. Vuelve a **pegar el `Code.gs` actualizado** (con `QUIZ_ORGCORP_MORF_2026II_8dd5f3`) en el editor de Apps Script y **redesplega como "Versión nueva"** (el endpoint `/exec` NO cambia). Si no, el servidor rechazará los envíos por `token_invalido`.

## Pasos

### 1) Roster (Capa 1)
En `quiz_organizacion_corporal.html`, edita el objeto `ROSTER` con el **listado oficial 2026-II** de G1 (26) y G2 (28). Es un **selector**, no texto libre (§5 del HANDOFF). No dejes los nombres de ejemplo.

### 2) Backend (Capa 2)
1. Abre la Hoja de cálculo nueva → **Extensiones → Apps Script**.
2. Pega `Code.gs`. Ajusta `CONFIG.TOKEN` (igual que en el HTML) y, si usas una hoja no ligada, `CONFIG.SHEET_ID`.
3. Verifica que `ANSWER_KEY` coincide con las respuestas del banco (ya viene sincronizada: q01=b … q12=c).
4. **Implementar → Nueva implementación → Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
5. Copia la URL `/exec`.

Las hojas `Respuestas` y `Eventos` se crean solas con sus encabezados en el primer envío. El encabezado del puntaje es **`Puntaje`** (sin sufijo) — fix del bug #2 del HANDOFF.

### 3) Enlazar endpoint
Pega la URL `/exec` en:
- `quiz_organizacion_corporal.html` → `CONFIG.ENDPOINT`
- `dashboard.html` → campo *endpoint* (se guarda en la sesión del navegador)

### 4) Publicar
`git add . && git commit -m "Quiz organización corporal 2026-II" && git push` → GitHub Pages en 1–2 min.
> Redesplegar el Apps Script como **"Versión nueva"** NO cambia el endpoint.

## Qué registra (Capa 2)
- **`envio`** → fila en `Respuestas` con puntaje **recalculado en servidor**, `Maximo`, `Porcentaje`, `PuntajeCliente`, `Discrepancia` (1=roja si cliente≠servidor) y contadores.
- **`antifraude`** → fila en `Eventos`: tab switch, blur, devtools, copy/cut, **paste (rojo)**, right-click, discrepancia.
- **`reinicio_detectado`** → fila en `Eventos` vía `navigator.sendBeacon` en `beforeunload`.

Umbrales del dashboard: TabSwitch **>5 ámbar / >15 rojo**, Paste y Discrepancia siempre en **rojo**.

## Antifraude — comportamiento
- **Versionado A/B**: hash determinístico del nombre → versión A o B; en B se barajan preguntas y opciones con semilla. El servidor recalcula por `id` estable, así el barajado no afecta la nota.
- **Reinicio**: preserva `startTime` desde `sessionStorage` si han pasado <3 h (fix bug #1), así el tiempo no se reinicia a 0.
- **7 claves de identidad** en `sessionStorage` (grupo, alumno, versión, startTime, answers, sessionId, submitted).

## Checklist de examen (§9 del HANDOFF)
- [ ] `TOKEN` + `STORAGE_KEY` nuevos y coincidentes HTML↔Apps Script
- [ ] Hoja nueva creada y verificada
- [ ] Roster oficial pegado (selector, sin texto libre)
- [ ] Encabezado `Puntaje` (sin sufijo)
- [ ] A/B verificado (probar con dos nombres que caigan en A y B)
- [ ] Web App "Cualquier usuario"
- [ ] Prueba de envío hecha desde otro navegador y **fila de prueba borrada**
- [ ] Dashboard probado (carga, auto-refresh, CSV)

> Nota: este quiz está configurado como **autoevaluación** (peso de actividad, sin bloqueos duros). Si lo conviertes en evaluable con más peso, sube `SUBMIT_LOCK` (segundos mínimos antes de habilitar *Enviar*) y considera las mejoras de seguridad pendientes del §7.
