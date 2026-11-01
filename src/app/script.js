/* =====================================================================
   WaterQualitySensors - lógica del frontend (JavaScript puro + Chart.js)

   Flujo del sistema:
   Sensores -> Cubecell -> Dragino (LoRaWAN) -> MongoDB -> Backend
   -> Random Forest (Buena | Aceptable | Riesgo | No apta)
   -> JSON -> Llama AI -> Backend -> esta interfaz

   Para conectar con el backend: poner usarDatosDemo en false y ajustar
   apiBase y endpoints. Cada función "cargar..." indica la forma del JSON.
   ===================================================================== */

const CONFIG = {
  usarDatosDemo: true,                    // false = consumir el backend real
  apiBase: "http://localhost:3000/api",   // URL base de la API; se concatena con cada ruta de endpoints
  endpoints: {
    login: "/auth/login",                 // POST {email, password} -> {token, usuario:{nombre, rol}}
    registro: "/auth/registro",           // POST {usuario, nombre, email, telefono, vereda, password}
    tanques: "/tanques",                  // GET  -> [{nodoId, nombre}]
    lecturas: "/lecturas",                // GET  ?nodoId=&desde=&hasta= -> [Lectura]
    alertas: "/alertas",                  // GET  -> [Alerta]
    chat: "/ia/chat",                     // POST {nodoId, pregunta} -> {respuesta}
    reporteIA: "/ia/reporte"              // GET  ?nodoId= -> {explicacion, recomendaciones[]}
  },
  minutosSinSenalParaDesconexion: 240     // Nodo "fuera de línea" si no hay paquetes en este tiempo
};

/*  Forma esperada de una Lectura (campos que debe devolver el backend):
    { nodoId, fecha (ISO), ph, turbidez, conductividad, temperatura,
      bateria (0-100), rssi (dBm), snr (dB),
      clasificacion: "Buena" | "Aceptable" | "Riesgo" | "No apta" }          */

// Límites y formato de cada medición. "margen" es la distancia al límite que activa una advertencia.
// "escala" configura el medidor visual y "decimales" el formato de los valores mostrados.
const UMBRALES = {
  ph:            { nombre: "pH",            unidad: "",      min: 6.5, max: 8.5,  margen: 0.3, escala: [0, 14],   decimales: 2 },
  turbidez:      { nombre: "Turbidez",      unidad: "NTU",   max: 5,             margen: 1,   escala: [0, 10],   decimales: 2 },
  conductividad: { nombre: "Conductividad", unidad: "µS/cm", min: 100, max: 1000, margen: 80,  escala: [0, 1400], decimales: 0 },
  temperatura:   { nombre: "Temperatura",   unidad: "°C",    min: 10,  max: 30,   margen: 2,   escala: [0, 40],   decimales: 1 }
};
// Nombres internos de las mediciones; se derivan de UMBRALES para mantener sincronizados los selectores.
const VARIABLES = Object.keys(UMBRALES);
// Relaciona la clasificación recibida del backend con la clase CSS usada para colorear su insignia.
const CLASES = { "Buena": "buena", "Aceptable": "aceptable", "Riesgo": "riesgo", "No apta": "no-apta" };

// Datos compartidos por las vistas. "sesion" guarda el usuario/token y los arreglos reciben datos de la API o de demo.
let sesion = null;
let tanques = [];
let lecturas = [];
let alertas = [];
// Instancias Chart.js activas, indexadas por el ID del canvas para poder destruirlas al actualizar la gráfica.
let graficas = {};

// Atajo para obtener elementos del HTML por su ID.
const $ = (id) => document.getElementById(id);
// Convierte una fecha ISO del backend al formato local usado en la interfaz.
const formatearFecha = (iso) => new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });

/* ============================ API ============================ */

async function llamarApi(ruta, opciones = {}) {
  // Todas las solicitudes usan la URL base, JSON y, si existe, el token de la sesión activa.
  const respuesta = await fetch(CONFIG.apiBase + ruta, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sesion?.token ?? ""}` },
    ...opciones
  });
  if (!respuesta.ok) throw new Error(`Error ${respuesta.status}`);
  return respuesta.json();
}

/* ============================ DATOS DE DEMOSTRACIÓN ============================ */
// Sirven para ver la interfaz funcionando sin backend. Se descartan al conectar la API real.

// Crea una secuencia pseudoaleatoria repetible para que los datos de demostración no cambien en cada carga.
function generadorAleatorio(semilla) {
  return () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;
}

// Genera mediciones de ejemplo para cada tanque con fecha, calidad y datos de conectividad.
function generarLecturasDemo() {
  const azar = generadorAleatorio(42);
  const ahora = Date.now();
  const resultado = [];
  tanques.forEach((tanque, indice) => {
    for (let hora = 30 * 24; hora >= 0; hora -= 3) {
      const ciclo = Math.sin(hora / 7);
      const lluvia = indice === 0 && hora < 30 ? (30 - hora) / 30 : 0;   // pico de turbidez reciente en el tanque 1
      const lectura = {
        nodoId: tanque.nodoId,
        fecha: new Date(ahora - hora * 3600000).toISOString(),
        ph: 7.3 + ciclo * 0.3 + azar() * 0.2 + lluvia * 1.0,
        turbidez: 1.6 + azar() * 0.9 + lluvia * 4.2,
        conductividad: 430 + ciclo * 60 + azar() * 50 + lluvia * 300,
        temperatura: 18 + Math.sin(hora / 4) * 2 + azar(),
        bateria: Math.max(12, 94 - (30 * 24 - hora) / 24 * 1.9 - indice * 25),
        rssi: -Math.round(95 + azar() * 20),
        snr: +(4 + azar() * 6).toFixed(1)
      };
      lectura.clasificacion = clasificarDemo(lectura);
      resultado.push(lectura);
    }
  });
  return resultado;
}

// Reemplazo temporal del Random Forest: el backend entregará la clasificación real.
function clasificarDemo(lectura) {
  const estados = ["ph", "turbidez", "conductividad"].map((v) => estadoParametro(v, lectura[v]));
  const fuera = estados.filter((e) => e === "fuera").length;
  const cerca = estados.filter((e) => e === "alerta").length;
  if (fuera >= 2) return "No apta";
  if (fuera === 1) return "Riesgo";
  return cerca > 0 ? "Aceptable" : "Buena";
}

const REPORTES_DEMO = {
  "Buena": ["El agua del tanque está dentro de los límites recomendados. Es adecuada para el consumo habitual.", ["Mantén la tapa del tanque cerrada", "Haz la limpieza programada del tanque"]],
  "Aceptable": ["Algunos valores se acercan a los límites, pero el agua todavía está en rango tolerable.", ["Revisa el tanque en los próximos días", "Si es para beber, se recomienda hervirla"]],
  "Riesgo": ["Un parámetro está fuera del rango seguro, probablemente por arrastre de sedimentos tras lluvias.", ["Hierve el agua al menos 5 minutos antes de beberla", "Avisa al líder de la comunidad"]],
  "No apta": ["Varios parámetros están alterados. El agua no es segura para el consumo.", ["No consumas esta agua", "Usa una fuente alternativa y reporta al administrador local"]]
};

/* ============================ CARGA DE DATOS ============================ */

// Carga los nodos disponibles desde el backend o usa los tanques de ejemplo.
async function cargarTanques() {
  tanques = CONFIG.usarDatosDemo
    ? [{ nodoId: "nodo-01", nombre: "Tanque San Pedro 01" }, { nodoId: "nodo-02", nombre: "Tanque San Pedro 02" }]
    : await llamarApi(CONFIG.endpoints.tanques);
}

// Obtiene las lecturas y las ordena cronológicamente para facilitar filtros, gráficas e historial.
async function cargarLecturas() {
  lecturas = CONFIG.usarDatosDemo ? generarLecturasDemo() : await llamarApi(CONFIG.endpoints.lecturas);
  lecturas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
}

// Solicita al backend la explicación y recomendaciones del nodo, o usa el reporte de demostración.
async function cargarReporteIA(nodoId, ultima) {
  if (CONFIG.usarDatosDemo) {
    const [explicacion, recomendaciones] = REPORTES_DEMO[ultima.clasificacion];
    return { explicacion, recomendaciones };
  }
  return llamarApi(`${CONFIG.endpoints.reporteIA}?nodoId=${nodoId}`);
}

// Carga alertas desde la API o las construye con las lecturas de demostración.
async function cargarAlertas() {
  alertas = CONFIG.usarDatosDemo ? generarAlertasDemo() : await llamarApi(CONFIG.endpoints.alertas);
  /* Forma de Alerta: { id, severidad: "critica"|"advertencia"|"resuelta", titulo, mensaje, fecha, nodoId, leida } */
}

// Simula alertas recientes a partir de mediciones que estén cerca o fuera de los límites.
function generarAlertasDemo() {
  const resultado = [];
  const recientes = lecturas.filter((l) => Date.now() - new Date(l.fecha) < 72 * 3600000).reverse();
  recientes.forEach((lectura) => {
    VARIABLES.forEach((variable) => {
      const estado = estadoParametro(variable, lectura[variable]);
      if (estado === "ok" || resultado.length >= 14) return;
      const antigua = Date.now() - new Date(lectura.fecha) > 36 * 3600000;
      resultado.push({
        id: `${lectura.nodoId}-${variable}-${lectura.fecha}`,
        severidad: antigua ? "resuelta" : estado === "fuera" ? "critica" : "advertencia",
        titulo: `${UMBRALES[variable].nombre} ${estado === "fuera" ? "fuera de norma" : "cerca del límite"} - ${nombreTanque(lectura.nodoId)}`,
        mensaje: `Valor registrado: ${lectura[variable].toFixed(UMBRALES[variable].decimales)} ${UMBRALES[variable].unidad}`,
        fecha: lectura.fecha, nodoId: lectura.nodoId, leida: false
      });
    });
  });
  return resultado;
}

/* ============================ UTILIDADES ============================ */

// Busca el nombre del tanque, filtra sus lecturas y obtiene la más reciente.
const nombreTanque = (nodoId) => tanques.find((t) => t.nodoId === nodoId)?.nombre ?? nodoId;
const lecturasDelNodo = (nodoId) => lecturas.filter((l) => l.nodoId === nodoId);
const ultimaLectura = (nodoId) => lecturasDelNodo(nodoId).at(-1);

// Devuelve "ok", "alerta" (cerca del límite) o "fuera" (incumple la norma)
function estadoParametro(variable, valor) {
  const u = UMBRALES[variable];
  if ((u.min !== undefined && valor < u.min) || (u.max !== undefined && valor > u.max)) return "fuera";
  if ((u.max !== undefined && valor > u.max - u.margen) || (u.min !== undefined && valor < u.min + u.margen)) return "alerta";
  return "ok";
}

// Devuelve el texto del rango de referencia configurado para la medición.
function descripcionRango(u) {
  if (u.min !== undefined && u.max !== undefined) return `Rango seguro: ${u.min} – ${u.max} ${u.unidad}`;
  return `Límite: menor a ${u.max} ${u.unidad}`;
}

/* ============================ NAVEGACIÓN ============================ */

// Muestra una sola vista y oculta las demás
function mostrarVista(idVista) {
  document.querySelector(".barra-lateral").classList.remove("abierta");
  document.querySelectorAll("#aplicacion .vista").forEach((v) => (v.hidden = v.id !== idVista));
  document.querySelectorAll("#menu-principal button").forEach((b) => b.classList.toggle("activa", b.dataset.vista === idVista));
  if (idVista === "vista-tendencias") actualizarTendencias();
  if (idVista === "vista-dashboard") dibujarGraficaPrincipal();
}

function entrarALaAplicacion() {
  $("vista-login").hidden = true;
  $("aplicacion").hidden = false;
  $("nombre-usuario").textContent = sesion.nombre;
  iniciarAplicacion();
}

function cerrarSesion() {
  sesion = null;
  $("aplicacion").hidden = true;
  $("vista-login").hidden = false;
}

/* ============================ AUTENTICACIÓN ============================ */

// Comprueba el formato del correo y los requisitos de longitud y complejidad de la contraseña.
const correoValido = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c);
const claveSegura = (c) => c.length >= 8 && c.length <= 12 && /[A-Z]/.test(c) && /\d/.test(c) && /[^A-Za-z0-9]/.test(c);

// Valida localmente el formulario de registro antes de enviarlo al backend.
function validarRegistro(datos) {
  if (Object.values(datos).some((v) => !v.trim())) return "Todos los campos son obligatorios.";
  if (!/^[a-zA-Z0-9]{1,50}$/.test(datos.usuario)) return "El usuario solo admite letras y números.";
  if (!correoValido(datos.email)) return "Formato de correo no válido.";
  if (!/^\d{10,15}$/.test(datos.telefono)) return "El teléfono debe tener entre 10 y 15 dígitos.";
  if (!claveSegura(datos.password)) return "La contraseña debe tener de 8 a 12 caracteres, con mayúscula, número y símbolo.";
  if (datos.password !== datos.confirmacion) return "Las contraseñas no coinciden.";
  return "";
}

// Envía las credenciales al endpoint de login y guarda los datos de sesión recibidos.
async function iniciarSesion(evento) {
  evento.preventDefault();
  const { email, password } = Object.fromEntries(new FormData(evento.target));
  if (!email.trim() || !password) return ($("error-login").value = "Este campo es obligatorio.");
  if (!correoValido(email)) return ($("error-login").value = "Formato de correo no válido.");
  try {
    sesion = CONFIG.usarDatosDemo
      ? { nombre: email.split("@")[0], rol: "comunero", token: "demo" }
      : await llamarApi(CONFIG.endpoints.login, { method: "POST", body: JSON.stringify({ email, password }) }).then((r) => ({ ...r.usuario, token: r.token }));
    $("error-login").value = "";
    entrarALaAplicacion();
  } catch {
    $("error-login").value = "El correo electrónico o la contraseña son incorrectos.";
  }
}

// Valida los datos del formulario y crea la cuenta mediante el endpoint de registro.
async function registrarUsuario(evento) {
  evento.preventDefault();
  const datos = Object.fromEntries(new FormData(evento.target));
  const error = validarRegistro(datos);
  $("error-registro").value = error;
  if (error) return;
  try {
    if (!CONFIG.usarDatosDemo) await llamarApi(CONFIG.endpoints.registro, { method: "POST", body: JSON.stringify(datos) });
    sesion = { nombre: datos.nombre, rol: "comunero", token: "demo" };
    entrarALaAplicacion();
  } catch {
    $("error-registro").value = "No se pudo crear la cuenta. Revisa si el correo ya está registrado.";
  }
}

/* ============================ DASHBOARD ============================ */

// Lee el ID del tanque elegido en el selector de la barra superior.
const nodoActual = () => $("selector-tanque").value;

// Actualiza los componentes del dashboard usando la última lectura del tanque seleccionado.
function actualizarDashboard() {
  const ultima = ultimaLectura(nodoActual());
  if (!ultima) return;
  $("fecha-ultima-lectura").textContent = formatearFecha(ultima.fecha);
  $("fecha-ultima-lectura").dateTime = ultima.fecha;
  renderTarjetasMetricas(ultima);
  renderClasificacion(ultima);
  renderEstadoRed(ultima);
  renderReporteIA(ultima);
  dibujarGraficaPrincipal();
}

// Construye las tarjetas de medición con su valor, unidad y estado respecto a los umbrales.
function renderTarjetasMetricas(ultima) {
  $("tarjetas-metricas").innerHTML = VARIABLES.map((variable) => {
    const u = UMBRALES[variable];
    const valor = ultima[variable];
    const estado = estadoParametro(variable, valor);
    const apoyo = variable === "temperatura" ? " (apoyo)" : "";
    const etiquetaEstado = { ok: "Normal", alerta: "Cerca del límite", fuera: "Fuera de rango" }[estado];
    return `<article class="tarjeta-metrica" data-estado="${estado}">
      <h3>${u.nombre}${apoyo}</h3>
      <output>${valor.toFixed(u.decimales)} <small>${u.unidad}</small></output>
      <meter min="${u.escala[0]}" max="${u.escala[1]}" low="${u.min ?? u.escala[0]}" high="${u.max}" optimum="${u.min !== undefined ? (u.min + u.max) / 2 : u.escala[0]}" value="${valor}"></meter>
      <p class="estado-parametro">${etiquetaEstado}</p>
      <small>${descripcionRango(u)}</small>
    </article>`;
  }).join("");
}

// Muestra la clasificación de calidad y asigna la clase CSS correspondiente.
function renderClasificacion(ultima) {
  const insignia = $("clasificacion-general");
  insignia.textContent = `Calidad: ${ultima.clasificacion}`;
  insignia.dataset.clase = CLASES[ultima.clasificacion];
}

// Presenta batería, señal y estado conectado/desconectado del nodo.
function renderEstadoRed(ultima) {
  const minutos = (Date.now() - new Date(ultima.fecha)) / 60000;
  const conectado = minutos <= CONFIG.minutosSinSenalParaDesconexion;
  const indicador = $("indicador-red");
  indicador.dataset.conectado = conectado ? "si" : "no";
  indicador.textContent = conectado ? "En línea" : "Sin señal reciente";
  $("red-nodo").textContent = ultima.nodoId;
  $("red-rssi").textContent = `${ultima.rssi} dBm`;
  $("red-snr").textContent = `${ultima.snr} dB`;
  $("red-bateria").value = ultima.bateria;
  $("red-bateria-texto").textContent = `${Math.round(ultima.bateria)} %`;
}

// Renderiza la explicación y recomendaciones recibidas del servicio de IA.
async function renderReporteIA(ultima) {
  try {
    const reporte = await cargarReporteIA(ultima.nodoId, ultima);
    $("ia-explicacion").textContent = reporte.explicacion;
    $("ia-recomendaciones").innerHTML = reporte.recomendaciones.map((r) => `<li>${r}</li>`).join("");
    $("ia-origen").textContent = `Basado en pH ${ultima.ph.toFixed(1)} y turbidez ${ultima.turbidez.toFixed(1)} NTU.`;
  } catch {
    // Mensaje de contingencia si Llama AI no responde
    $("ia-explicacion").textContent = "Explicación temporalmente no disponible. Guíate por la categoría de calidad y los valores del Dashboard.";
    $("ia-recomendaciones").innerHTML = "";
    $("ia-origen").textContent = "";
  }
}

/* ============================ GRÁFICAS ============================ */

// Dibuja (o redibuja) una gráfica de línea con las líneas de umbral en punteado
function dibujarGrafica(idCanvas, datos, variable) {
  if (typeof Chart === "undefined") return;
  const u = UMBRALES[variable];
  const etiquetas = datos.map((l) => new Date(l.fecha).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }));
  const linea = (valor, color) => ({ data: datos.map(() => valor), borderColor: color, borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 });
  const conjuntos = [{ label: `${u.nombre} ${u.unidad}`, data: datos.map((l) => l[variable]), borderColor: "#2a9de0", backgroundColor: "rgba(79,176,234,.18)", fill: true, tension: .3, pointRadius: datos.length > 60 ? 0 : 3 }];
  if (u.max !== undefined) conjuntos.push(linea(u.max, "#d32f2f"));
  if (u.min !== undefined) conjuntos.push(linea(u.min, "#ed6c02"));
  graficas[idCanvas]?.destroy();
  graficas[idCanvas] = new Chart($(idCanvas), {
    type: "line",
    data: { labels: etiquetas, datasets: conjuntos },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 8 } } } }
  });
}

function dibujarGraficaPrincipal() {
  const desde = Date.now() - 24 * 3600000;
  const datos = lecturasDelNodo(nodoActual()).filter((l) => new Date(l.fecha) >= desde);
  dibujarGrafica("grafica-principal", datos, $("variable-grafica-principal").value);
}

// Filtra las lecturas por periodo y variable, dibuja la gráfica y calcula el resumen estadístico.
function actualizarTendencias() {
  const { rango, variable } = Object.fromEntries(new FormData($("filtros-tendencias")));
  const desde = Date.now() - Number(rango) * 24 * 3600000;
  const datos = lecturasDelNodo(nodoActual()).filter((l) => new Date(l.fecha) >= desde);
  $("mensaje-sin-datos").hidden = datos.length > 0;
  if (!datos.length) { $("resumen-tendencia").innerHTML = ""; return; }
  dibujarGrafica("grafica-tendencia", datos, variable);
  const valores = datos.map((l) => l[variable]);
  const u = UMBRALES[variable];
  const promedio = valores.reduce((a, b) => a + b, 0) / valores.length;
  const fuera = valores.filter((v) => estadoParametro(variable, v) === "fuera").length;
  $("resumen-tendencia").innerHTML = `
    <dt>Mínimo</dt><dd>${Math.min(...valores).toFixed(u.decimales)} ${u.unidad}</dd>
    <dt>Promedio</dt><dd>${promedio.toFixed(u.decimales)} ${u.unidad}</dd>
    <dt>Máximo</dt><dd>${Math.max(...valores).toFixed(u.decimales)} ${u.unidad}</dd>
    <dt>Muestras</dt><dd>${valores.length}</dd>
    <dt>Fuera de norma</dt><dd>${fuera}</dd>`;
}

/* ============================ LECTURAS ============================ */

// Muestra el nivel de batería y la fecha de la última señal de cada tanque.
function renderEstadoNodos() {
  $("estado-nodos").innerHTML = tanques.map((t) => {
    const ultima = ultimaLectura(t.nodoId);
    if (!ultima) return "";
    return `<article class="panel"><h3>${t.nombre}</h3>
      <meter min="0" max="100" low="25" high="50" optimum="100" value="${ultima.bateria}" aria-label="Batería del nodo"></meter>
      <p>${Math.round(ultima.bateria)} % · Última señal ${formatearFecha(ultima.fecha)}</p></article>`;
  }).join("");
}

// Aplica los filtros de nodo y fechas y dibuja la tabla
function filtrarLecturas(evento) {
  evento?.preventDefault();
  const { nodo, desde, hasta } = Object.fromEntries(new FormData($("filtros-lecturas")));
  if (desde && hasta && desde > hasta) return ($("error-filtros").value = "La fecha inicial no puede ser posterior a la final.");
  $("error-filtros").value = "";
  const filtradas = lecturas.filter((l) =>
    (!nodo || l.nodoId === nodo) &&
    (!desde || new Date(l.fecha) >= new Date(desde + "T00:00:00")) &&
    (!hasta || new Date(l.fecha) <= new Date(hasta + "T23:59:59")));
  renderTablaLecturas(filtradas.reverse());
}

let lecturasMostradas = [];

// Guarda y presenta las lecturas filtradas; conserva un máximo de 150 filas visibles.
function renderTablaLecturas(datos) {
  lecturasMostradas = datos;
  const celda = (l, v) => `<td class="${estadoParametro(v, l[v]) === "fuera" ? "fuera" : ""}">${l[v].toFixed(UMBRALES[v].decimales)}</td>`;
  $("cuerpo-tabla-lecturas").innerHTML = datos.slice(0, 150).map((l) => `<tr>
    <td><time datetime="${l.fecha}">${formatearFecha(l.fecha)}</time></td><td>${nombreTanque(l.nodoId)}</td>
    ${celda(l, "ph")}${celda(l, "turbidez")}${celda(l, "conductividad")}${celda(l, "temperatura")}
    <td><span class="insignia" data-clase="${CLASES[l.clasificacion]}">${l.clasificacion}</span></td></tr>`).join("")
    || `<tr><td colspan="7">No se registran datos para el filtro seleccionado.</td></tr>`;
}

// Descarga como CSV las lecturas que quedaron visibles tras aplicar los filtros.
function exportarCSV() {
  const filas = lecturasMostradas.map((l) => [l.fecha, l.nodoId, l.ph.toFixed(2), l.turbidez.toFixed(2), l.conductividad.toFixed(0), l.temperatura.toFixed(1), l.clasificacion].join(","));
  const csv = ["Fecha,Nodo,pH,Turbidez (NTU),Conductividad (uS/cm),Temperatura (C),Clasificacion", ...filas].join("\n");
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  enlace.download = "lecturas.csv";
  enlace.click();
}

/* ============================ ALERTAS ============================ */

let severidadActiva = "todas";

// Actualiza el filtro de severidad seleccionado y vuelve a dibujar la lista de alertas.
function filtrarAlertas(severidad) {
  severidadActiva = severidad;
  document.querySelectorAll("#filtros-alertas button").forEach((b) => b.classList.toggle("activa", b.dataset.severidad === severidad));
  renderAlertas();
}

// Renderiza las alertas que coinciden con la severidad activa y actualiza el contador.
function renderAlertas() {
  const etiquetas = { critica: "Crítica", advertencia: "Advertencia", resuelta: "Resuelta" };
  const visibles = alertas.filter((a) => severidadActiva === "todas" || a.severidad === severidadActiva);
  $("lista-alertas").innerHTML = visibles.map((a) => `
    <article class="alerta" data-severidad="${a.severidad}" data-leida="${a.leida ? "si" : "no"}">
      <header><h3>${a.titulo}</h3><p>${a.mensaje}</p></header>
      <div><span class="insignia">${etiquetas[a.severidad]}</span> <time datetime="${a.fecha}">${formatearFecha(a.fecha)}</time></div>
      <footer>
        ${a.leida ? "" : `<button type="button" class="boton-secundario" data-accion="leer" data-id="${a.id}">Marcar como leída</button>`}
        ${a.severidad === "resuelta" ? "" : `<button type="button" class="boton-secundario" data-accion="resolver" data-id="${a.id}">Marcar como resuelta</button>`}
        <button type="button" class="boton-principal" data-accion="ver" data-id="${a.id}">Ver en dashboard</button>
      </footer>
    </article>`).join("") || "<p>No hay alertas activas en este momento.</p>";
  actualizarContadorAlertas();
}

// Procesa las acciones de una alerta: marcarla leída, resolverla o abrir su tanque en el dashboard.
function accionAlerta(evento) {
  const boton = evento.target.closest("button[data-accion]");
  if (!boton) return;
  const alerta = alertas.find((a) => a.id === boton.dataset.id);
  if (boton.dataset.accion === "leer") alerta.leida = true;
  if (boton.dataset.accion === "resolver") { alerta.severidad = "resuelta"; alerta.leida = true; }
  if (boton.dataset.accion === "ver") { $("selector-tanque").value = alerta.nodoId; actualizarDashboard(); mostrarVista("vista-dashboard"); }
  renderAlertas();   // Si usas el backend, aquí también se enviaría un PATCH a /alertas/:id
}

// Actualiza los contadores de alertas pendientes y la insignia de notificaciones.
function actualizarContadorAlertas() {
  const sinLeer = alertas.filter((a) => !a.leida && a.severidad !== "resuelta").length;
  $("contador-alertas").textContent = sinLeer;
  const insignia = $("insignia-notificaciones");
  insignia.textContent = sinLeer > 99 ? "99+" : sinLeer;
  insignia.hidden = sinLeer === 0;
  $("boton-notificaciones").setAttribute(
    "aria-label",
    sinLeer ? `Ver notificaciones, ${sinLeer} sin leer` : "Ver notificaciones, ninguna sin leer"
  );
}

/* ============================ CHAT CON LLAMA AI ============================ */

const TIEMPO_MAXIMO_CHAT_MS = 15000;

// Abre el chat y, opcionalmente, envía una pregunta inicial desde el botón de interpretación.
function abrirChat(preguntaInicial) {
  $("chat-ia").hidden = false;
  $("boton-chat").hidden = true;
  if (!$("chat-mensajes").children.length) agregarMensaje("ia", "Hola, soy el asistente de calidad del agua. Puedo explicarte la última lectura del tanque y darte recomendaciones de uso.");
  if (preguntaInicial) enviarPregunta(preguntaInicial);
  else $("chat-entrada").focus();
}

function cerrarChat() {
  $("chat-ia").hidden = true;
  $("boton-chat").hidden = false;
}

// Añade al historial un mensaje de usuario o del asistente y desplaza el chat al final.
function agregarMensaje(autor, texto) {
  const mensaje = document.createElement("li");
  mensaje.dataset.autor = autor;
  mensaje.textContent = texto;
  $("chat-mensajes").append(mensaje);
  $("chat-mensajes").scrollTop = $("chat-mensajes").scrollHeight;
}

// Solo letras, números y signos básicos de puntuación
const preguntaValida = (t) => /^[\p{L}\p{N}\s¿?¡!.,:;()%/-]+$/u.test(t);

// Respuesta simulada. En producción el backend arma el prompt con la lectura actual y llama a Llama AI.
function responderDemo(pregunta) {
  const l = ultimaLectura(nodoActual());
  const t = pregunta.toLowerCase();
  const resumen = `Última lectura: pH ${l.ph.toFixed(1)}, turbidez ${l.turbidez.toFixed(1)} NTU, conductividad ${l.conductividad.toFixed(0)} µS/cm. Clasificación: ${l.clasificacion}.`;
  const consejo = (REPORTES_DEMO[l.clasificacion] ?? ["", []])[1].join(". ");
  if (/beb|consum|tomar|cocin|segur|apta|interpret|lectura|diagn|recomend/.test(t)) return `${resumen}\n${REPORTES_DEMO[l.clasificacion][0]}\n${consejo}.`;
  if (/turbidez/.test(t)) return `La turbidez mide qué tan turbia está el agua por sedimentos. El límite de referencia es ${UMBRALES.turbidez.max} NTU y ahora está en ${l.turbidez.toFixed(1)} NTU. Después de lluvias suele subir.`;
  if (/conductividad/.test(t)) return `La conductividad indica la cantidad de sales disueltas. Ahora está en ${l.conductividad.toFixed(0)} µS/cm y el límite es ${UMBRALES.conductividad.max}.`;
  if (/ph|riego|agua|tanque|sensor|bater/.test(t)) return `${resumen}\nPara riego, estos valores son aceptables mientras la clasificación no sea "No apta".`;
  return "Soy un asistente especializado en el monitoreo del agua de tu comunidad. Hazme preguntas sobre la calidad del agua o las recomendaciones de uso.";
}

async function enviarPregunta(pregunta) {
  pregunta = pregunta.trim();
  if (!pregunta) return;
  if (!preguntaValida(pregunta)) return agregarMensaje("ia", "Escribe tu pregunta usando solo letras, números y signos de puntuación.");
  agregarMensaje("usuario", pregunta);
  $("chat-entrada").value = "";
  $("chat-estado").hidden = false;
  try {
    const consulta = CONFIG.usarDatosDemo
      ? new Promise((ok) => setTimeout(() => ok({ respuesta: responderDemo(pregunta) }), 700))
      : llamarApi(CONFIG.endpoints.chat, { method: "POST", body: JSON.stringify({ nodoId: nodoActual(), pregunta }) });
    const limite = new Promise((_, no) => setTimeout(() => no(new Error("tiempo agotado")), TIEMPO_MAXIMO_CHAT_MS));
    agregarMensaje("ia", (await Promise.race([consulta, limite])).respuesta);
  } catch {
    agregarMensaje("ia", "No fue posible conectar con el asistente de IA en este momento. Consulta las métricas y el estado en el Dashboard principal.");
  }
  $("chat-estado").hidden = true;
}

/* ============================ INICIO ============================ */

// Rellena los selectores de tanque y medición con las opciones disponibles.
function llenarSelectores() {
  const opcionesNodos = tanques.map((t) => `<option value="${t.nodoId}">${t.nombre}</option>`).join("");
  $("selector-tanque").innerHTML = opcionesNodos;
  $("filtro-nodo").innerHTML = `<option value="">Todos los nodos</option>${opcionesNodos}`;
  const opcionesVariables = VARIABLES.map((v) => `<option value="${v}">${UMBRALES[v].nombre}</option>`).join("");
  $("variable-grafica-principal").innerHTML = opcionesVariables;
  $("variable-tendencia").innerHTML = opcionesVariables;
}

// Carga los datos iniciales y actualiza los componentes de todas las secciones.
async function iniciarAplicacion() {
  await cargarTanques();
  await cargarLecturas();
  await cargarAlertas();
  llenarSelectores();
  actualizarDashboard();
  renderEstadoNodos();
  filtrarLecturas();
  renderAlertas();
  mostrarVista("vista-dashboard");
}

// Asocia los controles del HTML con sus funciones para navegación, formularios, filtros y chat.
function conectarEventos() {
  document.querySelectorAll(".pestanas button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".pestanas button").forEach((x) => x.classList.toggle("activa", x === b));
    $("form-login").hidden = b.dataset.formulario !== "form-login";
    $("form-registro").hidden = b.dataset.formulario !== "form-registro";
  }));
  $("form-login").addEventListener("submit", iniciarSesion);
  $("form-registro").addEventListener("submit", registrarUsuario);
  $("boton-cerrar-sesion").addEventListener("click", cerrarSesion);
  $("menu-principal").addEventListener("click", (e) => e.target.closest("button") && mostrarVista(e.target.closest("button").dataset.vista));
  $("boton-notificaciones").addEventListener("click", () => mostrarVista("vista-alertas"));
  $("selector-tanque").addEventListener("change", () => { actualizarDashboard(); actualizarTendencias(); });
  $("variable-grafica-principal").addEventListener("change", dibujarGraficaPrincipal);
  $("filtros-lecturas").addEventListener("submit", filtrarLecturas);
  $("boton-exportar").addEventListener("click", exportarCSV);
  $("filtros-alertas").addEventListener("click", (e) => e.target.dataset.severidad && filtrarAlertas(e.target.dataset.severidad));
  $("lista-alertas").addEventListener("click", accionAlerta);
  $("boton-chat").addEventListener("click", () => abrirChat());
  $("boton-interpretar").addEventListener("click", () => abrirChat("Interpreta la última lectura del tanque y dame recomendaciones."));
  $("boton-cerrar-chat").addEventListener("click", cerrarChat);
  $("form-chat").addEventListener("submit", (e) => { e.preventDefault(); enviarPregunta($("chat-entrada").value); });
  $("chat-sugerencias").addEventListener("click", (e) => e.target.dataset.pregunta && enviarPregunta(e.target.dataset.pregunta));
  $("boton-menu").addEventListener("click", () => document.querySelector(".barra-lateral").classList.toggle("abierta"));
  $("filtros-tendencias").addEventListener("submit", (e) => { e.preventDefault(); actualizarTendencias(); });
}

conectarEventos();