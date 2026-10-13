// Configuracion local de la app. Es un archivo plano (no hay servidor, la app
// es 100% estatica/offline), separado de app.js a proposito: para activar el
// reconocimiento de ingredientes por foto en "¿Qué cocino hoy?", pega tu API
// key de Anthropic (https://console.anthropic.com/) abajo y guarda el
// archivo -- no hace falta reconstruir ni reinstalar nada, se aplica solo
// recargando la pagina.
//
// ADVERTENCIA DE SEGURIDAD: al ser una app estatica sin backend propio, la
// key queda visible en el codigo que carga el navegador (cualquiera con
// acceso al dispositivo o a este archivo podria leerla). Aceptable para uso
// 100% personal y privado como este, pero nunca publiques ni compartas esta
// app con una key real puesta aqui.
window.APP_CONFIG = {
  ANTHROPIC_API_KEY: "", // <-- pega tu key aqui, ej: "sk-ant-api03-..."
  ANTHROPIC_MODEL: "claude-haiku-4-5-20251001", // el mas economico con vision
};
