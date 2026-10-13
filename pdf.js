// Generador de PDF minimo, sin dependencias ni llamadas a red.
//
// Por que a mano y no jsPDF: la app tiene la regla de no hacer ninguna llamada
// de red en tiempo de ejecucion, y vendorizar una libreria serian ~350 KB para
// lo que aqui solo es texto. El contenido del menu es texto plano en espaniol,
// que entra completo en WinAnsiEncoding (CP1252), asi que basta con las dos
// fuentes Type1 estandar (Helvetica y Helvetica-Bold) que todo lector de PDF
// ya trae: no hay que incrustar ninguna fuente.
//
// Entrada:  { titulo, bloques: [{tipo, texto, etiqueta}] }
//           tipo: "h1" | "h2" | "item" | "nota"
// Salida:   Uint8Array con el PDF listo para Blob o para escribir a disco.
//
// Se carga tanto en el navegador (window.PDFSimple) como en Node (module.exports),
// para poder probarlo con scripts/test_pdf_export.py.
(function () {
  "use strict";

  // ---------- pagina ----------
  const ANCHO_PAG = 595.28;   // A4 en puntos
  const ALTO_PAG = 841.89;
  const MARGEN = 48;
  const DERECHA = ANCHO_PAG - MARGEN;
  const ARRIBA = ALTO_PAG - MARGEN;
  const ABAJO = MARGEN + 24;  // deja sitio al pie de pagina

  // ---------- CP1252 (= WinAnsiEncoding) ----------
  // Los caracteres 0x80-0x9F de CP1252 no coinciden con Unicode, van a mano.
  const CP1252_ALTOS = {
    "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84,
    "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88,
    "‰": 0x89, "Š": 0x8A, "‹": 0x8B, "Œ": 0x8C,
    "Ž": 0x8E, "‘": 0x91, "’": 0x92, "“": 0x93,
    "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
    "˜": 0x98, "™": 0x99, "š": 0x9A, "›": 0x9B,
    "œ": 0x9C, "ž": 0x9E, "Ÿ": 0x9F,
  };

  function byteDe(ch) {
    if (CP1252_ALTOS[ch] !== undefined) return CP1252_ALTOS[ch];
    const c = ch.charCodeAt(0);
    if (c <= 0xFF) return c;
    return 0x3F; // "?" para lo que no entra (p. ej. un emoji)
  }

  // ---------- anchos de las fuentes (unidades/1000, del AFM de Helvetica) ----------
  function tabla(pares) {
    const t = {};
    pares.forEach(([chars, w]) => { for (const c of chars) t[c] = w; });
    return t;
  }

  const W_REG = tabla([
    [" !,./:;|", 278], ["'", 191], ["ijl", 222], ["ft", 278], ["I", 278],
    ["-()", 333], ["`r", 333], ["\"", 355], ["*", 389], ["^", 469],
    ["cksvxyz", 500], ["J", 500], ["0123456789", 556], ["#$_", 556],
    ["abdeghmnopqu", 556], ["L", 556], ["?", 556], ["+<=>~", 584],
    ["F", 611], ["T", 611], ["Z", 611], ["&", 667], ["ABEKVXY", 667],
    ["CDHNRSU", 722], ["GOPQ", 778], ["%", 889], ["w", 722], ["M", 833],
    ["m", 833], ["W", 944], ["@", 1015], ["{}", 334], ["[\\]", 278], ["|", 260],
    // acentos y signos del espaniol
    ["áéóúñüäöàèìòù", 556], ["í", 278], ["ç", 500],
    ["ÁÉÄÀÈ", 667], ["ÓÖÒ", 778], ["ÚÑÜÙ", 722], ["Í", 278], ["Ç", 722],
    ["¡", 333], ["¿", 611], ["°ª º", 400], ["«»", 556], ["·", 278],
    ["—…", 1000], ["–", 556], ["‘’", 222],
    ["“”", 333], ["•", 350],
  ]);

  const W_BOLD = tabla([
    [" ,./", 278], ["ijl", 278], ["I", 278], ["'", 238], ["!:;()", 333],
    ["-`f t", 333], ["\"", 474], ["*", 389], ["rz", 389], ["z", 500],
    ["cksvxy", 556], ["aeu", 556], ["J", 556], ["0123456789", 556],
    ["#$_", 556], ["bdghnopq", 611], ["EFL", 611], ["T", 611], ["Z", 611],
    ["?", 611], ["+<=>~^", 584], ["&", 722], ["ABCDHKNRSUVXY", 722],
    ["GOPQ", 778], ["%", 889], ["w", 778], ["M", 833], ["m", 889],
    ["W", 944], ["@", 975], ["{}", 389], ["[]", 333], ["\\", 278], ["|", 280],
    ["áéñüàèòù", 556], ["óú", 611], ["í", 278], ["ç", 556],
    ["ÁÉÀÈ", 667], ["ÓÒ", 778], ["ÚÑÜÙ", 722], ["Í", 278], ["Ç", 722],
    ["¡", 333], ["¿", 611], ["°", 400],
    ["—…", 1000], ["–", 556], ["•", 350],
  ]);

  function anchoTexto(texto, negrita, tam) {
    const t = negrita ? W_BOLD : W_REG;
    let total = 0;
    for (const ch of texto) total += (t[ch] !== undefined ? t[ch] : 556);
    return total * tam / 1000;
  }

  // ---------- corte de lineas ----------
  // anchoPrimera puede ser menor que anchoResto: la primera linea de un item
  // arranca despues de la etiqueta en negrita.
  function envolver(texto, negrita, tam, anchoPrimera, anchoResto) {
    const palabras = String(texto).split(/\s+/).filter(Boolean);
    const lineas = [];
    let actual = "";
    const disponible = () => (lineas.length === 0 ? anchoPrimera : anchoResto);

    palabras.forEach(palabra => {
      const tentativa = actual ? actual + " " + palabra : palabra;
      if (anchoTexto(tentativa, negrita, tam) <= disponible() || !actual) {
        // una palabra sola mas larga que la linea: se parte por caracteres
        if (!actual && anchoTexto(palabra, negrita, tam) > disponible()) {
          let trozo = "";
          for (const ch of palabra) {
            if (anchoTexto(trozo + ch, negrita, tam) > disponible() && trozo) {
              lineas.push(trozo);
              trozo = ch;
            } else {
              trozo += ch;
            }
          }
          actual = trozo;
          return;
        }
        actual = tentativa;
      } else {
        lineas.push(actual);
        actual = palabra;
      }
    });
    if (actual) lineas.push(actual);
    return lineas.length ? lineas : [""];
  }

  // ---------- maquetado ----------
  const ESTILOS = {
    h1: { tam: 15, negrita: true, antes: 16, interlineado: 19 },
    h2: { tam: 12, negrita: true, antes: 11, interlineado: 15 },
    item: { tam: 10.5, negrita: false, antes: 1, interlineado: 13.5 },
    nota: { tam: 9, negrita: false, antes: 4, interlineado: 11.5 },
  };

  function maquetar(doc) {
    const paginas = [];
    let pagina = null;
    let y = 0;

    function nuevaPagina() {
      pagina = [];
      paginas.push(pagina);
      y = ARRIBA;
      // titulo repetido arriba en cada pagina, para que una hoja suelta se entienda
      const t = doc.titulo || "";
      if (t) {
        pagina.push({ x: MARGEN, y: y, negrita: true, tam: 16, texto: t });
        y -= 24;
        pagina.push({ linea: true, y: y + 6 });
        y -= 10;
      }
    }

    function sitio(alto) {
      if (!pagina || y - alto < ABAJO) nuevaPagina();
    }

    nuevaPagina();

    (doc.bloques || []).forEach(bloque => {
      const est = ESTILOS[bloque.tipo] || ESTILOS.item;
      const etiqueta = bloque.tipo === "item" && bloque.etiqueta ? bloque.etiqueta + ": " : "";
      const esVinieta = bloque.tipo === "item" && !bloque.etiqueta;
      const sangria = bloque.tipo === "item" ? 10 : 0;
      const xTexto = MARGEN + sangria + (etiqueta ? anchoTexto(etiqueta, true, est.tam) : 0)
        + (esVinieta ? anchoTexto("• ", false, est.tam) : 0);

      const lineas = envolver(
        bloque.texto || "", est.negrita, est.tam,
        DERECHA - xTexto,
        DERECHA - (MARGEN + sangria + 8)
      );

      y -= est.antes;
      lineas.forEach((linea, i) => {
        sitio(est.interlineado);
        if (i === 0 && etiqueta) {
          pagina.push({ x: MARGEN + sangria, y: y, negrita: true, tam: est.tam, texto: etiqueta });
        }
        if (i === 0 && esVinieta) {
          pagina.push({ x: MARGEN + sangria, y: y, negrita: false, tam: est.tam, texto: "• " });
        }
        pagina.push({
          x: i === 0 ? xTexto : MARGEN + sangria + 8,
          y: y, negrita: est.negrita, tam: est.tam, texto: linea,
        });
        y -= est.interlineado;
      });
    });

    return paginas;
  }

  // ---------- escritura del archivo ----------
  function escaparPDF(texto) {
    return String(texto).replace(/[\\()]/g, m => "\\" + m);
  }

  function flujoDePagina(ops, numero, total) {
    const partes = [];
    ops.forEach(op => {
      if (op.linea) {
        partes.push("0.6 w 0.75 0.72 0.68 RG");
        partes.push(MARGEN + " " + op.y.toFixed(2) + " m " + DERECHA + " " + op.y.toFixed(2) + " l S");
        return;
      }
      partes.push("BT");
      partes.push("/" + (op.negrita ? "F2" : "F1") + " " + op.tam + " Tf");
      partes.push("0 g");
      partes.push("1 0 0 1 " + op.x.toFixed(2) + " " + op.y.toFixed(2) + " Tm");
      partes.push("(" + escaparPDF(op.texto) + ") Tj");
      partes.push("ET");
    });
    // pie de pagina
    const pie = "Página " + numero + " de " + total;
    partes.push("BT /F1 8 Tf 0.45 0.42 0.4 rg 1 0 0 1 " + MARGEN + " " + (MARGEN - 6).toFixed(2)
      + " Tm (" + escaparPDF(pie) + ") Tj ET");
    return partes.join("\n") + "\n";
  }

  function construirPDF(doc) {
    const paginas = maquetar(doc);
    const total = paginas.length;

    const bytes = [];
    const offsets = [];       // offsets[n] = byte donde empieza el objeto n
    const empujar = (texto) => { for (const ch of texto) bytes.push(byteDe(ch)); };

    empujar("%PDF-1.4\n");
    bytes.push(0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A); // comentario binario: marca el archivo como no-texto

    function objeto(n, cuerpo) {
      offsets[n] = bytes.length;
      empujar(n + " 0 obj\n" + cuerpo + "\nendobj\n");
    }

    // los ids de pagina salen de 5: por cada pagina, su flujo y luego la pagina
    const idFlujo = i => 5 + i * 2;
    const idPagina = i => 6 + i * 2;

    const kids = paginas.map((_, i) => idPagina(i) + " 0 R").join(" ");
    objeto(1, "<< /Type /Catalog /Pages 2 0 R >>");
    objeto(2, "<< /Type /Pages /Kids [ " + kids + " ] /Count " + total + " >>");
    objeto(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    objeto(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

    paginas.forEach((ops, i) => {
      const flujo = flujoDePagina(ops, i + 1, total);
      // /Length cuenta bytes, no caracteres: hay que medir tras convertir a CP1252
      let largo = 0;
      for (const ch of flujo) { byteDe(ch); largo += 1; }
      objeto(idFlujo(i), "<< /Length " + largo + " >>\nstream\n" + flujo + "endstream");
      objeto(idPagina(i),
        "<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 " + ANCHO_PAG + " " + ALTO_PAG + " ]"
        + " /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >>"
        + " /Contents " + idFlujo(i) + " 0 R >>");
    });

    const nObjetos = 4 + total * 2;
    const inicioXref = bytes.length;
    empujar("xref\n0 " + (nObjetos + 1) + "\n");
    empujar("0000000000 65535 f \n");
    for (let n = 1; n <= nObjetos; n++) {
      const off = String(offsets[n]).padStart(10, "0");
      empujar(off + " 00000 n \n");
    }
    empujar("trailer\n<< /Size " + (nObjetos + 1) + " /Root 1 0 R >>\n");
    empujar("startxref\n" + inicioXref + "\n%%EOF\n");

    return new Uint8Array(bytes);
  }

  const api = { construirPDF: construirPDF, anchoTexto: anchoTexto, envolver: envolver };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else if (typeof window !== "undefined") window.PDFSimple = api;
})();
