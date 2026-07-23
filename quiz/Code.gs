/**********************************************************************
 * MORFOLOGÍA GENERAL · Optometría · U. de La Salle
 * Capa 2 — Apps Script backend del Quiz "Organización corporal"
 *
 * Funciones:
 *   - Routing por TOKEN (rechaza payloads que no coincidan).
 *   - RECÁLCULO del puntaje en el servidor (el cliente no es fuente de verdad).
 *   - Logueo de 3 tipos de evento: "envio", "antifraude", "reinicio_detectado".
 *   - Encabezado 'Puntaje' (sin sufijo) — fix del HANDOFF (bug #2).
 *
 * DESPLIEGUE:
 *   1) Pega este código en un proyecto de Apps Script ligado a la Hoja.
 *   2) Ajusta CONFIG (TOKEN y, opcional, SHEET_ID).
 *   3) Implementar → Nueva implementación → Aplicación web
 *        · Ejecutar como: Yo
 *        · Quién tiene acceso: Cualquier usuario
 *   4) Copia la URL /exec al ENDPOINT del quiz y del dashboard.
 *   Redespliegue como "Versión nueva" NO cambia el endpoint.
 **********************************************************************/

/* ============ CONFIG (debe coincidir con el HTML) ============ */
var CONFIG = {
  TOKEN   : "QUIZ_ORGCORP_MORF_2026II_8dd5f3",  // = CONFIG.TOKEN del quiz
  SHEET_ID: "",            // vacío = usa la hoja ligada (getActiveSpreadsheet)
  TAB_RESP: "Respuestas",  // envíos calificados
  TAB_LOG : "Eventos",     // antifraude + reinicios
  TAB_ASIS: "Asistencia",  // registro de asistencia diario
  SESION_TEMA : "Organización corporal (planos, ejes, posición anatómica)",
  MAX     : 12
};

/* ============ ROSTER para asistencia (opcional) ============
   Si pegas los nombres, el formulario muestra un SELECTOR.
   Si lo dejas vacío, el formulario usa campo de texto (sirve hoy mismo). */
var ROSTER = {
  G1: [ /* "APELLIDO Nombre", ... 26 de G1 */ ],
  G2: [ /* "APELLIDO Nombre", ... 28 de G2 */ ]
};

/* ============ CLAVE DE RESPUESTAS (server-side truth) ============
   Debe reflejar 'correct' del banco en el quiz. Por id estable. */
var ANSWER_KEY = {
  q01:"b", q02:"c", q03:"b", q04:"a", q05:"b", q06:"a",
  q07:"b", q08:"c", q09:"b", q10:"c", q11:"b", q12:"c"
};

/* ============ ENTRADAS ============ */
function doPost(e){
  var lock = LockService.getScriptLock();
  try{ lock.waitLock(20000); }catch(err){ return json_({ok:false,error:"busy"}); }
  try{
    var data = parseBody_(e);
    if(!data || data.token !== CONFIG.TOKEN){
      return json_({ok:false, error:"token_invalido"});
    }
    switch(data.evento){
      case "envio":               return handleEnvio_(data);
      case "antifraude":          return handleEvento_(data, "antifraude");
      case "reinicio_detectado":  return handleEvento_(data, "reinicio_detectado");
      default:                    return handleEvento_(data, data.evento || "desconocido");
    }
  } catch(err){
    return json_({ok:false, error:String(err)});
  } finally {
    lock.releaseLock();
  }
}

// sendBeacon envía como texto plano; también soporta form-encoded.
function parseBody_(e){
  if(!e || !e.postData) return null;
  var raw = e.postData.contents || "";
  try{ return JSON.parse(raw); }catch(_){}
  if(e.parameter && e.parameter.payload){ try{ return JSON.parse(e.parameter.payload); }catch(_){} }
  return null;
}

/* ============ ENVÍO: recalcula puntaje ============ */
function handleEnvio_(data){
  var answers = data.answers || {};
  var server  = 0, contestadas = 0;
  for(var qid in ANSWER_KEY){
    if(answers.hasOwnProperty(qid)){
      contestadas++;
      if(String(answers[qid]) === ANSWER_KEY[qid]) server++;
    }
  }
  var client = (typeof data.clientScore === "number") ? data.clientScore : null;
  var discrepancia = (client !== null && client !== server) ? 1 : 0;

  var sh = sheet_(CONFIG.TAB_RESP, RESP_HEADERS_);
  var c  = data.counters || {};
  sh.appendRow([
    new Date(),                          // Timestamp
    data.grupo || "",                    // Grupo
    data.alumno || "",                   // Alumno
    data.version || "",                  // Version
    data.unidad || "",                   // Unidad
    server,                              // Puntaje   <-- encabezado 'Puntaje' (fix)
    CONFIG.MAX,                          // Maximo
    Math.round(1000*server/CONFIG.MAX)/10, // Porcentaje
    (client===null?"":client),           // PuntajeCliente
    discrepancia,                        // Discrepancia (1=roja)
    contestadas,                         // Contestadas
    num_(c.tab), num_(c.blur), num_(c.devtools),
    num_(c.copy), num_(c.cut), num_(c.paste), num_(c.rightclick),
    num_(c.forcedTimer),                 // ForzadoTimer
    data.sessionId || "",
    tsFromMs_(data.startTime),           // Inicio
    JSON.stringify(answers)              // RespuestasJSON (auditoría)
  ]);

  if(discrepancia){
    logRow_({grupo:data.grupo, alumno:data.alumno, version:data.version,
             sessionId:data.sessionId, tipo:"discrepancia_cliente_servidor",
             valor:client+"/"+server, evento:"antifraude"});
  }
  return json_({ok:true, serverScore:server, max:CONFIG.MAX, discrepancia:discrepancia});
}

/* ============ EVENTOS (antifraude / reinicio) ============ */
function handleEvento_(data, evento){
  // los reinicios pueden llegar por sendBeacon con counters + answers
  logRow_({
    grupo:data.grupo, alumno:data.alumno, version:data.version,
    sessionId:data.sessionId,
    tipo: data.tipo || evento,
    valor: (data.valor!==undefined ? data.valor : ""),
    evento: evento,
    extra: data.counters ? JSON.stringify(data.counters) : ""
  });
  return json_({ok:true});
}

function logRow_(o){
  var sh = sheet_(CONFIG.TAB_LOG, LOG_HEADERS_);
  sh.appendRow([
    new Date(), o.evento||"", o.tipo||"", o.valor===undefined?"":o.valor,
    o.grupo||"", o.alumno||"", o.version||"", o.sessionId||"", o.extra||""
  ]);
}

/* ============ doGet: sirve el formulario o entrega datos ============ */
function doGet(e){
  var p = e && e.parameter ? e.parameter : {};

  // 1) Formulario de asistencia servido por el propio Apps Script (link para estudiantes)
  if(p.page === "asistencia"){
    return HtmlService.createHtmlOutput(asistenciaHtml_())
      .setTitle("Asistencia · Morfología General")
      .addMetaTag("viewport","width=device-width, initial-scale=1")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // 2) Lectura de datos para el dashboard (requiere token)
  if(p.token !== CONFIG.TOKEN) return json_({ok:false, error:"token_invalido"});
  if(p.action === "asistencia") return json_({ok:true, rows: readSheet_(CONFIG.TAB_ASIS)});
  if(p.action === "eventos")    return json_({ok:true, rows: readSheet_(CONFIG.TAB_LOG)});
  return json_({ok:true, rows: readSheet_(CONFIG.TAB_RESP)});
}

/* ============ ASISTENCIA ============ */
var ASIS_HEADERS_ = ["Timestamp","Fecha","Grupo","Alumno","Codigo","Tema"];

// Llamada desde el formulario vía google.script.run (sin CORS).
function registrarAsistencia(data){
  var lock = LockService.getScriptLock();
  try{ lock.waitLock(20000); }catch(err){ return {ok:false, error:"busy"}; }
  try{
    data = data || {};
    var grupo  = String(data.grupo  || "").trim();
    var alumno = String(data.alumno || "").trim();
    if(!grupo || !alumno) return {ok:false, error:"faltan_datos"};
    var codigo = String(data.codigo || "").trim();
    var hoy = fechaHoy_();

    var sh = sheet_(CONFIG.TAB_ASIS, ASIS_HEADERS_);
    var vals = sh.getDataRange().getValues();
    for(var i=1;i<vals.length;i++){
      if(String(vals[i][1])===hoy &&
         String(vals[i][2])===grupo &&
         String(vals[i][3]).toLowerCase()===alumno.toLowerCase()){
        return {ok:true, dup:true, fecha:hoy};   // ya registrado hoy
      }
    }
    sh.appendRow([ new Date(), hoy, grupo, alumno, codigo, CONFIG.SESION_TEMA ]);
    return {ok:true, dup:false, fecha:hoy};
  } finally { lock.releaseLock(); }
}

function fechaHoy_(){
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

// HTML del formulario (parchment/amber/ink) servido en /exec?page=asistencia
function asistenciaHtml_(){
  var roster = JSON.stringify(ROSTER || {G1:[],G2:[]});
  var hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEEE d 'de' MMMM, yyyy");
  var tema = CONFIG.SESION_TEMA;
  return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">'
  + '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Source+Serif+4:wght@400;600&family=DM+Mono:wght@500&display=swap" rel="stylesheet">'
  + '<style>'
  + ':root{--parchment:#f5ecd6;--amber:#c89b3c;--amber-deep:#a97e28;--ink:#1c1815;--ink-soft:#4a4239;--teal:#2a7a6e;--blue:#2d5d8f;--rust:#a0522d;--line:#d9c9a3;--card:#fffaf0}'
  + '*{box-sizing:border-box}body{margin:0;background:var(--parchment);color:var(--ink);font-family:"Source Serif 4",Georgia,serif;font-size:17px}'
  + '.wrap{max-width:480px;margin:0 auto;padding:22px 18px 60px}'
  + '.card{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:0 8px 24px rgba(28,24,21,.10);padding:24px;margin-top:18px}'
  + '.kicker{font-family:"DM Mono",monospace;font-size:.7rem;letter-spacing:.2em;text-transform:uppercase;color:var(--amber-deep);margin:0 0 8px}'
  + 'h1{font-family:"Playfair Display",serif;font-weight:900;font-size:1.7rem;margin:0 0 4px;line-height:1.1}'
  + '.tema{color:var(--ink-soft);font-style:italic;margin:0 0 2px}.fecha{font-family:"DM Mono",monospace;font-size:.8rem;color:var(--teal);text-transform:capitalize}'
  + 'label{display:block;font-weight:600;margin:16px 0 6px;font-size:.95rem}'
  + 'select,input{width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;background:#fff;font:inherit;color:var(--ink)}'
  + 'button{width:100%;margin-top:22px;cursor:pointer;font-family:"DM Mono",monospace;letter-spacing:.05em;text-transform:uppercase;font-size:.85rem;border:none;border-radius:999px;padding:14px;background:var(--teal);color:#fff;font-weight:500}'
  + 'button:disabled{background:#b9c9c5;cursor:not-allowed}'
  + '.hint{font-size:.82rem;color:var(--ink-soft);margin-top:6px}'
  + '.ok{text-align:center}.ok .big{font-family:"Playfair Display",serif;font-size:2.4rem;color:var(--teal);margin:.2em 0}'
  + '.err{color:var(--rust);font-size:.9rem;margin-top:10px;text-align:center}'
  + '.badge{display:inline-block;background:#eefaf6;color:var(--teal);border:1px solid var(--teal);border-radius:999px;padding:4px 12px;font-family:"DM Mono",monospace;font-size:.75rem;margin-top:8px}'
  + '</style></head><body><div class="wrap">'
  + '<p class="kicker">Morfología General · Optometría · 2026-II</p>'
  + '<div class="card" id="form">'
  + '<h1>Asistencia</h1><p class="tema">'+tema+'</p><p class="fecha">'+hoy+'</p>'
  + '<label for="grupo">Grupo</label>'
  + '<select id="grupo"><option value="">— Selecciona —</option>'
  + '<option value="G1">G1 · 07:00–09:00 (Aula 402P)</option>'
  + '<option value="G2">G2 · 09:00–11:00 (Aula 403OPT)</option></select>'
  + '<div id="nameWrap"><label for="alumno">Nombre completo</label>'
  + '<input id="alumno" type="text" placeholder="Apellidos y nombres" autocomplete="off"></div>'
  + '<label for="codigo">Código estudiantil <span style="font-weight:400;color:#8a7f70">(opcional)</span></label>'
  + '<input id="codigo" type="text" inputmode="numeric" placeholder="Código o documento" autocomplete="off">'
  + '<button id="btn" disabled>Registrar asistencia</button>'
  + '<p class="hint">Registra tu asistencia una sola vez. Si la envías de nuevo, no se duplica.</p>'
  + '<p class="err" id="err"></p>'
  + '</div>'
  + '<div class="card ok" id="done" style="display:none">'
  + '<h1>¡Listo!</h1><div class="big">✓</div>'
  + '<p id="doneMsg">Tu asistencia quedó registrada.</p><span class="badge" id="doneName"></span>'
  + '</div>'
  + '</div>'
  + '<script>'
  + 'var ROSTER='+roster+';'
  + 'var g=document.getElementById("grupo"),a=document.getElementById("alumno"),'
  + 'c=document.getElementById("codigo"),b=document.getElementById("btn"),err=document.getElementById("err"),nw=document.getElementById("nameWrap");'
  + 'function buildName(){var grp=g.value,list=(ROSTER[grp]||[]);'
  + 'if(list.length){nw.innerHTML=\'<label for="alumno">Nombre (listado oficial)</label><select id="alumno"><option value="">— Selecciona tu nombre —</option>\'+list.map(function(n){return \'<option value="\'+n+\'">\'+n+\'</option>\'}).join("")+"</select>";}'
  + 'else{nw.innerHTML=\'<label for="alumno">Nombre completo</label><input id="alumno" type="text" placeholder="Apellidos y nombres" autocomplete="off">\';}'
  + 'a=document.getElementById("alumno");a.addEventListener("input",chk);a.addEventListener("change",chk);chk();}'
  + 'function chk(){b.disabled=!(g.value && document.getElementById("alumno").value.trim());}'
  + 'g.addEventListener("change",buildName);a.addEventListener("input",chk);'
  + 'b.addEventListener("click",function(){b.disabled=true;b.textContent="Enviando…";err.textContent="";'
  + 'var payload={grupo:g.value,alumno:document.getElementById("alumno").value.trim(),codigo:c.value.trim()};'
  + 'google.script.run.withSuccessHandler(function(r){'
  + 'if(r&&r.ok){document.getElementById("form").style.display="none";var d=document.getElementById("done");'
  + 'document.getElementById("doneName").textContent=payload.grupo+" · "+payload.alumno;'
  + 'document.getElementById("doneMsg").textContent=r.dup?"Ya tenías tu asistencia registrada hoy.":"Tu asistencia quedó registrada.";d.style.display="block";}'
  + 'else{err.textContent="No se pudo registrar"+(r&&r.error?" ("+r.error+")":"")+". Intenta de nuevo.";b.disabled=false;b.textContent="Registrar asistencia";}})'
  + '.withFailureHandler(function(e){err.textContent="Error de conexión. Intenta de nuevo.";b.disabled=false;b.textContent="Registrar asistencia";})'
  + '.registrarAsistencia(payload);});'
  + '</scr'+'ipt></body></html>';
}

/* ============ HELPERS ============ */
var RESP_HEADERS_ = ["Timestamp","Grupo","Alumno","Version","Unidad","Puntaje","Maximo",
  "Porcentaje","PuntajeCliente","Discrepancia","Contestadas","TabSwitch","Blur","DevTools",
  "Copy","Cut","Paste","RightClick","ForzadoTimer","SessionId","Inicio","RespuestasJSON"];
var LOG_HEADERS_ = ["Timestamp","Evento","Tipo","Valor","Grupo","Alumno","Version","SessionId","Extra"];

function ss_(){ return CONFIG.SHEET_ID ? SpreadsheetApp.openById(CONFIG.SHEET_ID)
                                       : SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name, headers){
  var ss = ss_(); var sh = ss.getSheetByName(name);
  if(!sh){ sh = ss.insertSheet(name); sh.appendRow(headers); sh.setFrozenRows(1); }
  else if(sh.getLastRow()===0){ sh.appendRow(headers); sh.setFrozenRows(1); }
  return sh;
}
function readSheet_(name){
  var sh = ss_().getSheetByName(name);
  if(!sh || sh.getLastRow()<2) return [];
  var vals = sh.getDataRange().getValues();
  var head = vals.shift();
  return vals.map(function(r){ var o={}; head.forEach(function(h,i){ o[h]=r[i]; }); return o; });
}
function num_(v){ return (typeof v==="number") ? v : 0; }
function tsFromMs_(ms){ return ms ? new Date(Number(ms)) : ""; }
function json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
