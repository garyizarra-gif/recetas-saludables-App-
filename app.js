// Recetas Saludables - PWA offline (piloto Fase 4b). Sin llamadas a red en tiempo de ejecucion.
"use strict";

const IMG_BASE = "imagenes_piloto/"; // en este sitio publicado, las imagenes van al mismo nivel que index.html
const TIPOS_COMIDA = ["desayuno", "snack", "almuerzo", "postre", "bebida"]; // para listar/buscar/favoritos (sin cena: no se planifica)
// La cena no se planifica (ver NOTA_CENA). Los renglones de cada plan se
// definen por sub-pestana en VISTAS_PLAN.
// La lonchera de los ninos sale de las entradas tipo_comida "snack" (asi quedaron
// guardadas las de la relacion de comida de la casa). Los demas renglones del
// planificador coinciden 1:1 con su tipo_comida.
const TIPO_COMIDA_DE_SLOT = { lonchera: "snack" };
function tipoComidaDeSlot(slot) { return TIPO_COMIDA_DE_SLOT[slot] || slot; }
const NOTA_CENA = "Para la cena, aprovecha lo que sobró del almuerzo.";
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const OBJETIVOS = [
  { id: "diabetes", label: "Diabetes / Prediabetes", icono: "🩸",
    filtro: r => (r.condiciones || []).includes("diabetes_prediabetes") },
  { id: "higado_graso", label: "Hígado graso", icono: "🫘",
    filtro: r => (r.condiciones || []).includes("higado_graso") },
  { id: "bajar_peso", label: "Bajar de peso", icono: "⚖️",
    filtro: r => (r.condiciones || []).includes("bajar_peso") },
  { id: "dia_a_dia", label: "Día a día", icono: "🍽️",
    filtro: r => (r.uso || []).includes("dia_a_dia") },
  { id: "bebidas", label: "Ideas de bebidas", icono: "🥤",
    filtro: r => r.tipo === "idea" },
];

let RECETAS = [];
let POR_ID = {};

function normalizar(s) {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\.$/, "");
}

function esIlegible(item) {
  return normalizar(item).includes("ilegible");
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

// ---------- almacenamiento local (favoritos, plan semanal) ----------
function cargarFavoritos() {
  try { return new Set(JSON.parse(localStorage.getItem("favoritos_v1") || "[]")); }
  catch (e) { return new Set(); }
}
function guardarFavoritos(set) {
  try { localStorage.setItem("favoritos_v1", JSON.stringify([...set])); } catch (e) {}
}
let FAVORITOS = cargarFavoritos();

function toggleFavorito(id) {
  if (FAVORITOS.has(id)) FAVORITOS.delete(id); else FAVORITOS.add(id);
  guardarFavoritos(FAVORITOS);
}

function cargarPlan(vista) {
  const v = VISTA(vista);
  let plan;
  try { plan = JSON.parse(localStorage.getItem(v.clave) || "null"); }
  catch (e) { return null; }
  if (!plan) return null;
  // Un plan guardado antes de que existiera un renglon (p. ej. la lonchera) no
  // lo trae: se completa solo lo que falta y se respeta lo ya elegido.
  const barajas = {};
  let completado = false;
  DIAS.forEach(dia => {
    if (!plan[dia]) { plan[dia] = {}; completado = true; }
    v.slots.forEach(t => {
      if (!(t in plan[dia])) {
        plan[dia][t] = siguienteDeBaraja(barajas, t, v.id);
        completado = true;
      }
    });
  });
  if (completado) guardarPlan(v.id, plan);
  return plan;
}
function guardarPlan(vista, plan) {
  try { localStorage.setItem(VISTA(vista).clave, JSON.stringify(plan)); } catch (e) {}
}

// ---------- generacion del planificador ----------
// El planificador es solo para Ayacucho/Peru: prioriza ingredientes accesibles
// y economicos de la region andina (campo apto_ayacucho) y deja fuera del plan
// diario lo pesado/frito (categoria_dia "ocasional").
//
// Son dos planes independientes, cada uno con su propio almacenamiento, para
// que no se mezclen ni se pisen entre si:
//   - "casa": solo la relacion de comida para cocinar de lunes a viernes
//     (desayuno, lonchera y almuerzo). Son indicaciones, no recetas.
//   - "recetario": solo las recetas con ingredientes y preparacion.
const VISTAS_PLAN = [
  { id: "casa", label: "Comida de la casa", slots: ["desayuno", "lonchera", "almuerzo"], clave: "plan_casa_v1" },
  { id: "recetario", label: "Recetario", slots: ["desayuno", "almuerzo"], clave: "plan_semanal_v1" },
];
function VISTA(id) { return VISTAS_PLAN.find(v => v.id === id) || VISTAS_PLAN[0]; }

function idsPorTipo(tipo) {
  return RECETAS.filter(r => r.tipo_comida === tipo).map(r => r.id);
}

function idsPorSlot(vista, slot) {
  const deLaCasa = vista === "casa";
  return RECETAS.filter(r => {
    if (r.tipo_comida !== tipoComidaDeSlot(slot)) return false;
    if (r.apto_ayacucho === false) return false;
    if (r.categoria_dia === "ocasional") return false; // chicharron, frituras: no en el plan diario
    return deLaCasa ? r.origen === "plan_semanal" : r.origen !== "plan_semanal";
  }).map(r => r.id);
}

function generarPlan(vista) {
  const v = VISTA(vista);
  const plan = {};
  const barajas = {};
  v.slots.forEach(t => { barajas[t] = mezclar(idsPorSlot(v.id, t)); });
  DIAS.forEach(dia => {
    plan[dia] = {};
    v.slots.forEach(t => {
      plan[dia][t] = siguienteDeBaraja(barajas, t, v.id);
    });
  });
  return plan;
}

function mezclar(ids) {
  const copia = [...ids];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// devuelve el siguiente id del "mazo" del slot; si se agota, se vuelve a mezclar
// (evita repetir mientras haya platos distintos disponibles; si solo hay 1, se repite por fuerza)
function siguienteDeBaraja(barajas, slot, vista) {
  if (!barajas[slot] || barajas[slot].length === 0) {
    const ids = idsPorSlot(vista, slot);
    if (ids.length === 0) return null;
    barajas[slot] = mezclar(ids);
  }
  return barajas[slot].shift() || null;
}

function cambiarPlato(vista, plan, dia, slot) {
  const actual = plan[dia][slot];
  const opciones = idsPorSlot(vista, slot).filter(id => id !== actual);
  if (opciones.length === 0) return plan; // no hay otra opcion disponible
  plan[dia][slot] = opciones[Math.floor(Math.random() * opciones.length)];
  guardarPlan(vista, plan);
  return plan;
}

// ---------- "Mi Plan": la semana armada a mano ----------
// A diferencia de los dos planes automaticos de arriba, este no se sortea: el
// usuario elige plato por plato en los catalogos y lo reparte el mismo.
// Especificacion: docs/superpowers/specs/2026-10-11-mi-plan-design.md
//
// Las loncheras salen SOLO de la relacion de comida de la casa. El recetario
// tiene 2 snacks y sus postres no viajan en una lonchera de colegio (helada,
// bavarois y mousse necesitan frio), asi que no se le pone ese renglon.
const MI_PLAN_SLOTS = {
  casa: ["desayuno", "lonchera", "almuerzo"],
  recetario: ["desayuno", "almuerzo"],
};
const MI_PLAN_FUENTES = ["casa", "recetario"];
const ETIQUETA_FUENTE = { casa: "De la comida de casa", recetario: "Del recetario" };
const CLAVE_MI_PLAN = "mi_plan_v1";
const CLAVE_ARCHIVO_MI_PLAN = "mi_plan_archivo_v1";
const TOPE_ARCHIVO_MI_PLAN = 2;
// Un enlace wa.me no admite adjuntos y su URL tiene un tope practico. Una
// semana compacta ronda los 1.600 caracteres, asi que normalmente cabe.
const TOPE_TEXTO_WHATSAPP = 2000;
// El usuario pidio quitar la lista de compras del PDF de Mi Plan ("por ahora").
// Queda detras de esta constante para poder devolverla cambiando un true.
const PDF_CON_LISTA_COMPRAS = false;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function fuenteDePlato(r) {
  return r && r.origen === "plan_semanal" ? "casa" : "recetario";
}

// El renglon natural de un plato sale de su tipo_comida (snack = lonchera).
// Devuelve null si su tipo no tiene renglon en su fuente.
function slotNaturalDePlato(r) {
  if (!r || !r.tipo_comida) return null;
  const slots = MI_PLAN_SLOTS[fuenteDePlato(r)] || [];
  for (let i = 0; i < slots.length; i++) {
    if (tipoComidaDeSlot(slots[i]) === r.tipo_comida) return slots[i];
  }
  return null;
}

// Solo es anadible si su renglon natural existe en su fuente. Eso deja fuera
// los postres, las bebidas, los snacks y la cena del recetario.
function platoEsAnadible(r) {
  return slotNaturalDePlato(r) !== null;
}

function miPlanVacio() {
  const semana = {};
  MI_PLAN_FUENTES.forEach(f => {
    semana[f] = {};
    DIAS.forEach(dia => {
      semana[f][dia] = {};
      MI_PLAN_SLOTS[f].forEach(slot => { semana[f][dia][slot] = null; });
    });
  });
  return { seleccion: [], semana: semana };
}

// Reconstruye el plan con la forma canonica: un plan guardado antes de que
// existiera un renglon no lo trae, y asi no hay que comprobar huecos por todas
// partes. Tambien deja las claves en orden fijo, para poder comparar planes.
function normalizarMiPlan(plan) {
  const base = miPlanVacio();
  if (!plan || typeof plan !== "object") return base;
  if (Array.isArray(plan.seleccion)) {
    base.seleccion = plan.seleccion.filter(id => typeof id === "string");
  }
  MI_PLAN_FUENTES.forEach(f => {
    DIAS.forEach(dia => {
      MI_PLAN_SLOTS[f].forEach(slot => {
        const guardado = plan.semana && plan.semana[f] && plan.semana[f][dia]
          ? plan.semana[f][dia][slot] : null;
        base.semana[f][dia][slot] = typeof guardado === "string" ? guardado : null;
      });
    });
  });
  return base;
}

function cargarMiPlan() {
  try {
    return normalizarMiPlan(JSON.parse(localStorage.getItem(CLAVE_MI_PLAN) || "null"));
  } catch (e) {
    return miPlanVacio();
  }
}
// Devuelve si de verdad pudo guardar. Si el navegador no deja usar el
// almacenamiento (modo privado, cuota llena, visor que lo bloquea), el plan se
// perderia en silencio: el usuario tocaria el + una y otra vez sin que se
// acumulase nada. Mejor decirselo.
function guardarMiPlan(plan) {
  try {
    localStorage.setItem(CLAVE_MI_PLAN, JSON.stringify(plan));
    return true;
  } catch (e) {
    return false;
  }
}

function miPlanContiene(plan, id) {
  if (plan.seleccion.indexOf(id) >= 0) return true;
  return MI_PLAN_FUENTES.some(f => DIAS.some(dia =>
    MI_PLAN_SLOTS[f].some(slot => plan.semana[f][dia][slot] === id)));
}

function miPlanTieneAlgo(plan) {
  return MI_PLAN_FUENTES.some(f => DIAS.some(dia =>
    MI_PLAN_SLOTS[f].some(slot => plan.semana[f][dia][slot])));
}

// Saca un plato de donde estuviera (seleccion o cualquier renglon). Es la pieza
// que garantiza que un id no pueda estar en dos sitios a la vez.
function quitarDeTodoMiPlan(plan, id) {
  plan.seleccion = plan.seleccion.filter(x => x !== id);
  MI_PLAN_FUENTES.forEach(f => DIAS.forEach(dia => MI_PLAN_SLOTS[f].forEach(slot => {
    if (plan.semana[f][dia][slot] === id) plan.semana[f][dia][slot] = null;
  })));
}

function anadirASeleccion(plan, id) {
  const r = POR_ID[id];
  if (!r) return { ok: false, motivo: "Ese plato no está en el recetario." };
  if (!platoEsAnadible(r)) {
    return {
      ok: false,
      motivo: `"${r.nombre}" es ${r.tipo_comida} del recetario y no tiene renglón en el plan.`,
    };
  }
  if (miPlanContiene(plan, id)) {
    return { ok: false, yaEsta: true, motivo: `"${r.nombre}" ya está en tu plan.` };
  }
  plan.seleccion.push(id);
  if (!guardarMiPlan(plan)) {
    plan.seleccion = plan.seleccion.filter(x => x !== id);
    return {
      ok: false,
      motivo: "Tu navegador no deja guardar datos en este dispositivo, así que el "
        + "plan no se puede conservar. Prueba fuera del modo privado.",
    };
  }
  return { ok: true, motivo: `"${r.nombre}" añadido. Asígnale día y comida en Mi Plan.` };
}

// Coloca un plato en un dia y renglon. Si el sitio esta ocupado pide
// confirmacion, y al confirmar el plato desplazado vuelve a seleccionados: no
// se pierde una eleccion por haberse equivocado de dia.
function colocarEnSemana(plan, id, dia, slot, opciones) {
  const op = opciones || {};
  const r = POR_ID[id];
  if (!r) return { ok: false, motivo: "Ese plato no está en el recetario." };
  if (DIAS.indexOf(dia) < 0) return { ok: false, motivo: "Ese día no existe." };
  const fuente = fuenteDePlato(r);
  if (!platoEsAnadible(r)) {
    return { ok: false, motivo: `"${r.nombre}" no puede entrar al plan.` };
  }
  if ((MI_PLAN_SLOTS[fuente] || []).indexOf(slot) < 0) {
    return {
      ok: false,
      motivo: `En "${ETIQUETA_FUENTE[fuente]}" no hay renglón de ${slot}.`,
    };
  }
  const ocupante = plan.semana[fuente][dia][slot];
  if (ocupante && ocupante !== id && !op.confirmado) {
    const otro = POR_ID[ocupante];
    return {
      ok: false,
      requiere_confirmacion: true,
      ocupante: ocupante,
      motivo: `${dia}, ${slot} ya tiene "${otro ? otro.nombre : ocupante}". `
        + "Si lo reemplazas, ese plato vuelve a tus seleccionados.",
    };
  }
  let desplazado = null;
  if (ocupante && ocupante !== id) {
    desplazado = ocupante;
    plan.semana[fuente][dia][slot] = null;
    if (plan.seleccion.indexOf(ocupante) < 0) plan.seleccion.push(ocupante);
  }
  quitarDeTodoMiPlan(plan, id);
  plan.semana[fuente][dia][slot] = id;
  guardarMiPlan(plan);
  return {
    ok: true,
    desplazado: desplazado,
    motivo: `${dia}, ${slot}: "${r.nombre}".`,
  };
}

// Quitar devuelve el plato a seleccionados, no lo descarta.
function quitarDeSemana(plan, fuente, dia, slot) {
  const casilla = plan.semana[fuente] && plan.semana[fuente][dia];
  const id = casilla ? casilla[slot] : null;
  if (!id) return { ok: false, motivo: "Ahí no hay nada que quitar." };
  plan.semana[fuente][dia][slot] = null;
  if (plan.seleccion.indexOf(id) < 0) plan.seleccion.push(id);
  guardarMiPlan(plan);
  const r = POR_ID[id];
  return { ok: true, id: id, motivo: `"${r ? r.nombre : id}" vuelve a tus seleccionados.` };
}

function descartarDeSeleccion(plan, id) {
  const antes = plan.seleccion.length;
  plan.seleccion = plan.seleccion.filter(x => x !== id);
  guardarMiPlan(plan);
  const r = POR_ID[id];
  return {
    ok: plan.seleccion.length < antes,
    motivo: `"${r ? r.nombre : id}" descartado.`,
  };
}

// Coloca de golpe todo lo seleccionado, cada plato en su renglon natural y en
// el primer dia que lo tenga libre. Es un atajo: despues se puede mover a mano.
// Existe porque repartir 15 platos uno a uno en un movil es una tortura.
function repartirTodo(plan) {
  let colocados = 0;
  const sinSitio = [];
  plan.seleccion.slice().forEach(id => {
    const r = POR_ID[id];
    if (!r) return;
    const fuente = fuenteDePlato(r);
    const slot = slotNaturalDePlato(r);
    if (!slot) return;
    const dia = DIAS.find(d => !plan.semana[fuente][d][slot]);
    if (!dia) { sinSitio.push(r.nombre); return; }
    if (colocarEnSemana(plan, id, dia, slot, { confirmado: true }).ok) colocados++;
  });
  let motivo = colocados
    ? `${colocados} plato${colocados === 1 ? "" : "s"} repartido${colocados === 1 ? "" : "s"}. Cámbialos de día si quieres.`
    : "No se pudo repartir nada.";
  if (sinSitio.length) {
    motivo += ` ${sinSitio.length} se quedaron sin sitio porque su renglón ya está ocupado los 7 días.`;
  }
  return { ok: colocados > 0, colocados: colocados, sinSitio: sinSitio, motivo: motivo };
}

// ---------- archivo de semanas ----------
function listarArchivoMiPlan() {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE_ARCHIVO_MI_PLAN) || "[]");
    return Array.isArray(lista) ? lista : [];
  } catch (e) {
    return [];
  }
}
function guardarArchivoMiPlan(lista) {
  try { localStorage.setItem(CLAVE_ARCHIVO_MI_PLAN, JSON.stringify(lista)); } catch (e) {}
}

function nombreSemanaPorDefecto() {
  const ini = new Date();
  const fin = new Date(ini.getTime() + 6 * 86400000);
  return `Semana del ${ini.getDate()} al ${fin.getDate()} de ${MESES[fin.getMonth()]}`;
}

// Al llegar al tope NO descarta nada: devuelve las semanas guardadas para que
// la interfaz pregunte a cual reemplazar.
function archivarSemana(plan, nombre, opciones) {
  const op = opciones || {};
  if (!miPlanTieneAlgo(plan)) {
    return { ok: false, motivo: "Tu plan está vacío: reparte algún plato antes de archivar." };
  }
  const lista = listarArchivoMiPlan();
  if (lista.length >= TOPE_ARCHIVO_MI_PLAN && !op.reemplazar) {
    return {
      ok: false,
      archivo_lleno: true,
      guardadas: lista.map(a => ({ id: a.id, nombre: a.nombre })),
      motivo: `Ya tienes ${lista.length} semanas archivadas, que es el máximo. `
        + "Elige cuál reemplazar.",
    };
  }
  if (op.reemplazar) {
    const i = lista.findIndex(a => a.id === op.reemplazar);
    if (i >= 0) lista.splice(i, 1);
  }
  const entrada = {
    id: "sem" + Date.now() + Math.floor(Math.random() * 1000),
    nombre: nombre || nombreSemanaPorDefecto(),
    fecha: new Date().toISOString().slice(0, 10),
    semana: JSON.parse(JSON.stringify(plan.semana)),
  };
  lista.unshift(entrada);
  guardarArchivoMiPlan(lista);
  return { ok: true, id: entrada.id, motivo: `Archivada como "${entrada.nombre}".` };
}

// "Rehacer": carga una semana archivada para editarla, para no tener que
// borrarla si solo se quiere cambiar algo.
function rehacerDesdeArchivo(id) {
  const entrada = listarArchivoMiPlan().find(a => a.id === id);
  if (!entrada) return { ok: false, motivo: "Esa semana ya no está en el archivo." };
  const plan = normalizarMiPlan({ seleccion: [], semana: entrada.semana });
  guardarMiPlan(plan);
  return {
    ok: true, plan: plan, nombre: entrada.nombre,
    motivo: `"${entrada.nombre}" cargada en Mi Plan para editarla.`,
  };
}

// El deshacer vive en memoria a proposito: es un seguro contra el clic
// equivocado, no un segundo archivo. Dura lo que dura la sesion.
let MI_PLAN_BORRADO = null;

function borrarDelArchivo(id) {
  const lista = listarArchivoMiPlan();
  const i = lista.findIndex(a => a.id === id);
  if (i < 0) return { ok: false, motivo: "Esa semana ya no está." };
  MI_PLAN_BORRADO = { entrada: lista[i], posicion: i };
  lista.splice(i, 1);
  guardarArchivoMiPlan(lista);
  return {
    ok: true, sePuedeDeshacer: true,
    motivo: `"${MI_PLAN_BORRADO.entrada.nombre}" borrada.`,
  };
}

function deshacerBorradoArchivo() {
  if (!MI_PLAN_BORRADO) return { ok: false, motivo: "No hay ningún borrado que deshacer." };
  const lista = listarArchivoMiPlan();
  lista.splice(Math.min(MI_PLAN_BORRADO.posicion, lista.length), 0, MI_PLAN_BORRADO.entrada);
  guardarArchivoMiPlan(lista);
  const nombre = MI_PLAN_BORRADO.entrada.nombre;
  MI_PLAN_BORRADO = null;
  return { ok: true, motivo: `"${nombre}" recuperada.` };
}

// ---------- un unico documento, dos formatos ----------
// De aqui salen tanto el PDF como el texto de WhatsApp. El menu se escribe una
// sola vez: si cambia el formato, cambia en los dos a la vez.
//
// op.compacto (para WhatsApp): sin lista de compras y con la nota de la cena
// una sola vez al final, en vez de repetida los 7 dias.
function docDeMiPlan(plan, titulo, opciones) {
  const op = opciones || {};
  const bloques = [];
  const usados = [];
  if (!op.compacto) bloques.push({ tipo: "nota", texto: AVISO_FUENTE });

  let hayCasa = false;
  MI_PLAN_FUENTES.forEach(fuente => {
    const slots = MI_PLAN_SLOTS[fuente];
    const conAlgo = DIAS.filter(dia => slots.some(s => plan.semana[fuente][dia][s]));
    if (conAlgo.length === 0) return;
    if (fuente === "casa") hayCasa = true;
    bloques.push({ tipo: "h1", texto: ETIQUETA_FUENTE[fuente] });
    conAlgo.forEach(dia => {
      bloques.push({ tipo: "h2", texto: dia });
      slots.forEach(slot => {
        const r = POR_ID[plan.semana[fuente][dia][slot]];
        if (!r) return;
        usados.push(r);
        bloques.push({ tipo: "item", etiqueta: slot, texto: r.nombre });
      });
      if (fuente === "casa" && !op.compacto) {
        bloques.push({ tipo: "item", etiqueta: "cena", texto: NOTA_CENA });
      }
    });
  });

  if (op.compacto) {
    if (hayCasa) bloques.push({ tipo: "nota_final", etiqueta: "", texto: NOTA_CENA });
  } else if (PDF_CON_LISTA_COMPRAS) {
    const lista = generarListaCompras(usados);
    if (lista.length) {
      bloques.push({ tipo: "h1", texto: "Lista de compras" });
      const sinCantidades = usados.length > 0 && usados.every(r =>
        (r.ingredientes || []).every(i => i.cantidad_num == null && !i.cantidad_texto));
      bloques.push({
        tipo: "nota",
        texto: sinCantidades
          ? "La fuente de estos menús solo nombra los platos, no las cantidades: "
            + "esta es la lista de insumos, sin pesos ni medidas."
          : "Se suman cantidades solo cuando ítem y unidad coinciden exactamente "
            + "entre recetas; el resto se lista por separado.",
      });
      lista.forEach(l => bloques.push({ tipo: "item", etiqueta: "", texto: l }));
    }
  }

  return {
    titulo: titulo || ("Mi plan — " + nombreSemanaPorDefecto()),
    bloques: bloques,
  };
}

// Texto para WhatsApp: RESUMIDO, una sola linea por dia.
//   *Lunes*: desayuno arroz a la cubana, lonchera mango picado, almuerzo locro
// Lee el MISMO documento que el PDF (docDeMiPlan) y solo lo pinta mas corto, asi
// que el contenido sigue teniendo un unico origen. El detalle completo —la lista
// de compras, el aviso de la fuente— va en el PDF, que es el documento formal.
//
// La nota de la cena y los renglones sin etiqueta (la lista de compras) no entran
// en el resumen: en un chat estorban.
// Pinta el mismo documento como HTML, para leer el plan dentro de la app. Hace
// falta porque el marco de la vista previa no renderiza PDFs: un <iframe> con
// el archivo sale como un documento roto. Mismo origen que el PDF y que el
// texto de WhatsApp: el contenido se escribe una sola vez.
// Un emoji sutil por tipo de comida, SOLO donde el propio dispositivo lo
// pinta solo: el plan dentro de la app y el mensaje de WhatsApp. El PDF usa
// Helvetica con WinAnsiEncoding (CP1252), que no tiene glifos de emoji -- ahi
// saldria como un cuadro vacio -- asi que pdf.js nunca pasa por aqui: lee
// bloque.etiqueta tal cual, sin pasar por esta funcion.
const EMOJI_POR_ETIQUETA = {
  desayuno: "☕",      // taza de cafe
  lonchera: "🍎",  // manzana
  almuerzo: "🍽️",  // plato con cubiertos
  cena: "🍲",      // olla de comida
};
function emojiDeEtiqueta(etiqueta) {
  return EMOJI_POR_ETIQUETA[etiqueta] || "";
}

function htmlDeDoc(doc) {
  const partes = [`<h3>${esc(doc.titulo || "Mi plan")}</h3>`];
  (doc.bloques || []).forEach(b => {
    if (b.tipo === "h1") { partes.push(`<h4 class="seccion">${esc(b.texto)}</h4>`); return; }
    if (b.tipo === "h2") { partes.push(`<p class="dia-texto"><strong>${esc(b.texto)}</strong></p>`); return; }
    if (b.tipo === "nota" || b.tipo === "nota_final") { partes.push(`<p class="meta">${esc(b.texto)}</p>`); return; }
    const marca = b.etiqueta
      ? `<span class="etiqueta-tipo">${emojiDeEtiqueta(b.etiqueta)} ${esc(b.etiqueta)}</span>`
      : "";
    partes.push(`<p class="linea-plan">${marca}${esc(b.texto)}</p>`);
  });
  return partes.join("");
}

// El mismo documento como pagina web suelta, para un movil que no tenga con
// que abrir un PDF: el navegador lo abre SIEMPRE, y desde el navegador se puede
// compartir e imprimir (imprimir -> "Guardar como PDF"). Sale del mismo doc que
// el PDF y reusa htmlDeDoc: no hay una segunda version del plan que mantener.
// Todo va dentro del archivo (estilos incluidos): la app no hace llamadas de red.
function htmlArchivoDeDoc(doc) {
  const titulo = doc.titulo || "Mi plan";
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<style>
  body { margin: 0 auto; padding: 24px 18px 40px; max-width: 720px;
    font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    color: #241c14; background: #fff; line-height: 1.5; }
  h3 { font-size: 22px; margin: 0 0 10px; }
  h4.seccion { margin: 22px 0 6px; font-size: 12px; text-transform: uppercase;
    letter-spacing: .09em; color: #8a6a3a; border-bottom: 1px solid #e5dccd; padding-bottom: 4px; }
  p { margin: 0 0 5px; }
  p.dia-texto { margin: 14px 0 4px; font-size: 16px; }
  p.linea-plan { margin: 0 0 4px; }
  .etiqueta-tipo { display: inline-block; min-width: 82px; font-size: 11px;
    text-transform: uppercase; letter-spacing: .05em; color: #8a6a3a; }
  p.meta { font-size: 12px; color: #6d6257; }
  .pie { margin-top: 26px; border-top: 1px solid #e5dccd; padding-top: 10px;
    font-size: 11px; color: #8a7d6e; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
${htmlDeDoc(doc)}
<p class="pie">${esc(FIRMA_APP)}</p>
</body>
</html>`;
}

function textoDeDoc(doc) {
  const bloques = doc.bloques || [];
  // con una sola fuente, su titular es ruido: se omite
  const secciones = bloques.filter(b => b.tipo === "h1").length;
  const lineas = ["*" + (doc.titulo || "Mi plan") + "*"];
  let dia = null;
  let comidas = [];

  function cerrarDia() {
    // separador de punto medio y no coma: los nombres de los platos ya traen
    // comas ("Apanado con arroz, mandarina y agua de pina") y no se sabria
    // donde acaba una comida y empieza la otra
    if (dia && comidas.length) lineas.push("*" + dia + "*: " + comidas.join(" · "));
    dia = null;
    comidas = [];
  }

  bloques.forEach(b => {
    if (b.tipo === "nota") return; // el aviso legal no va en un chat
    if (b.tipo === "nota_final") { cerrarDia(); lineas.push("", b.texto); return; }
    if (b.tipo === "h1") {
      cerrarDia();
      if (secciones > 1) lineas.push("", "_" + b.texto + "_");
      return;
    }
    if (b.tipo === "h2") { cerrarDia(); dia = b.texto; return; }
    if (b.etiqueta && b.etiqueta !== "cena") {
      comidas.push(emojiDeEtiqueta(b.etiqueta) + " " + b.etiqueta + " " + b.texto);
    }
  });
  cerrarDia();

  return lineas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function textoWhatsAppDeMiPlan(plan, titulo) {
  const doc = docDeMiPlan(plan, titulo, { compacto: true });
  const texto = textoDeDoc(doc);
  return {
    texto: texto,
    largo: texto.length,
    tope: TOPE_TEXTO_WHATSAPP,
    cabe: texto.length <= TOPE_TEXTO_WHATSAPP,
  };
}

// ---------- lista de compras ----------
function generarListaCompras(recetasSemana) {
  const grupos = new Map();
  recetasSemana.forEach(r => {
    (r.ingredientes || []).forEach(ing => {
      if (!ing.item || esIlegible(ing.item)) return;
      const key = normalizar(ing.item) + "|" + normalizar(ing.unidad || "");
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key).push(ing);
    });
  });
  const lineas = [];
  grupos.forEach(entradas => {
    if (entradas.length === 1) {
      const e = entradas[0];
      lineas.push(`${e.cantidad_texto ? e.cantidad_texto + " " : ""}${e.item}`.trim());
      return;
    }
    const todasConNumero = entradas.every(e => e.cantidad_num != null);
    if (todasConNumero) {
      const suma = entradas.reduce((acc, e) => acc + e.cantidad_num, 0);
      const unidad = entradas[0].unidad || "";
      lineas.push(`${suma}${unidad ? " " + unidad : ""} ${entradas[0].item} (sumado de ${entradas.length} recetas)`);
    } else {
      entradas.forEach(e => {
        lineas.push(`${e.cantidad_texto ? e.cantidad_texto + " " : ""}${e.item}`.trim());
      });
    }
  });
  return lineas;
}

// ---------- render helpers compartidos ----------
function tagsDe(r) {
  const tags = [];
  (r.condiciones || []).forEach(c => tags.push(c.replace(/_/g, " ")));
  (r.uso || []).forEach(u => tags.push(u.replace(/_/g, " ")));
  (r.dieta || []).forEach(d => tags.push(d.replace(/_/g, " ")));
  return tags;
}

function renderTarjeta(r) {
  const tags = tagsDe(r);
  const esFav = FAVORITOS.has(r.id);
  const badges = [];
  if (r.revisar_menor) badges.push('<span class="tag badge-alerta">revisión menor</span>');
  if (r.alerta_fuente) badges.push('<span class="tag badge-alerta">dato no verificado</span>');
  return `
    <div class="tarjeta-receta" data-id="${esc(r.id)}">
      <img src="${IMG_BASE}${esc(r.imagen ? r.imagen.split("/").pop() : "")}" alt="" loading="lazy"
           onerror="this.style.visibility='hidden'">
      <div class="info">
        <h3>${esc(r.nombre)}</h3>
        <div class="meta">${esc(r.tipo_comida || "")}</div>
        <div>${tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}${tags.length ? '<span class="tag fuente-label">según la fuente</span>' : ""}</div>
        <div>${badges.join("")}</div>
      </div>
      <button class="fav-btn" data-fav="${esc(r.id)}">${esFav ? "♥" : "♡"}</button>
    </div>`;
}

// ---------- router ----------
function parseHash() {
  const hash = location.hash.replace(/^#/, "") || "/home";
  const [path, qs] = hash.split("?");
  const params = new URLSearchParams(qs || "");
  return { path, params };
}

function navegar(ruta) { location.hash = ruta; }

function actualizarNav(path) {
  document.querySelectorAll("nav.bottomnav button").forEach(b => {
    b.classList.toggle("activo", b.dataset.ruta === "#" + path.split("/").slice(0, 2).join("/"));
  });
  document.getElementById("btn-back").style.visibility = (path === "/home") ? "hidden" : "visible";
}

function render() {
  const { path, params } = parseHash();
  const main = document.getElementById("main");
  const titulo = document.getElementById("titulo-pantalla");
  actualizarNav(path);

  if (path === "/home") {
    titulo.textContent = "Recetas Saludables";
    main.innerHTML = renderHome();
  } else if (path === "/lista") {
    titulo.textContent = "Recetas";
    main.innerHTML = renderLista(params);
    engancharLista(params);
  } else if (path.startsWith("/receta/")) {
    const id = path.split("/")[2];
    const r = POR_ID[id];
    titulo.textContent = r ? r.nombre : "Receta";
    main.innerHTML = r ? renderDetalle(r) : '<p class="vacio">No encontrada.</p>';
    if (r) engancharDetalle(r);
  } else if (path === "/que-cocino") {
    titulo.textContent = "¿Qué cocino hoy?";
    main.innerHTML = renderQueCocino();
    engancharQueCocino();
  } else if (path === "/planificador") {
    titulo.textContent = "Planificador semanal";
    main.innerHTML = renderPlanificador();
    engancharPlanificador();
  } else if (path === "/favoritos") {
    titulo.textContent = "Favoritos";
    main.innerHTML = renderFavoritos();
    engancharListaGenerica();
  } else if (path === "/ajustes") {
    titulo.textContent = "Ajustes";
    main.innerHTML = renderAjustes();
    engancharAjustes();
  } else {
    navegar("/home");
  }
  window.scrollTo(0, 0);
}

// ---------- pantallas ----------
function renderHome() {
  const botones = OBJETIVOS.map(o => `
    <button class="btn-objetivo" data-obj="${o.id}">
      ${o.icono}<br>${esc(o.label)}
      <small>${RECETAS.filter(o.filtro).length} recetas en el piloto</small>
    </button>`).join("");
  return `<div class="grid-objetivos">${botones}</div>`;
}

function renderLista(params) {
  const objetivo = params.get("objetivo") || "";
  return `
    <div class="filtros">
      <input type="search" id="buscar" placeholder="Buscar por nombre o ingrediente..." value="${esc(params.get("q") || "")}">
      <select id="filtro-tipo">
        <option value="">Todos los tipos de comida</option>
        ${TIPOS_COMIDA.map(t => `<option value="${t}" ${params.get("tipo") === t ? "selected" : ""}>${esc(t)}</option>`).join("")}
      </select>
      <div class="chips">
        ${OBJETIVOS.map(o => `<span class="chip ${objetivo === o.id ? "activo" : ""}" data-obj="${o.id}">${esc(o.label)}</span>`).join("")}
      </div>
    </div>
    <div class="lista-recetas" id="lista-resultados"></div>`;
}

function filtrarRecetas(params) {
  const objetivo = params.get("objetivo") || "";
  const tipo = params.get("tipo") || "";
  const q = normalizar(params.get("q") || "");
  return RECETAS.filter(r => {
    if (objetivo) {
      const obj = OBJETIVOS.find(o => o.id === objetivo);
      if (obj && !obj.filtro(r)) return false;
    }
    if (tipo && r.tipo_comida !== tipo) return false;
    if (q) {
      const enNombre = normalizar(r.nombre).includes(q);
      const enIng = (r.ingredientes || []).some(i => normalizar(i.item).includes(q));
      if (!enNombre && !enIng) return false;
    }
    return true;
  });
}

function pintarResultadosLista(params) {
  const cont = document.getElementById("lista-resultados");
  if (!cont) return;
  const resultados = filtrarRecetas(params);
  cont.innerHTML = resultados.length
    ? resultados.map(renderTarjeta).join("")
    : '<p class="vacio">No hay recetas del piloto que cumplan estos filtros.</p>';
  engancharListaGenerica();
}

function engancharLista(params) {
  pintarResultadosLista(params);
  const actualizarUrl = (nuevo) => {
    const p = new URLSearchParams(location.hash.split("?")[1] || "");
    Object.entries(nuevo).forEach(([k, v]) => v ? p.set(k, v) : p.delete(k));
    history.replaceState(null, "", "#/lista?" + p.toString());
    pintarResultadosLista(new URLSearchParams(p.toString()));
  };
  document.getElementById("buscar").addEventListener("input", e => actualizarUrl({ q: e.target.value }));
  document.getElementById("filtro-tipo").addEventListener("change", e => actualizarUrl({ tipo: e.target.value }));
  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const activo = chip.classList.contains("activo");
      document.querySelectorAll(".chip").forEach(c => c.classList.remove("activo"));
      if (!activo) chip.classList.add("activo");
      actualizarUrl({ objetivo: activo ? "" : chip.dataset.obj });
    });
  });
}

function engancharListaGenerica() {
  document.querySelectorAll(".tarjeta-receta").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".fav-btn")) return;
      navegar("/receta/" + card.dataset.id);
    });
  });
  document.querySelectorAll("[data-fav]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorito(btn.dataset.fav);
      render();
    });
  });
}

function renderFavoritos() {
  const items = RECETAS.filter(r => FAVORITOS.has(r.id));
  return `<div class="lista-recetas">${items.length ? items.map(renderTarjeta).join("") : '<p class="vacio">Aún no tienes recetas favoritas.</p>'}</div>`;
}

function renderMacros(r) {
  if (r.alerta_fuente || !r.macros) {
    return `<div class="macros-box no-verificado">dato de la fuente no verificado</div>`;
  }
  const m = r.macros;
  return `<div class="macros-box">
    ${r.kcal_porcion != null ? `${r.kcal_porcion} kcal/porción` : ""}
    ${m.prot != null ? ` · Prot ${m.prot}g` : ""}
    ${m.carb != null ? ` · Carb ${m.carb}g` : ""}
    ${m.grasa != null ? ` · Grasa ${m.grasa}g` : ""}
    ${m.fibra != null ? ` · Fibra ${m.fibra}g` : ""}
  </div>`;
}

function renderIngredienteLi(ing) {
  if (esIlegible(ing.item)) {
    return `<li class="ilegible">${esc(ing.cantidad_texto || "")} (ilegible en la fuente)</li>`;
  }
  const cant = ing.cantidad_texto ? `${esc(ing.cantidad_texto)} ` : "";
  return `<li>${cant}${esc(ing.item)}</li>`;
}

function renderDetalle(r) {
  const tags = tagsDe(r);
  const fte = (r.fuentes && r.fuentes[0]) || {};
  const esFav = FAVORITOS.has(r.id);
  return `
    <img class="detalle-img" src="${IMG_BASE}${esc(r.imagen ? r.imagen.split("/").pop() : "")}" alt=""
         onerror="this.style.display='none'">
    <div class="detalle-titulo">
      <h2>${esc(r.nombre)}</h2>
      <button class="fav-btn" data-fav="${esc(r.id)}">${esFav ? "♥" : "♡"}</button>
    </div>
    <div>${tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}${tags.length ? '<span class="tag fuente-label">según la fuente</span>' : ""}</div>
    ${r.tipo === "receta" ? renderMacros(r) : ""}
    ${r.porciones ? `<p>Porciones: ${esc(r.porciones)}</p>` : ""}
    ${r.tiempo_min ? `<p>Tiempo: ${esc(r.tiempo_min)} min</p>` : ""}
    ${(r.ingredientes || []).length ? `<h4 class="seccion">Ingredientes</h4><ul class="ingredientes">${r.ingredientes.map(renderIngredienteLi).join("")}</ul>` : ""}
    <h4 class="seccion">${r.tipo === "idea" ? "Beneficio" : r.tipo === "menu" ? "Nota" : "Preparación"}</h4>
    <ol class="pasos">${(r.pasos || []).map(p => `<li>${esc(p)}</li>`).join("")}</ol>
    <p class="meta">Fuente: ${esc(fte.archivo || "")}${fte.pag_ini ? ", pág. " + esc(fte.pag_ini) : ""}</p>
    <div class="acciones-detalle">
      <button class="accion secundario" id="btn-volver-lista">Volver a la lista</button>
      <button class="accion" id="btn-exportar-pdf">Descargar PDF</button>
      <button class="accion secundario" id="btn-imprimir-receta">Imprimir</button>
      ${platoEsAnadible(r) ? '<button class="accion secundario" id="btn-a-mi-plan">Agregar a mi plan</button>' : ""}
    </div>
    <div id="aviso-miplan" class="aviso-miplan"></div>
    <div id="export-receta"></div>`;
}

function engancharDetalle(r) {
  document.getElementById("btn-volver-lista").addEventListener("click", () => history.back());
  document.getElementById("btn-exportar-pdf")
    .addEventListener("click", () => descargarPDF(docDeReceta(r), r.nombre || "receta", "export-receta"));
  document.getElementById("btn-imprimir-receta")
    .addEventListener("click", () => imprimirDoc(docDeReceta(r)));
  const aMiPlan = document.getElementById("btn-a-mi-plan");
  if (aMiPlan) aMiPlan.addEventListener("click", () => anadirAMiPlanDesdeCatalogo(r.id));
  const fav = document.querySelector("[data-fav]");
  if (fav) fav.addEventListener("click", () => { toggleFavorito(r.id); render(); });
}

// ---------- exportacion a PDF (descargar / enviar / imprimir) ----------
// Antes esto era solo window.print(). No servia por dos razones: dentro del
// iframe con sandbox de un artifact publicado, print() no tiene permiso
// "allow-modals" y no hace absolutamente nada (sin error, el boton parece
// muerto); y aunque funcione, el dialogo de impresion no deja un archivo que se
// pueda adjuntar a WhatsApp o al correo. Ahora el PDF se arma con pdf.js y se
// entrega como archivo de verdad.
const AVISO_FUENTE = "Según la fuente. Orientativo, no reemplaza consulta nutricional.";
// La firma va en un solo sitio del JS: la version web la usa en su pie, y asi
// un cambio de telefono no obliga a buscarla por el codigo.
const FIRMA_APP = "Recetas Saludables \u00b7 Elaborado por SystemIA \u00b7 Cel. 965754455";

// Dentro de un marco (la vista previa publicada) el navegador bloquea tanto los
// enlaces externos como los enlaces de descarga, y lo hace en silencio: el
// boton se queda ahi y no pasa nada. Mejor no mostrarlos que dejarlos
// enganiando. Servida o instalada como PWA, la pagina no esta en un marco y
// esos atajos si valen.
function enMarcoRestringido() {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true; // si ni siquiera se puede preguntar, es que lo esta
  }
}

function nombreArchivoPDF(base) {
  const f = new Date();
  const dd = n => String(n).padStart(2, "0");
  const limpio = normalizar(base).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "menu";
  return `${limpio}-${f.getFullYear()}-${dd(f.getMonth() + 1)}-${dd(f.getDate())}.pdf`;
}

function blobPDF(doc) {
  if (typeof PDFSimple === "undefined" || !PDFSimple.construirPDF) {
    throw new Error("No se cargó pdf.js, el generador de PDF.");
  }
  return new Blob([PDFSimple.construirPDF(doc)], { type: "application/pdf" });
}

function blobHTML(doc) {
  return new Blob([htmlArchivoDeDoc(doc)], { type: "text/html" });
}

// De "mi-plan-2026-10-12.pdf" a "mi-plan-2026-10-12.html". Si no acabase en
// .pdf se le anade .html, para no entregar nunca HTML con nombre de PDF.
function nombreArchivoWeb(nombrePDF) {
  const n = String(nombrePDF || "documento");
  return /\.pdf$/i.test(n) ? n.replace(/\.pdf$/i, ".html") : n + ".html";
}

// Si este es el motor de un navegador movil (no por el tacto: eso tambien lo
// tiene un portatil con pantalla tactil, cuyo Chrome de escritorio SI pinta un
// PDF en un iframe). navigator.userAgentData.mobile es lo mas fiable cuando
// existe; donde no, se mira el User-Agent, que en todo navegador movil trae
// "Mobi" (asi lo define el propio estandar de UA-CH).
function esNavegadorMovil() {
  try {
    if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean") {
      return navigator.userAgentData.mobile;
    }
    return /Mobi/i.test(navigator.userAgent || "");
  } catch (e) {
    return false;
  }
}

// navigator.share solo sirve si acepta archivos: hay navegadores que tienen
// share() pero rechazan files, y la unica forma fiable de saberlo es preguntar
// con un File de prueba.

//
// OJO: que esto diga "si" NO garantiza que share() funcione. Dentro de un
// iframe sin allow="web-share" la llamada rechaza con NotAllowedError aunque
// canShare() haya dicho que si. Por eso el fallo de share() se trata, se
// informa y se cae a otra via, en vez de tragarselo.
function puedeEnviarArchivos() {
  try {
    if (!navigator.share || !navigator.canShare || typeof File !== "function") return false;
    const prueba = new File([new Uint8Array([37])], "p.pdf", { type: "application/pdf" });
    return navigator.canShare({ files: [prueba] });
  } catch (e) {
    return false;
  }
}

// El objeto URL del PDF que se esta viendo. Se suelta al abrir otro, no por
// reloj: si se suelta mientras el visor lo esta pintando, el visor se queda en
// blanco.
let URL_PDF_ABIERTO = null;

// Abre el documento a la vista y deja las tres salidas a mano. No entrega nada
// por su cuenta: el usuario pidio que "descargar" ABRA, no que guarde.
//
// Fuera de un marco restringido se pinta el PDF DE VERDAD en un visor, y el
// enlace "Abrir" funciona; dentro del marco el navegador bloquea las dos cosas,
// y entonces lo que se abre es el plan escrito, que siempre se puede mostrar.
function mostrarResultadoPDF(contenedor, blob, nombre, doc) {
  const cont = document.getElementById(contenedor);
  if (!cont) return;
  const kb = Math.max(1, Math.round(blob.size / 1024));
  const restringido = enMarcoRestringido();

  if (URL_PDF_ABIERTO) {
    try { URL.revokeObjectURL(URL_PDF_ABIERTO); } catch (e) { /* ya no estaba */ }
    URL_PDF_ABIERTO = null;
  }
  let url = "";
  if (!restringido) {
    try {
      url = URL.createObjectURL(blob);
      URL_PDF_ABIERTO = url;
    } catch (e) { url = ""; }
  }

  // El navegador movil de Chrome/Android no pinta un PDF METIDO EN UN IFRAME:
  // cuando no sabe, muestra un recuadro generico con el UUID del blob como
  // "nombre" y un boton "Abrir" que no es de esta app. Confuso, y se vio en un
  // movil real. Asi que el iframe solo se intenta en una computadora; en el
  // telefono se muestra el plan en texto, igual que dentro del marco
  // restringido del artifact. No es por el tacto (un portatil con pantalla
  // tactil sigue usando el Chrome de escritorio, que si pinta el iframe): es
  // por ser un navegador movil de verdad.
  const visor = (url && !esNavegadorMovil())
    ? `<iframe class="visor-pdf" src="${url}" title="${esc(doc.titulo || "Documento")}"></iframe>`
    : `<div class="plan-en-texto">${htmlDeDoc(doc)}</div>`;

  // Donde no se puede compartir, el boton de compartir no se pinta y la version
  // web pasa a ser la accion principal: es la que SI abre en cualquier movil, y
  // desde el navegador se comparte e imprime.
  const compartible = sePuedeCompartir();
  const botones = compartible
    ? `<button type="button" class="accion" id="btn-compartir-pdf">Compartir</button>
       <button type="button" class="accion secundario" id="btn-guardar-pdf">Guardar el archivo</button>
       <button type="button" class="accion secundario" id="btn-web-pdf">Abrir versión web</button>`
    : `<button type="button" class="accion" id="btn-web-pdf">Abrir y compartir (versión web)</button>
       <button type="button" class="accion secundario" id="btn-guardar-pdf">Guardar el PDF</button>`;

  const pista = compartible
    ? (restringido
      ? "Aquí lo tienes abierto. Toca \"Compartir\" para enviarlo."
      : "Aquí lo tienes abierto. Puedes compartirlo, guardarlo o imprimirlo.")
    : "Aquí lo tienes abierto. Este visor no deja compartir archivos: toca "
      + "\"Abrir y compartir\" y, una vez abierto en el navegador, usa su menú "
      + "para compartir o imprimir.";

  cont.innerHTML = `
    <div class="aviso-export">
      <p><strong>${esc(doc.titulo || "Documento")}</strong> &mdash; ${esc(nombre)} (${kb} KB)</p>
      <p>${botones}
         ${url ? `<a class="accion secundario" href="${url}" download="${esc(nombre)}">Abrir</a>` : ""}</p>
      <p class="meta" id="estado-descarga">${pista}</p>
      <p><button type="button" class="accion secundario" id="btn-ver-pdf">Ocultar</button></p>
      <div id="visor-pdf">${visor}</div>
    </div>`;

  function informar(res) {
    // si acabamos de descubrir que aqui no se puede compartir, el panel se
    // vuelve a pintar sin ese boton: no se tropieza dos veces con el mismo
    if (res && res.sinCompartir && !COMPARTIR_IMPOSIBLE) {
      COMPARTIR_IMPOSIBLE = true;
      mostrarResultadoPDF(contenedor, blob, nombre, doc);
    }
    const est = document.getElementById("estado-descarga");
    const msj = mensajeDeEntrega(res);
    if (est) est.textContent = msj;
    avisoMiPlan(msj, !!res.ok);
  }

  function ocupado(texto) {
    const est = document.getElementById("estado-descarga");
    if (est) est.textContent = texto;
  }

  const comp = document.getElementById("btn-compartir-pdf");
  if (comp) comp.addEventListener("click", () => {
    ocupado("Abriendo el menú de compartir…");
    entregarArchivo(nombre, blob, { compartir: true, titulo: doc.titulo }).then(informar);
  });

  const guardar = document.getElementById("btn-guardar-pdf");
  if (guardar) guardar.addEventListener("click", () => {
    ocupado("Guardando…");
    entregarArchivo(nombre, blob, { compartir: false }).then(informar);
  });

  // La version web: lo que si abre cualquier telefono. En un movil se ofrece
  // por el menu de compartir (desde ahi se abre con el navegador); con raton se
  // descarga, que es lo que se espera.
  const web = document.getElementById("btn-web-pdf");
  if (web) web.addEventListener("click", () => {
    ocupado("Preparando la versión web…");
    let bweb, nweb;
    try {
      bweb = blobHTML(doc);
      nweb = nombreArchivoWeb(nombre);
    } catch (e) {
      informar({ ok: false, motivo: "No se pudo preparar la versión web." });
      return;
    }
    entregarArchivo(nweb, bweb, { compartir: false, titulo: doc.titulo })
      .then(res => informar(res.ok ? Object.assign({}, res, { web: true }) : res));
  });

  const ver = document.getElementById("btn-ver-pdf");
  if (ver) ver.addEventListener("click", () => {
    const caja = document.getElementById("visor-pdf");
    if (!caja) return;
    if (caja.innerHTML) { caja.innerHTML = ""; ver.textContent = "Ver aquí"; return; }
    caja.innerHTML = visor;
    ver.textContent = "Ocultar";
    caja.scrollIntoView({ block: "nearest" });
  });

  cont.scrollIntoView({ block: "nearest" });
}

// ---------------------------------------------------------------------------
// ENTREGA DEL ARCHIVO
// ---------------------------------------------------------------------------
// El archivo esta bien (PDFium lo abre y lo pinta); lo que fallaba era sacarlo
// de aqui, y fallaba en silencio. Tres trampas comprobadas:
//
//   1. navigator.canShare({files}) devuelve true aunque el iframe prohiba
//      compartir; share() rechaza entonces con NotAllowedError. Un .catch()
//      vacio se lo tragaba: tocabas "Compartir" y no pasaba nada.
//   2. navigator.share() se puede quedar COLGADO: ni resuelve ni rechaza. Hay
//      que acabar siempre, por una via o por otra.
//   3. Un <a download> dentro del sandbox no descarga nada y NO lanza error.
//      Darlo por bueno era prometer una descarga que no existia.
//
// Reglas: se informa SIEMPRE de lo que paso; no se dice "entregado" sin haber
// entregado; y una via que falla no arrastra a otra a espaldas del usuario.

// Si el dispositivo ya ha demostrado que no puede compartir archivos, no se
// vuelve a ofrecer el boton. canShare() puede decir "si" y share() rechazar
// despues, asi que esto solo se sabe intentandolo una vez.
let COMPARTIR_IMPOSIBLE = false;

function sePuedeCompartir() {
  return !COMPARTIR_IMPOSIBLE && puedeEnviarArchivos();
}

// Solo una entrega a la vez: la plataforma tiene una sola ranura de descarga
// (dos a la vez dan un rate_limited enganoso) y dos resultados pelearian por el
// mismo hueco de estado.
let ENTREGA_EN_CURSO = false;

function entregarArchivo(nombre, blob, op) {
  if (ENTREGA_EN_CURSO) {
    return Promise.resolve({ ok: false, motivo: "Espera: hay otra entrega en marcha." });
  }
  ENTREGA_EN_CURSO = true;
  const soltar = res => { ENTREGA_EN_CURSO = false; return res; };
  let marcha;
  try {
    marcha = entregaInterna(nombre, blob, op || {});
  } catch (e) {
    return Promise.resolve(soltar({ ok: false, motivo: "No se pudo entregar el archivo." }));
  }
  return marcha.then(soltar, () => soltar({ ok: false, motivo: "No se pudo entregar el archivo." }));
}

function entregaInterna(nombre, blob, opciones) {
  if (!opciones.compartir) return guardarPorPlataforma(nombre, blob);

  // Compartir no arrastra a guardar: si no se puede, se dice y el usuario
  // decide. Caer a una descarga por detras era justo lo contrario de lo que
  // pidio ("que se abra y me deje compartir, no que guarde").
  // sinCompartir: no es solo un fallo, es que AQUI no se puede. El panel lo usa
  // para dejar de ofrecer el boton y poner delante la version web.
  const noSePuede = {
    ok: false,
    sinCompartir: true,
    motivo: "Aquí no se puede compartir archivos. Usa \"Abrir versión web\": "
      + "se abre en el navegador y desde ahí puedes compartirla.",
  };
  if (!puedeEnviarArchivos()) return Promise.resolve(noSePuede);
  let archivo = null;
  try {
    archivo = new File([blob], nombre, { type: blob.type || "application/octet-stream" });
  } catch (e) {
    archivo = null;
  }
  if (!archivo) return Promise.resolve(noSePuede);
  return compartirArchivo(archivo, opciones.titulo || nombre);
}

// navigator.share() puede quedarse COLGADO: en el marco de prueba se le llamo y
// la promesa no resolvio ni rechazo nunca. Un movil sin con que compartir hace
// lo mismo. Asi que esta funcion acaba SIEMPRE, por una de estas cinco vias:
//
//   - share() responde: enviado
//   - share() rechaza con AbortError: el usuario cerro la hoja
//   - share() rechaza con otra cosa: aqui no se puede compartir
//   - no contesta y no hay senal de hoja abierta (sinSenal): se da por colgado
//   - la hoja se abrio y al VOLVER a la pagina sigue sin contestar
//     (trasVolver): no se puede confirmar, y se dice tal cual
//
// y por si todo lo anterior falla, un techo absoluto (tope). Antes faltaban las
// dos ultimas: con la hoja abierta la promesa se quedaba pendiente para siempre
// y los oyentes nunca se quitaban.
const ESPERAS = {
  compartirSinSenal: 3000,  // share() no contesta y la hoja no se abrio
  compartirTrasVolver: 1500,  // volvimos a la pagina y sigue sin contestar
  compartirTope: 60000,  // techo absoluto de compartir
  guardado: 60000,  // techo absoluto del guardado por la plataforma
};

function compartirArchivo(archivo, titulo) {
  return new Promise(resolve => {
    let hecho = false;
    let huboHoja = false;
    let relojVuelta = null;

    const abrio = () => { huboHoja = true; };
    const volvio = () => {
      if (hecho || !huboHoja) return;
      if (relojVuelta) clearTimeout(relojVuelta);
      relojVuelta = setTimeout(() => acabar({
        ok: false,
        motivo: "No se pudo confirmar el envío. Si no llegó, usa \"Guardar el archivo\".",
      }), ESPERAS.compartirTrasVolver);
    };
    const cambio = () => { if (document.hidden) abrio(); else volvio(); };

    const quitar = () => {
      try {
        window.removeEventListener("blur", abrio);
        window.removeEventListener("focus", volvio);
        document.removeEventListener("visibilitychange", cambio);
      } catch (e) { /* da igual: ya se acabo */ }
    };

    function acabar(res) {
      if (hecho) return;
      hecho = true;
      if (relojVuelta) clearTimeout(relojVuelta);
      quitar();
      resolve(res);
    }

    try {
      window.addEventListener("blur", abrio);
      window.addEventListener("focus", volvio);
      document.addEventListener("visibilitychange", cambio);
    } catch (e) { /* sin senales: quedan los limites de espera */ }

    let promesa;
    try {
      promesa = navigator.share({ files: [archivo], title: titulo });
    } catch (e) {
      acabar({
        ok: false,
        sinCompartir: true,
        motivo: "Aquí no se puede compartir archivos. Usa \"Abrir versión web\".",
      });
      return;
    }

    Promise.resolve(promesa)
      .then(() => acabar({ ok: true, via: "compartir" }))
      .catch(e => {
        if (((e && e.name) || "") === "AbortError") {
          acabar({ ok: false, cancelado: true, motivo: "Cerraste el menú de compartir." });
          return;
        }
        acabar({
          ok: false,
          sinCompartir: true,
          motivo: "Aquí no se puede compartir archivos. Usa \"Abrir versión web\": "
            + "se abre en el navegador y desde ahí puedes compartirla.",
        });
      });

    const colgado = {
      ok: false,
      motivo: "El menú de compartir no respondió. Usa \"Guardar el archivo\" "
        + "o \"Abrir versión web\".",
    };
    // sin ninguna senal de que la hoja se abriese, a los 3 s esta colgado
    setTimeout(() => {
      if (hecho || huboHoja || document.hidden) return;
      acabar(colgado);
    }, ESPERAS.compartirSinSenal);
    // techo absoluto: nada puede quedarse pendiente para siempre
    setTimeout(() => acabar(colgado), ESPERAS.compartirTope);
  });
}

// La capacidad "downloads" de la plataforma: la unica via que funciona dentro
// del iframe con sandbox de un artifact publicado. En el movil la plataforma la
// convierte en la hoja de compartir nativa (app de iOS) o en la escritura del
// archivo (app de Android).
//
// Tambien con techo de espera: si la plataforma no contesta (su aviso se queda
// abierto, o el mensaje se pierde), el panel no puede quedarse en "Guardando..."
// para siempre.
function guardarPorPlataforma(nombre, blob) {
  const hayPlataforma = typeof window !== "undefined" && window.claude && window.claude.use;
  if (!hayPlataforma) return Promise.resolve(guardarPorNavegador(nombre, blob));

  const intento = window.claude.use("downloads")
    .then(downloads => {
      if (!downloads || !downloads.save) return guardarPorNavegador(nombre, blob);
      return downloads.save({ filename: nombre, data: blob })
        .then(() => ({ ok: true, via: "plataforma" }))
        .catch(e => motivoDePlataforma(e, nombre, blob));
    })
    .catch(() => guardarPorNavegador(nombre, blob));

  return conTope(intento, ESPERAS.guardado, {
    ok: false,
    motivo: "La descarga no respondió. Inténtalo otra vez.",
  });
}

// Una promesa que no puede tardar para siempre.
function conTope(promesa, ms, siTarda) {
  return new Promise(resolve => {
    let hecho = false;
    const fin = res => { if (!hecho) { hecho = true; resolve(res); } };
    Promise.resolve(promesa).then(fin, () => fin(siTarda));
    setTimeout(() => fin(siTarda), ms);
  });
}

// Cada codigo de error de la plataforma, traducido a algo que el usuario pueda
// hacer. Los de formato no se reintentan con otro formato a sus espaldas: se le
// senala el boton que si puede usar.
function motivoDePlataforma(e, nombre, blob) {
  const codigo = (e && e.code) || "";
  if (codigo === "declined") {
    return { ok: false, cancelado: true, motivo: "Cancelaste la descarga." };
  }
  if (codigo === "rate_limited") {
    return {
      ok: false,
      motivo: "Hay otra descarga esperando respuesta. Inténtalo otra vez en unos segundos.",
    };
  }
  if (codigo === "rejected_extension" || codigo === "extension_not_enabled") {
    const web = /\.html?$/i.test(nombre);
    return {
      ok: false,
      motivo: web
        ? "Este visor no deja guardar la versión web. El documento lo tienes "
          + "abierto aquí mismo, y el plan se puede enviar por WhatsApp como texto."
        : "Este visor no deja guardar este archivo. Prueba con "
          + "\"Abrir versión web\", o envía el plan por WhatsApp como texto.",
    };
  }
  if (codigo === "too_large") {
    return { ok: false, motivo: "El archivo pesa demasiado para guardarlo aquí. Exporta menos días." };
  }
  // bad_request, unavailable, not_granted...: queda probar la via del navegador
  return guardarPorNavegador(nombre, blob);
}

// La descarga normal del navegador: vale cuando la app corre servida o
// instalada como PWA. Dentro del marco de la vista previa NO vale, y como no
// lanza error hay que decirlo a mano en vez de cantar un exito falso.
function guardarPorNavegador(nombre, blob) {
  if (enMarcoRestringido()) {
    return {
      ok: false,
      motivo: "Esta vista previa no deja descargar archivos. Lo tienes abierto "
        + "aquí mismo; para guardarlo, abre la app instalada en el móvil.",
    };
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { ok: true, via: "navegador" };
  } catch (e) {
    return { ok: false, motivo: "Este visor no permite descargar archivos." };
  }
}

// Un solo sitio donde se decide que se le dice al usuario de cada resultado.
function mensajeDeEntrega(res) {
  if (!res || !res.ok) return (res && res.motivo) || "No se pudo entregar el archivo.";
  if (res.via === "compartir") return "Listo: elige en el menú de compartir qué hacer con el archivo.";
  if (res.web) {
    return res.via === "plataforma"
      ? "Listo. Toca \"Abrir\" en el aviso de descarga (o busca el archivo en "
        + "las descargas del navegador): se abrirá y desde su menú podrás "
        + "compartirlo o imprimirlo."
      : "Versión web descargada: ábrela y desde el menú del navegador podrás "
        + "compartirla o imprimirla.";
  }
  if (res.via === "plataforma") return "Guardado. Si tu móvil pregunta, toca \"Abrir\"; búscalo en tus descargas.";
  return "Descarga lanzada: búscalo en tus descargas.";
}

// La puerta unica de "Descargar PDF" en las tres pantallas que lo tienen:
// receta, menu semanal y Mi Plan.
//
// ABRE el documento y no entrega nada por su cuenta. Lo pidio el usuario tal
// cual ("al seleccionar descarga debe de abrirse, no guardar") y ademas evita
// que la entrega automatica y los botones del panel se peleen por la unica
// ranura de descarga de la plataforma.
function descargarPDF(doc, base, contenedor) {
  let blob, nombre;
  try {
    blob = blobPDF(doc);
    nombre = nombreArchivoPDF(base);
  } catch (e) {
    const cont = document.getElementById(contenedor);
    if (cont) cont.innerHTML = `<p class="vacio">No se pudo generar el PDF. ${esc(e.message)}</p>`;
    return;
  }
  mostrarResultadoPDF(contenedor, blob, nombre, doc);
  avisoMiPlan("Abierto abajo: puedes compartirlo o guardarlo.", true);
}

// window.print() se conserva como opcion extra para papel, pero ya no es la
// unica via. Solo tiene sentido cuando el navegador lo permite.
function imprimirDoc(doc) {
  const cont = document.getElementById("vista-imprimir");
  cont.innerHTML = `
    <h1>${esc(doc.titulo || "")}</h1>
    ${(doc.bloques || []).map(b => {
      if (b.tipo === "h1") return `<h2>${esc(b.texto)}</h2>`;
      if (b.tipo === "h2") return `<h3>${esc(b.texto)}</h3>`;
      if (b.tipo === "nota") return `<p><em>${esc(b.texto)}</em></p>`;
      return `<p>${b.etiqueta ? `<strong>${esc(b.etiqueta)}:</strong> ` : "• "}${esc(b.texto)}</p>`;
    }).join("")}`;
  window.print();
}

function docDeReceta(r) {
  const bloques = [{ tipo: "nota", texto: AVISO_FUENTE }];
  if ((r.ingredientes || []).length) {
    bloques.push({ tipo: "h1", texto: "Ingredientes" });
    r.ingredientes.forEach(i => bloques.push({
      tipo: "item", etiqueta: "",
      texto: esIlegible(i.item) ? "(ilegible en la fuente)"
        : (i.cantidad_texto ? i.cantidad_texto + " " : "") + i.item,
    }));
  }
  bloques.push({ tipo: "h1", texto: r.tipo === "menu" ? "Nota" : "Preparación" });
  (r.pasos || []).forEach((p, i) => bloques.push({ tipo: "item", etiqueta: String(i + 1), texto: p }));
  const fte = (r.fuentes && r.fuentes[0]) || {};
  if (fte.archivo) {
    bloques.push({ tipo: "nota", texto: "Fuente: " + fte.archivo + (fte.pag_ini ? ", pág. " + fte.pag_ini : "") });
  }
  return { titulo: r.nombre || "Receta", bloques: bloques };
}

// ---------- Ajustes (API key) ----------
// La key se guarda en localStorage de este dispositivo desde la pantalla de
// Ajustes -- no hace falta editar ningun archivo. Si no hay nada guardado ahi,
// se usa como respaldo la de config.js (APP_CONFIG.ANTHROPIC_API_KEY), por si
// se prefiere dejarla fija de fabrica. En cuanto haya una key por cualquiera
// de las 2 vias, "¿Qué cocino hoy?" la usa sin recargar ni reconstruir nada.
function obtenerApiKey() {
  try {
    const guardada = localStorage.getItem("api_key_v1");
    if (guardada) return guardada;
  } catch (e) {}
  return (window.APP_CONFIG && window.APP_CONFIG.ANTHROPIC_API_KEY) || "";
}

function guardarApiKey(key) {
  try { localStorage.setItem("api_key_v1", key); } catch (e) {}
}

function borrarApiKey() {
  try { localStorage.removeItem("api_key_v1"); } catch (e) {}
}

function renderAjustes() {
  const key = obtenerApiKey();
  return `
    <h4 class="seccion">API key de Anthropic</h4>
    <p class="meta">Se usa solo para reconocer ingredientes por foto en "¿Qué cocino hoy?". Se guarda únicamente en este dispositivo (nunca se envía a ningún servidor nuestro).</p>
    <div class="filtros">
      <input type="password" id="api-key-input" placeholder="sk-ant-..." value="${esc(key)}" autocomplete="off">
      <button type="button" class="accion" id="btn-guardar-key">Guardar</button>
      <button type="button" class="accion secundario" id="btn-borrar-key">Quitar key</button>
    </div>
    <p class="meta">${key ? "✅ API key activa." : "⚠️ Sin API key configurada: la foto en «¿Qué cocino hoy?» seguirá mostrando el aviso hasta que guardes una aquí."}</p>
    <p class="meta">Consíguela en console.anthropic.com. Advertencia: esta app no tiene servidor propio, así que la key queda guardada en el navegador de este dispositivo — no la compartas ni la guardes en un equipo público.</p>`;
}

function engancharAjustes() {
  const input = document.getElementById("api-key-input");
  document.getElementById("btn-guardar-key").addEventListener("click", () => {
    guardarApiKey(input.value.trim());
    render();
  });
  document.getElementById("btn-borrar-key").addEventListener("click", () => {
    borrarApiKey();
    render();
  });
}

// ---------- ¿Qué cocino hoy? (ingredientes escritos o foto) ----------
// El reconocimiento por foto llama a la API de Anthropic directo desde el
// navegador (sin backend propio). Mientras no haya una key (ver Ajustes o
// config.js), la funcion de foto solo muestra un aviso. En cuanto se guarda
// una key, esto funciona sin tocar ni reconstruir nada mas: apiKeyActiva()
// pasa a true y reconocerIngredientesDesdeFoto() ya esta implementada.
function apiKeyActiva() {
  return !!obtenerApiKey();
}

function renderQueCocino() {
  return `
    <h4 class="seccion">Escribe lo que tienes</h4>
    <div class="filtros">
      <input type="search" id="ingredientes-input" placeholder="Ej: huevo, palta, atún, quinua...">
      <button type="button" class="accion" id="btn-buscar-ingredientes">Buscar recetas</button>
    </div>
    <h4 class="seccion">O usa una foto</h4>
    <button type="button" class="accion secundario" id="btn-tomar-foto">📷 Tomar foto de tus ingredientes</button>
    <input type="file" id="input-foto" accept="image/*" capture="environment" hidden>
    <p class="meta" id="estado-foto"></p>
    <div class="lista-recetas" id="resultados-que-cocino"></div>`;
}

function engancharQueCocino() {
  const input = document.getElementById("ingredientes-input");
  document.getElementById("btn-buscar-ingredientes").addEventListener("click", () => buscarPorIngredientes(input.value));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") buscarPorIngredientes(input.value); });

  document.getElementById("btn-tomar-foto").addEventListener("click", () => {
    const estado = document.getElementById("estado-foto");
    if (!apiKeyActiva()) {
      estado.textContent = "Conecta tu API key para activar esta función.";
      return;
    }
    document.getElementById("input-foto").click();
  });

  document.getElementById("input-foto").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const estado = document.getElementById("estado-foto");
    estado.textContent = "Analizando foto...";
    try {
      const ingredientes = await reconocerIngredientesDesdeFoto(file);
      estado.textContent = ingredientes.length ? `Ingredientes detectados: ${ingredientes.join(", ")}` : "No se detectaron ingredientes en la foto.";
      if (ingredientes.length) buscarPorIngredientes(ingredientes.join(", "));
    } catch (err) {
      estado.textContent = "No se pudo analizar la foto: " + err.message;
    }
  });
}

// cuanto "de la region y economico" es un plato: manda el orden de los resultados.
function prioridadRegional(r) {
  if (r.apto_ayacucho === false) return 0;
  if (r.categoria_dia === "ocasional") return 1;
  if (r.origen === "plan_semanal" || (r.dieta || []).includes("andino_peruano")) return 3;
  return 2;
}

function buscarPorIngredientes(texto) {
  const cont = document.getElementById("resultados-que-cocino");
  if (!cont) return;
  try {
    const terminos = (texto || "").split(",").map(t => normalizar(t.trim())).filter(Boolean);
    if (terminos.length === 0) {
      cont.innerHTML = '<p class="vacio">Escribe al menos un ingrediente.</p>';
      return;
    }
    // coincide si el plato tiene AL MENOS UNO de los insumos escritos (no todos),
    // buscando tanto en la lista de ingredientes como en el nombre del plato.
    // Orden: primero los que coinciden con mas insumos y, a igual coincidencia,
    // los tipicos de la region y economicos antes que los foraneos u ocasionales.
    const puntuadas = RECETAS
      .filter(r => r.tipo === "receta" || r.tipo === "menu")
      .map(r => {
        const items = (r.ingredientes || []).map(i => normalizar(i.item));
        const nombre = normalizar(r.nombre || "");
        const coincidencias = terminos.filter(t => items.some(it => it.includes(t)) || nombre.includes(t));
        return { r, n: coincidencias.length, prioridad: prioridadRegional(r) };
      })
      .filter(x => x.n > 0)
      .sort((a, b) => b.n - a.n || b.prioridad - a.prioridad);
    cont.innerHTML = puntuadas.length
      ? puntuadas.map(({ r }) => renderTarjeta(r)).join("")
      : '<p class="vacio">No encontramos recetas con esos ingredientes. Prueba con otros como: atún, quinua, zapallo, pollo.</p>';
    engancharListaGenerica();
  } catch (err) {
    cont.innerHTML = `<p class="vacio">Ocurrió un error buscando recetas: ${esc(err.message)}</p>`;
  }
}

// Llama a la API de Anthropic (vision) directo desde el navegador. Requiere
// que config.js tenga una API key valida. El header
// "anthropic-dangerous-direct-browser-access" es necesario porque la API no
// admite llamadas desde el navegador por defecto (expone la key en el
// cliente); aceptable aqui porque es una app 100% personal y privada.
async function reconocerIngredientesDesdeFoto(file) {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("no se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": obtenerApiKey(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: (window.APP_CONFIG && window.APP_CONFIG.ANTHROPIC_MODEL) || "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: base64 } },
          { type: "text", text: "Enumera solo los ingredientes de cocina visibles en esta imagen, en español, separados por coma, sin explicaciones ni texto adicional." },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new Error(`la API respondió ${res.status}. ${cuerpo.slice(0, 150)}`);
  }
  const data = await res.json();
  const texto = (data.content || []).map(b => b.text || "").join(" ").trim();
  return texto.split(",").map(s => s.trim()).filter(Boolean);
}

// ---------- planificador ----------
// sub-pestana activa del planificador y estado de la busqueda de alternativas
// (se conserva entre re-renders para no perder la busqueda al asignar un plato)
// Las dos primeras pestanias son los planes automaticos; "miplan" es la semana
// armada a mano, que no usa VISTAS_PLAN porque tiene otra forma.
const PESTANAS_PLAN = [
  { id: "casa", label: "Comida de la casa" },
  { id: "recetario", label: "Recetario" },
  { id: "miplan", label: "Mi Plan" },
];
let PLAN_VISTA = "casa";
let MIPLAN_AVISO = "";
let ALT_TIPO = VISTAS_PLAN[0].slots[0];
let ALT_TEXTO = "";
let ALT_AVISO = "";
let ALT_BUSCADO = false;

function renderPlanificador() {
  if (PLAN_VISTA === "miplan") return renderMiPlan();
  const v = VISTA(PLAN_VISTA);
  let plan = cargarPlan(v.id);
  if (!plan) { plan = generarPlan(v.id); guardarPlan(v.id, plan); }
  window.__PLAN__ = plan;
  const dias = DIAS.map(dia => `
    <div class="dia-planner" data-dia="${dia}">
      <h4>${dia}</h4>
      ${v.slots.map(t => renderSlot(plan, dia, t)).join("")}
      <div class="slot-comida"><span class="etiqueta-tipo">cena</span><span class="vacio-slot">${esc(NOTA_CENA)}</span></div>
    </div>`).join("");
  const intro = v.id === "casa"
    ? "Lo que se lee aquí es lo que hay que preparar, tal como está en la relación de comida para cocinar de lunes a viernes. Estas entradas no traen receta ni cantidades."
    : "Platos del recetario, con ingredientes y preparación. No se mezclan con la relación de comida de la casa.";
  return `
    <div class="chips" style="margin-bottom:12px">
      ${PESTANAS_PLAN.map(x => `<button type="button" class="chip${x.id === v.id ? " activo" : ""}" data-vista="${x.id}">${esc(x.label)}</button>`).join("")}
    </div>
    <p class="meta">${esc(intro)}</p>
    <div class="acciones-detalle" style="margin-bottom:12px">
      <button class="accion secundario" id="btn-regenerar">Regenerar plan</button>
      <button class="accion" id="btn-exportar-menu">Descargar menú (PDF)</button>
      <button class="accion secundario" id="btn-imprimir-menu">Imprimir</button>
    </div>
    <div id="aviso-miplan" class="aviso-miplan"></div>
    <div id="export-menu"></div>
    ${dias}
    <h4 class="seccion">Buscar comidas alternativas</h4>
    <p class="meta">Escribe lo que hay en casa y cambia el plato de un día. Déjalo vacío para ver todas las opciones de esta pestaña.</p>
    <div class="filtros">
      <input type="search" id="alt-insumos" value="${esc(ALT_TEXTO)}" placeholder="Ej: huevo, pan, atún, arroz">
      <div class="chips">
        ${v.slots.map(t => `<button type="button" class="chip${t === ALT_TIPO ? " activo" : ""}" data-alt-tipo="${t}">${t}</button>`).join("")}
      </div>
      <button type="button" class="accion" id="btn-buscar-alt">Buscar alternativas</button>
    </div>
    ${ALT_AVISO ? `<p class="meta">${esc(ALT_AVISO)}</p>` : ""}
    <div id="resultados-alternativas"></div>
    <p class="meta">Planificador pensado para Ayacucho/Perú: prioriza ingredientes accesibles y económicos de la región andina, y los platos se alternan sin repetir mientras haya opciones distintas. Los platos pesados (chicharrón, frituras) quedan marcados como ocasionales y no entran al plan diario.</p>`;
}

// data-dia/data-slot permiten rehacer SOLO esta fila al cambiar un plato, en vez
// de redibujar la pantalla entera (que es lo que hacia saltar la vista arriba).
// Y el boton dice "Cambiar" en vez de un icono a secas: el icono se leia como
// "regenerar todo el plan".
function renderSlot(plan, dia, tipo) {
  const id = plan[dia][tipo];
  const r = id ? POR_ID[id] : null;
  if (!r) {
    return `<div class="slot-comida" data-dia="${dia}" data-slot="${tipo}">
      <span class="etiqueta-tipo">${tipo}</span>
      <span class="vacio-slot">sin opciones de este tipo</span>
    </div>`;
  }
  return `<div class="slot-comida" data-dia="${dia}" data-slot="${tipo}">
    <span class="etiqueta-tipo">${tipo}</span>
    <span class="nombre-plato" data-ir="${esc(r.id)}">${esc(r.nombre)}</span>
    ${platoEsAnadible(r) ? botonAnadir(r.id) : ""}
    <button class="swap" data-swap-dia="${dia}" data-swap-tipo="${tipo}"
      title="Cambiar solo este plato">Cambiar</button>
  </div>`;
}

// El boton de anadir muestra su estado: "+" si el plato no esta en el plan,
// "✓" si ya esta. Sin esto no habia forma de saber si la pulsacion hizo algo,
// que fue justo lo que se vio probando en el movil.
function botonAnadir(id) {
  const ya = miPlanContiene(cargarMiPlan(), id);
  return `<button class="mas${ya ? " ya" : ""}" data-anadir="${esc(id)}"
    title="${ya ? "Ya está en Mi Plan" : "Añadir a Mi Plan"}">${ya ? "✓" : "+"}</button>`;
}

// Reemplaza una sola fila y le vuelve a enganchar sus botones. Sin render(), asi
// la pagina no se mueve. Si no encuentra la fila, cae al render completo.
function reemplazarSlot(dia, tipo) {
  const actual = document.querySelector(`.slot-comida[data-dia="${dia}"][data-slot="${tipo}"]`);
  if (!actual) { render(); return; }
  const temp = document.createElement("div");
  temp.innerHTML = renderSlot(window.__PLAN__, dia, tipo);
  const nuevo = temp.firstElementChild;
  if (!nuevo) { render(); return; }
  actual.parentNode.replaceChild(nuevo, actual);
  engancharSlot(nuevo);
}

function engancharSlot(el) {
  const swap = el.querySelector("[data-swap-dia]");
  if (swap) swap.addEventListener("click", () => {
    cambiarPlato(PLAN_VISTA, window.__PLAN__, swap.dataset.swapDia, swap.dataset.swapTipo);
    reemplazarSlot(swap.dataset.swapDia, swap.dataset.swapTipo);
  });
  const mas = el.querySelector("[data-anadir]");
  if (mas) mas.addEventListener("click", () => anadirAMiPlanDesdeCatalogo(mas.dataset.anadir, mas));
  const ir = el.querySelector("[data-ir]");
  if (ir) ir.addEventListener("click", () => navegar("/receta/" + ir.dataset.ir));
}

function engancharPlanificador() {
  if (PLAN_VISTA === "miplan") {
    document.querySelectorAll("[data-vista]").forEach(chip => {
      chip.addEventListener("click", () => { PLAN_VISTA = chip.dataset.vista; render(); });
    });
    engancharMiPlan();
    return;
  }
  document.querySelectorAll("[data-vista]").forEach(chip => {
    chip.addEventListener("click", () => {
      PLAN_VISTA = chip.dataset.vista;
      ALT_TIPO = VISTA(PLAN_VISTA).slots[0];
      ALT_AVISO = "";
      ALT_BUSCADO = false;
      render();
    });
  });
  document.getElementById("btn-regenerar").addEventListener("click", () => {
    const plan = generarPlan(PLAN_VISTA);
    guardarPlan(PLAN_VISTA, plan);
    render();
  });
  document.getElementById("btn-exportar-menu").addEventListener("click", () => {
    const v = VISTA(PLAN_VISTA);
    descargarPDF(docDeMenu(PLAN_VISTA, window.__PLAN__), "menu-" + v.id, "export-menu");
  });
  document.getElementById("btn-imprimir-menu")
    .addEventListener("click", () => imprimirDoc(docDeMenu(PLAN_VISTA, window.__PLAN__)));
  // cada fila se engancha sola: cambiar un plato ya no redibuja la pantalla
  document.querySelectorAll(".slot-comida[data-slot]").forEach(engancharSlot);
  engancharAlternativas();
}

// ---------- dialogos propios ----------
// prompt() y confirm() del navegador NO funcionan dentro del marco de la vista
// previa: estan bloqueados y devuelven null/false sin lanzar ningun error, asi
// que el codigo creia que el usuario habia cancelado. Era por eso que
// "Archivar semana" no hacia nada. Estos se dibujan en la pagina y funcionan
// en todas partes.
//
// Devuelve una promesa: el texto escrito, el id de la opcion elegida, true si
// solo era confirmar, o null si se cancela.
function dialogoApp(op) {
  return new Promise(resolve => {
    const fondo = document.createElement("div");
    fondo.className = "dialogo-fondo";
    const opciones = (op.opciones || []).map(o =>
      `<button type="button" class="accion secundario" data-dlg-opcion="${esc(o.id)}">${esc(o.label)}</button>`).join("");
    fondo.innerHTML = `
      <div class="dialogo" role="dialog" aria-modal="true" aria-label="${esc(op.titulo || "")}">
        <h4>${esc(op.titulo || "")}</h4>
        ${op.texto ? `<p>${esc(op.texto)}</p>` : ""}
        ${op.campo ? `<input type="text" id="dlg-campo" value="${esc(op.valor || "")}">` : ""}
        ${opciones ? `<div class="dialogo-opciones">${opciones}</div>` : ""}
        <div class="dialogo-acciones">
          ${op.opciones ? "" : `<button type="button" class="accion" id="dlg-ok">${esc(op.aceptar || "Aceptar")}</button>`}
          <button type="button" class="accion secundario" id="dlg-cancelar">${esc(op.cancelar || "Cancelar")}</button>
        </div>
      </div>`;
    document.body.appendChild(fondo);

    const cerrar = valor => { fondo.remove(); resolve(valor); };
    fondo.addEventListener("click", e => { if (e.target === fondo) cerrar(null); });
    fondo.querySelector("#dlg-cancelar").addEventListener("click", () => cerrar(null));
    const ok = fondo.querySelector("#dlg-ok");
    const campo = fondo.querySelector("#dlg-campo");
    if (ok) ok.addEventListener("click", () => cerrar(campo ? campo.value : true));
    fondo.querySelectorAll("[data-dlg-opcion]").forEach(b =>
      b.addEventListener("click", () => cerrar(b.dataset.dlgOpcion)));
    if (campo) {
      campo.focus();
      campo.select();
      campo.addEventListener("keydown", e => { if (e.key === "Enter" && ok) ok.click(); });
    }
  });
}

// ---------- pantalla "Mi Plan" ----------
// Los avisos se escriben directamente en el DOM, sin volver a dibujar la
// pantalla: redibujar es justo lo que hacia saltar la vista al principio.
// El aviso flota fijo sobre la barra inferior. Antes se escribia en un div al
// principio de la pantalla, y como los botones estan al final de una pagina
// larga, el mensaje salia a miles de pixeles de donde el usuario estaba
// mirando: tocabas y parecia que no pasaba nada.
let TEMPORIZADOR_AVISO = null;

function avisoMiPlan(texto, ok) {
  let el = document.getElementById("aviso-flotante");
  if (!el) {
    el = document.createElement("div");
    el.id = "aviso-flotante";
    document.body.appendChild(el);
    el.addEventListener("click", () => { el.classList.remove("visible"); });
  }
  el.className = "aviso-flotante visible " + (ok ? "ok" : "no");
  el.textContent = texto;
  if (TEMPORIZADOR_AVISO) clearTimeout(TEMPORIZADOR_AVISO);
  // los errores se quedan mas rato: hay que poder leerlos
  TEMPORIZADOR_AVISO = setTimeout(() => el.classList.remove("visible"), ok ? 4500 : 8000);
}

function anadirAMiPlanDesdeCatalogo(id, boton) {
  const plan = cargarMiPlan();
  const res = anadirASeleccion(plan, id);
  // se marca el boton en el sitio, sin redibujar, para no mover la pagina
  if (boton && (res.ok || res.yaEsta)) {
    boton.classList.add("ya");
    boton.textContent = "✓";
    boton.title = "Ya está en Mi Plan";
  }
  const cuantos = plan.seleccion.length;
  const coleta = res.ok && cuantos > 0
    ? ` Llevas ${cuantos} sin repartir: ve a "Mi Plan" para darles día y comida.`
    : "";
  avisoMiPlan(res.motivo + coleta, res.ok);
}

// WhatsApp: solo texto, porque un enlace wa.me no admite adjuntos.
//
// Y no se puede depender de ABRIR ese enlace: dentro del iframe con sandbox de
// un artifact publicado, window.open y los enlaces externos estan bloqueados
// (fue lo que se vio probando en el movil: el boton no respondia). Por eso lo
// principal es copiar el texto —eso funciona en todas partes— y el enlace queda
// como atajo para cuando si se permite.
function copiarTexto(texto) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(texto).then(() => true).catch(() => copiarPorSeleccion());
  }
  return Promise.resolve(copiarPorSeleccion());
}

// Respaldo para navegadores o visores sin permiso de portapapeles: se
// selecciona el texto del cuadro y se copia la seleccion.
function copiarPorSeleccion() {
  try {
    const area = document.getElementById("texto-whatsapp");
    if (!area) return false;
    area.focus();
    area.select();
    area.setSelectionRange(0, area.value.length);
    return document.execCommand("copy");
  } catch (e) {
    return false;
  }
}

function enviarPorWhatsApp(plan, titulo) {
  const r = textoWhatsAppDeMiPlan(plan, titulo);
  // se pinta en el contenedor que esta JUSTO DEBAJO de los botones, no en el
  // de arriba del todo: si no, el cuadro aparece fuera de la pantalla
  const el = document.getElementById("export-miplan") || document.getElementById("aviso-miplan");
  if (!el) return;
  if (!r.cabe) {
    avisoMiPlan(`El plan ocupa ${r.largo} caracteres y un mensaje de WhatsApp admite `
      + `unos ${r.tope}. Descarga el PDF y adjúntalo por el menú de compartir.`, false);
    return;
  }
  const url = "https://wa.me/?text=" + encodeURIComponent(r.texto);
  el.className = "aviso-export";
  el.innerHTML = `
    <p><strong>Mensaje listo</strong> (${r.largo} caracteres). Cópialo y pégalo en WhatsApp.</p>
    <textarea id="texto-whatsapp" class="texto-para-copiar" readonly rows="6">${esc(r.texto)}</textarea>
    <p><button type="button" class="accion" id="btn-copiar-wa">Copiar mensaje</button>
       ${enMarcoRestringido() ? "" : `<a class="accion secundario" href="${esc(url)}" target="_blank" rel="noopener">Abrir WhatsApp</a>`}</p>
    <p class="meta" id="estado-copia">Toca "Copiar mensaje", abre WhatsApp y pégalo en el chat.</p>`;
  const btn = document.getElementById("btn-copiar-wa");
  if (btn) btn.addEventListener("click", () => {
    copiarTexto(r.texto).then(ok => {
      const est = document.getElementById("estado-copia");
      if (est) {
        est.textContent = ok
          ? "Copiado. Abre WhatsApp y pégalo en el chat."
          : "No se pudo copiar solo: selecciona el texto del cuadro y cópialo a mano.";
      }
      avisoMiPlan(ok ? "Mensaje copiado. Pégalo en WhatsApp." : "No se pudo copiar: cópialo a mano del cuadro.", ok);
    });
  });
  el.scrollIntoView({ block: "nearest" });
  avisoMiPlan("Mensaje listo abajo: toca \"Copiar mensaje\".", true);
}

function filaSeleccionada(id) {
  const r = POR_ID[id];
  if (!r) return "";
  const fuente = fuenteDePlato(r);
  const natural = slotNaturalDePlato(r);
  const slots = MI_PLAN_SLOTS[fuente] || [];
  return `<div class="fila-seleccion" data-sel="${esc(id)}">
    <span class="nombre-plato" data-ir="${esc(id)}">${esc(r.nombre)}</span>
    <span class="tag fuente-label">${esc(ETIQUETA_FUENTE[fuente])}</span>
    <select data-sel-dia="${esc(id)}" aria-label="Día">
      ${DIAS.map(d => `<option value="${d}">${d}</option>`).join("")}
    </select>
    <select data-sel-slot="${esc(id)}" aria-label="Tiempo de comida">
      ${slots.map(s => `<option value="${s}"${s === natural ? " selected" : ""}>${s}</option>`).join("")}
    </select>
    <button type="button" class="accion" data-colocar="${esc(id)}">Colocar</button>
    <button type="button" class="accion secundario" data-descartar="${esc(id)}">Descartar</button>
  </div>`;
}

function bloqueSemanaMiPlan(plan, fuente) {
  const slots = MI_PLAN_SLOTS[fuente];
  const dias = DIAS.map(dia => {
    const filas = slots.map(slot => {
      const id = plan.semana[fuente][dia][slot];
      const r = id ? POR_ID[id] : null;
      if (!r) {
        return `<div class="slot-comida">
          <span class="etiqueta-tipo">${slot}</span>
          <span class="vacio-slot">—</span>
        </div>`;
      }
      return `<div class="slot-comida">
        <span class="etiqueta-tipo">${slot}</span>
        <span class="nombre-plato" data-ir="${esc(id)}">${esc(r.nombre)}</span>
        <button type="button" class="swap" title="Quitar: vuelve a tus seleccionados"
          data-quitar="${fuente}|${dia}|${slot}">Quitar</button>
      </div>`;
    }).join("");
    // la nota de la cena solo tiene sentido si ese dia tiene algo: en un dia
    // vacio, "aprovecha lo que sobro del almuerzo" no dice nada
    const tieneAlgoElDia = slots.some(s => plan.semana[fuente][dia][s]);
    const cena = fuente === "casa" && tieneAlgoElDia
      ? `<div class="slot-comida"><span class="etiqueta-tipo">cena</span><span class="vacio-slot">${esc(NOTA_CENA)}</span></div>`
      : "";
    return `<div class="dia-planner"><h4>${dia}</h4>${filas}${cena}</div>`;
  }).join("");
  return `<h4 class="seccion">${esc(ETIQUETA_FUENTE[fuente])}</h4>
    <p class="meta">${fuente === "casa"
      ? "Desayuno, lonchera y almuerzo. Las loncheras salen solo de aquí."
      : "Desayuno y almuerzo. El recetario no tiene lonchera."}</p>
    ${dias}`;
}

function renderMiPlan() {
  const plan = cargarMiPlan();
  window.__MIPLAN__ = plan;
  const archivo = listarArchivoMiPlan();
  const hayAlgo = miPlanTieneAlgo(plan);

  const pendientes = plan.seleccion.length;
  // Antes los tres botones se quedaban grises sin decir por que: se tocaban 15
  // veces en el catalogo y luego no se podia exportar nada. Ahora se explica.
  const porQueNo = !hayAlgo && pendientes
    ? `<p class="aviso-miplan no">Tienes <strong>${pendientes}</strong> plato${pendientes === 1 ? "" : "s"}
       seleccionado${pendientes === 1 ? "" : "s"} pero <strong>ninguno repartido</strong>, y el PDF y
       WhatsApp necesitan la semana con sus días. Dale a <strong>Repartir todo</strong>, o asigna
       día y comida uno a uno con <strong>Colocar</strong>.</p>`
    : (!hayAlgo
      ? '<p class="aviso-miplan no">Tu plan está vacío. Ve a "Comida de la casa" o "Recetario" y toca el <strong>+</strong> de los platos que quieras.</p>'
      : "");

  const seleccion = plan.seleccion.length
    ? plan.seleccion.map(filaSeleccionada).join("")
    : `<p class="vacio">Nada seleccionado todavía. Ve a "Comida de la casa" o
       "Recetario" y toca el botón + de los platos que quieras, o ábrelos desde
       Recetas y usa "Agregar a mi plan".</p>`;

  const filasArchivo = archivo.length
    ? archivo.map(a => `<div class="fila-seleccion" data-arch="${esc(a.id)}">
        <span class="nombre-plato">${esc(a.nombre)}</span>
        <span class="tag fuente-label">${esc(a.fecha)}</span>
        <button type="button" class="accion" data-rehacer="${esc(a.id)}">Rehacer</button>
        <button type="button" class="accion secundario" data-arch-pdf="${esc(a.id)}">PDF</button>
        <button type="button" class="accion secundario" data-arch-wa="${esc(a.id)}">WhatsApp</button>
        <button type="button" class="accion secundario" data-arch-borrar="${esc(a.id)}">Borrar</button>
      </div>`).join("")
    : '<p class="vacio">Ninguna semana archivada todavía.</p>';

  return `
    <div class="chips" style="margin-bottom:12px">
      ${PESTANAS_PLAN.map(x => `<button type="button" class="chip${x.id === PLAN_VISTA ? " activo" : ""}" data-vista="${x.id}">${esc(x.label)}</button>`).join("")}
    </div>
    <p class="meta">Tu semana, armada a mano. Eliges los platos en los dos
    catálogos y aquí decides qué día y qué comida. Lo que elijas de la comida de
    casa y del recetario se archiva junto y sale en el mismo PDF.</p>
    <div id="aviso-miplan" class="aviso-miplan"></div>

    <h4 class="seccion">Seleccionados sin repartir${pendientes ? " (" + pendientes + ")" : ""}</h4>
    ${pendientes ? '<p><button type="button" class="accion" id="btn-repartir-todo">Repartir todo</button></p>' : ""}
    <div id="lista-seleccion">${seleccion}</div>

    ${bloqueSemanaMiPlan(plan, "casa")}
    ${bloqueSemanaMiPlan(plan, "recetario")}

    ${porQueNo}
    <div class="acciones-detalle" style="margin-bottom:12px">
      <button class="accion" id="btn-miplan-pdf"${hayAlgo ? "" : " disabled"}>Descargar PDF</button>
      <button class="accion secundario" id="btn-miplan-wa"${hayAlgo ? "" : " disabled"}>WhatsApp</button>
      <button class="accion secundario" id="btn-miplan-archivar"${hayAlgo ? "" : " disabled"}>Archivar semana</button>
    </div>
    <div id="export-miplan"></div>
    <p class="meta">El <strong>PDF</strong> va detallado: los dos bloques, las
    loncheras y la lista de compras. <strong>WhatsApp</strong> manda un resumen en
    texto, una línea por día —un enlace de WhatsApp no admite adjuntos—, así que
    para enviar el documento completo descarga el PDF y adjúntalo por el menú de
    compartir del móvil.</p>

    <h4 class="seccion">Semanas archivadas (${archivo.length} de ${TOPE_ARCHIVO_MI_PLAN})</h4>
    <div id="lista-archivo">${filasArchivo}</div>
    ${MI_PLAN_BORRADO ? '<p><button type="button" class="accion secundario" id="btn-deshacer-borrado">Deshacer el borrado</button></p>' : ""}`;
}

function planDeArchivo(id) {
  const entrada = listarArchivoMiPlan().find(a => a.id === id);
  if (!entrada) return null;
  return { entrada: entrada, plan: normalizarMiPlan({ seleccion: [], semana: entrada.semana }) };
}

function engancharMiPlan() {
  const plan = window.__MIPLAN__;

  document.querySelectorAll("[data-colocar]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.colocar;
      const dia = document.querySelector(`[data-sel-dia="${id}"]`).value;
      const slot = document.querySelector(`[data-sel-slot="${id}"]`).value;
      const res = colocarEnSemana(plan, id, dia, slot);
      if (!res.ok && res.requiere_confirmacion) {
        dialogoApp({
          titulo: "Ese sitio ya está ocupado",
          texto: res.motivo,
          aceptar: "Reemplazar",
        }).then(sigue => {
          if (!sigue) { avisoMiPlan("No se cambió nada.", false); return; }
          const otra = colocarEnSemana(plan, id, dia, slot, { confirmado: true });
          MIPLAN_AVISO = otra.motivo;
          render();
        });
        return;
      }
      MIPLAN_AVISO = res.motivo;
      render();
    });
  });

  document.querySelectorAll("[data-descartar]").forEach(btn => {
    btn.addEventListener("click", () => {
      const res = descartarDeSeleccion(plan, btn.dataset.descartar);
      MIPLAN_AVISO = res.motivo;
      render();
    });
  });

  document.querySelectorAll("[data-quitar]").forEach(btn => {
    btn.addEventListener("click", () => {
      const [fuente, dia, slot] = btn.dataset.quitar.split("|");
      const res = quitarDeSemana(plan, fuente, dia, slot);
      MIPLAN_AVISO = res.motivo;
      render();
    });
  });

  const repartir = document.getElementById("btn-repartir-todo");
  if (repartir) repartir.addEventListener("click", () => {
    const res = repartirTodo(plan);
    MIPLAN_AVISO = res.motivo;
    render();
  });

  const pdf = document.getElementById("btn-miplan-pdf");
  if (pdf) pdf.addEventListener("click", () =>
    descargarPDF(docDeMiPlan(plan), "mi-plan", "export-miplan"));

  const wa = document.getElementById("btn-miplan-wa");
  if (wa) wa.addEventListener("click", () => enviarPorWhatsApp(plan));

  const arch = document.getElementById("btn-miplan-archivar");
  if (arch) arch.addEventListener("click", () => {
    dialogoApp({
      titulo: "Archivar la semana",
      texto: "Ponle un nombre para reconocerla después.",
      campo: true,
      valor: nombreSemanaPorDefecto(),
      aceptar: "Archivar",
    }).then(nombre => {
      if (nombre === null) return;
      const res = archivarSemana(plan, nombre);
      if (!res.ok && res.archivo_lleno) {
        // no se descarta nada a ciegas: se pregunta a cual reemplazar
        return dialogoApp({
          titulo: "Ya tienes el máximo de semanas",
          texto: res.motivo,
          opciones: res.guardadas.map(g => ({ id: g.id, label: "Reemplazar “" + g.nombre + "”" })),
        }).then(elegido => {
          if (!elegido) { avisoMiPlan("No se archivó nada.", false); return; }
          const otra = archivarSemana(plan, nombre, { reemplazar: elegido });
          MIPLAN_AVISO = otra.motivo;
          render();
        });
      }
      MIPLAN_AVISO = res.motivo;
      render();
    });
  });

  document.querySelectorAll("[data-rehacer]").forEach(btn => {
    btn.addEventListener("click", () => {
      const cargar = () => {
        const res = rehacerDesdeArchivo(btn.dataset.rehacer);
        MIPLAN_AVISO = res.motivo;
        render();
      };
      if (!miPlanTieneAlgo(plan)) { cargar(); return; }
      dialogoApp({
        titulo: "Tienes un plan a medias",
        texto: "Si cargas esta semana archivada, reemplazas lo que estás armando ahora.",
        aceptar: "Cargarla igual",
      }).then(sigue => { if (sigue) cargar(); });
    });
  });

  document.querySelectorAll("[data-arch-pdf]").forEach(btn => {
    btn.addEventListener("click", () => {
      const a = planDeArchivo(btn.dataset.archPdf);
      if (a) descargarPDF(docDeMiPlan(a.plan, "Mi plan — " + a.entrada.nombre), a.entrada.nombre, "export-miplan");
    });
  });

  document.querySelectorAll("[data-arch-wa]").forEach(btn => {
    btn.addEventListener("click", () => {
      const a = planDeArchivo(btn.dataset.archWa);
      if (a) enviarPorWhatsApp(a.plan, "Mi plan — " + a.entrada.nombre);
    });
  });

  document.querySelectorAll("[data-arch-borrar]").forEach(btn => {
    btn.addEventListener("click", () => {
      const a = planDeArchivo(btn.dataset.archBorrar);
      if (!a) return;
      dialogoApp({
        titulo: "Borrar la semana",
        texto: `¿Borrar “${a.entrada.nombre}”? Podrás deshacerlo mientras no cierres la app.`,
        aceptar: "Borrar",
      }).then(sigue => {
        if (!sigue) return;
        const res = borrarDelArchivo(btn.dataset.archBorrar);
        MIPLAN_AVISO = res.motivo;
        render();
      });
    });
  });

  const des = document.getElementById("btn-deshacer-borrado");
  if (des) des.addEventListener("click", () => {
    const res = deshacerBorradoArchivo();
    MIPLAN_AVISO = res.motivo;
    render();
  });

  document.querySelectorAll("[data-ir]").forEach(el => {
    el.addEventListener("click", () => navegar("/receta/" + el.dataset.ir));
  });

  if (MIPLAN_AVISO) { avisoMiPlan(MIPLAN_AVISO, true); MIPLAN_AVISO = ""; }
}

// ---------- alternativas del planificador ----------
// Busca dentro de la sub-pestana activa (la casa no se mezcla con el recetario).
// A diferencia del plan automatico, aqui si aparece lo ocasional, pero al final:
// se asume que si lo buscas a mano es porque lo quieres ese dia.
function buscarAlternativas(texto, tipo, vista) {
  const deLaCasa = VISTA(vista).id === "casa";
  const terminos = (texto || "").split(",").map(t => normalizar(t.trim())).filter(Boolean);
  return RECETAS
    .filter(r => (r.tipo === "receta" || r.tipo === "menu")
      && r.tipo_comida === tipoComidaDeSlot(tipo)
      && r.apto_ayacucho !== false
      && (deLaCasa ? r.origen === "plan_semanal" : r.origen !== "plan_semanal"))
    .map(r => {
      const items = (r.ingredientes || []).map(i => normalizar(i.item));
      const nombre = normalizar(r.nombre || "");
      const n = terminos.filter(t => items.some(it => it.includes(t)) || nombre.includes(t)).length;
      return { r, n, prioridad: prioridadRegional(r) };
    })
    .filter(x => terminos.length === 0 || x.n > 0)
    .sort((a, b) => b.n - a.n || b.prioridad - a.prioridad || a.r.nombre.localeCompare(b.r.nombre));
}

function pintarAlternativas() {
  const cont = document.getElementById("resultados-alternativas");
  if (!cont) return;
  const resultados = buscarAlternativas(ALT_TEXTO, ALT_TIPO, PLAN_VISTA);
  if (resultados.length === 0) {
    cont.innerHTML = '<p class="vacio">No encontramos platos con esos insumos. Prueba con otros como: atún, quinua, zapallo, pollo.</p>';
    return;
  }
  cont.innerHTML = resultados.map(({ r }) => `
    <div class="slot-comida">
      <span class="nombre-plato" data-ir="${esc(r.id)}">${esc(r.nombre)}${r.categoria_dia === "ocasional" ? ' <span class="tag badge-alerta">ocasional</span>' : ""}</span>
      <select class="select-dia" data-alt-dia="${esc(r.id)}">
        ${DIAS.map(d => `<option value="${d}">${d}</option>`).join("")}
      </select>
      <button type="button" class="btn-usar" data-alt-usar="${esc(r.id)}">Usar</button>
    </div>`).join("");

  cont.querySelectorAll("[data-ir]").forEach(el => {
    el.addEventListener("click", () => navegar("/receta/" + el.dataset.ir));
  });
  cont.querySelectorAll("[data-alt-usar]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.altUsar;
      const sel = cont.querySelector(`[data-alt-dia="${id}"]`);
      asignarAlternativa(sel.value, ALT_TIPO, id);
    });
  });
}

function asignarAlternativa(dia, tipo, id) {
  const plan = window.__PLAN__ || cargarPlan(PLAN_VISTA) || generarPlan(PLAN_VISTA);
  plan[dia][tipo] = id;
  guardarPlan(PLAN_VISTA, plan);
  const r = POR_ID[id];
  ALT_AVISO = `${dia}: ${tipo} cambiado a "${r ? r.nombre : id}".`;
  render();
}

function engancharAlternativas() {
  const input = document.getElementById("alt-insumos");
  const buscar = () => {
    ALT_TEXTO = input.value;
    ALT_BUSCADO = true;
    ALT_AVISO = "";
    pintarAlternativas();
  };
  document.getElementById("btn-buscar-alt").addEventListener("click", buscar);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") buscar(); });
  document.querySelectorAll("[data-alt-tipo]").forEach(chip => {
    chip.addEventListener("click", () => {
      ALT_TIPO = chip.dataset.altTipo;
      ALT_TEXTO = input.value;
      ALT_BUSCADO = true;
      ALT_AVISO = "";
      render();
    });
  });
  if (ALT_BUSCADO) pintarAlternativas();
}

function docDeMenu(vista, plan) {
  const v = VISTA(vista);
  const idsSemana = [];
  DIAS.forEach(dia => v.slots.forEach(t => { if (plan[dia][t]) idsSemana.push(plan[dia][t]); }));
  const recetasSemana = idsSemana.map(id => POR_ID[id]).filter(Boolean);
  const lista = generarListaCompras(recetasSemana);

  const bloques = [{ tipo: "nota", texto: AVISO_FUENTE }];
  DIAS.forEach(dia => {
    bloques.push({ tipo: "h2", texto: dia });
    v.slots.forEach(t => {
      const r = plan[dia][t] ? POR_ID[plan[dia][t]] : null;
      if (r) bloques.push({ tipo: "item", etiqueta: t, texto: r.nombre });
    });
    bloques.push({ tipo: "item", etiqueta: "cena", texto: NOTA_CENA });
  });

  bloques.push({ tipo: "h1", texto: "Lista de compras" });
  // Las entradas de la relacion de comida de la casa no traen cantidades (la
  // fuente solo nombra los platos), asi que aqui se avisa en vez de inventarlas.
  const sinCantidades = recetasSemana.length > 0
    && recetasSemana.every(r => (r.ingredientes || []).every(i => i.cantidad_num == null && !i.cantidad_texto));
  bloques.push({
    tipo: "nota",
    texto: sinCantidades
      ? "La fuente de estos menús solo nombra los platos, no las cantidades: esta es la lista de insumos a comprar, sin pesos ni medidas."
      : "Se suman cantidades solo cuando ítem y unidad coinciden exactamente entre recetas; el resto se lista por separado. Los ingredientes ilegibles en la fuente no se incluyen aquí.",
  });
  lista.forEach(l => bloques.push({ tipo: "item", etiqueta: "", texto: l }));

  return { titulo: "Menú semanal — " + v.label, bloques: bloques };
}

// ---------- arranque ----------
function engancharGlobal() {
  document.getElementById("btn-back").addEventListener("click", () => history.back());
  document.querySelectorAll("nav.bottomnav button[data-ruta]").forEach(b => {
    b.addEventListener("click", () => navegar(b.dataset.ruta.replace("#", "")));
  });
  window.addEventListener("hashchange", render);
  document.addEventListener("click", (e) => {
    const boton = e.target.closest(".btn-objetivo");
    if (boton) navegar(`/lista?objetivo=${boton.dataset.obj}`);
  });
}

fetch("data/recetas.json")
  .then(r => r.json())
  .then(data => {
    RECETAS = data;
    POR_ID = Object.fromEntries(RECETAS.map(r => [r.id, r]));
    engancharGlobal();
    render();
  })
  .catch(err => {
    // el propio manejador de error no debe reventar si la pagina ya no esta
    const main = document.getElementById("main");
    if (main) {
      main.innerHTML = `<p class="vacio">No se pudo cargar el recetario local (data/recetas.json). ${esc(err.message)}</p>`;
    }
  });

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // updateViaCache: "none" es imprescindible. Sin el, el propio sw.js queda
    // sujeto al Cache-Control normal del servidor (GitHub Pages lo sirve con
    // max-age=600): el navegador puede comparar una version NUEVA contra una
    // copia CACHEADA de la vieja, los ve "iguales", y nunca detecta que hay
    // una actualizacion -- pase lo que pase en el servidor, incluso
    // desinstalando y reinstalando la app. Confirmado reproduciendolo en
    // scratchpad/driver/reproducir_cache_arreglado.js antes de este cambio.
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});
  });
}
