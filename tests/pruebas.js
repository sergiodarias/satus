/* ==========================================================================
   tests/pruebas.js — Batería de pruebas con DOM real (jsdom) y clics reales
   --------------------------------------------------------------------------
   Uso:   npm install jsdom
          node tests/pruebas.js
   Pásala antes de cada publicación. Termina con código 1 si algo falla.
   Lo que NO comprueba: aspecto visual (colores, solapes, tamaños). Eso se
   mira con el móvil en la mano.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const RAIZ = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
// Los scripts externos (supabase-js desde la CDN) se sustituyen por un doble de pruebas.
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]).filter(s => !/^https?:/.test(s));
const sinScripts = html.replace(/<script src="[^"]+"><\/script>/g, '');

let fallos = 0, ok = 0;
function check(cond, nombre) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { fallos++; console.log('  ✗ ' + nombre); }
}
const espera = (ms = 0) => new Promise(r => setTimeout(r, ms));

/** Arranca la app en un DOM nuevo. `almacen` permite simular una recarga. */
async function arrancar({ almacen, url, supabase } = {}) {
  const dom = new JSDOM(sinScripts, { url: url || 'https://ejemplo.github.io/produccion/?modo=local', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const errores = [];
  w.console.error = (...a) => errores.push(a.join(' '));
  w.addEventListener('error', e => errores.push(String(e.message)));
  if (almacen) Object.entries(almacen).forEach(([k, v]) => w.localStorage.setItem(k, v));
  w.scrollTo = () => {};
  w.__NO_AUTOSTART__ = true;
  if (supabase) w.supabase = { createClient: () => supabase };
  for (const s of scripts) w.eval(fs.readFileSync(path.join(RAIZ, s), 'utf8'));
  await w.App.app.iniciar();
  const d = w.document;
  const $ = s => d.querySelector(s);
  const $$ = s => [...d.querySelectorAll(s)];
  const clic = async (sel) => { const el = typeof sel === 'string' ? $(sel) : sel; if (!el) throw new Error('No existe: ' + sel); el.click(); await espera(); return el; };
  const accion = (nombre, extra) => $('[data-action="' + nombre + '"]' + (extra || ''));
  const rellenar = (sel, valor) => { const el = $(sel); if (!el) throw new Error('No existe: ' + sel); el.value = valor; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const enviar = async (form) => { const f = typeof form === 'string' ? $(form) : form; f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await espera(); };
  const confirmarDialogo = async () => { await espera(); await clic('[data-action="dialogo-si"].btn'); await espera(); };
  const almacenActual = () => { const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o; };
  const toast = () => ($('#toast-root') ? $('#toast-root').textContent : '');
  return { w, d, $, $$, clic, accion, rellenar, enviar, confirmarDialogo, almacenActual, errores, toast, App: w.App };
}

(async () => {
  console.log('\n1. Acceso y perfiles');
  let t = await arrancar();
  check(t.$$('[data-action="entrar"]').length === 5, 'La pantalla de acceso muestra los 5 usuarios');
  await t.clic('[data-action="entrar"][data-id="u-eduardo"]');
  check(t.$('.usuario-nombre').textContent === 'Eduardo Díaz', 'Entra como Eduardo Díaz');
  check(t.$$('.pestana').length === 5, 'Hay 5 pestañas');
  check(!!t.$('#version-app') === false, 'La versión solo aparece en Ajustes');
  await t.clic('[data-action="ajustes"]');
  check(t.$('#version-app').textContent === t.App.config.VERSION, 'Ajustes muestra la versión');
  await t.clic('[data-action="cargar-demo"]');
  check(t.App.repo.all('pedidos').length === 4, 'Carga los datos de ejemplo (4 pedidos)');

  console.log('\n2. Editor: catálogo, pedido, stock');
  await t.clic('[data-action="pestana"][data-valor="clientes"]');
  await t.clic(t.accion('nuevo-cliente'));
  t.rellenar('#cl-nombre', 'Taller Prueba S.L.');
  t.rellenar('#cl-telefono', '600 000 000');
  await t.enviar('form[data-form="cliente"]');
  check(t.App.catalogo.clientes().some(c => c.nombre === 'Taller Prueba S.L.'), 'Crea un cliente');
  check(!t.$('#sheet-root .hoja'), 'La hoja se cierra al guardar');

  await t.clic('[data-action="pestana"][data-valor="catalogo"]');
  await t.clic('[data-action="vista-catalogo"][data-valor="materiales"]');
  await t.clic(t.accion('nuevo-material'));
  t.rellenar('#ma-nombre', 'Pigmento ocre');
  t.$('#ma-unidad').value = 'kg';
  t.rellenar('#ma-stock', '3,5');
  t.rellenar('#ma-minimo', '1');
  await t.enviar('form[data-form="material"]');
  const pig = t.App.catalogo.materiales().find(m => m.nombre === 'Pigmento ocre');
  check(pig && pig.stock === 3.5, 'Crea un material aceptando coma decimal (3,5 kg)');

  await t.clic('[data-action="vista-catalogo"][data-valor="productos"]');
  await t.clic(t.accion('nuevo-producto'));
  t.rellenar('#pr-nombre', 'Taburete Cal');
  const nEtapas = t.$$('#editor-ruta li').length;
  await t.clic('[data-action="ruta-quitar"]');
  check(t.$$('#editor-ruta li').length === nEtapas - 1, 'Quita una etapa de la ruta');
  await t.clic('[data-action="ruta-anadir"]');
  const inputs = t.$$('#editor-ruta input');
  inputs[inputs.length - 1].value = 'Revisión final';
  await t.clic('[data-action="receta-anadir"]');
  const fila = t.$$('#editor-receta li').pop();
  fila.querySelector('select').value = pig.id;
  fila.querySelector('input').value = '2';
  // Error de validación: no debe perder lo escrito
  t.rellenar('#pr-nombre', '');
  await t.enviar('form[data-form="producto"]');
  check(!!t.$('#sheet-root .hoja') && t.$$('#editor-ruta li').length === nEtapas, 'Con error, la hoja sigue abierta y conserva la ruta editada');
  check(/obligatorio/.test(t.toast()), 'Explica el error ("obligatorio")');
  t.rellenar('#pr-nombre', 'Taburete Cal');
  await t.enviar('form[data-form="producto"]');
  const tab = t.App.catalogo.fabricados().find(p => p.nombre === 'Taburete Cal');
  check(tab && tab.ruta[tab.ruta.length - 1] === 'Revisión final' && tab.ruta.length === nEtapas, 'Guarda producto con la ruta editada');
  check(tab && tab.receta.length === 1 && tab.receta[0].cantidad === 2, 'Guarda la receta del producto');

  await t.clic('[data-action="pestana"][data-valor="pedidos"]');
  await t.clic(t.accion('nuevo-pedido'));
  const cli = t.App.catalogo.clientes().find(c => c.nombre === 'Taller Prueba S.L.');
  t.$('#pf-cliente').value = cli.id;
  t.rellenar('#pf-producto', tab.id);
  check(/Revisión final/.test(t.$('#pf-ruta').textContent), 'Al elegir producto se ve su ruta');
  t.rellenar('#pf-cantidad', '2');
  await t.enviar('form[data-form="pedido"]');
  // 2 unidades × 2 kg = 4 kg > 3,5 kg disponibles → pide confirmación
  check(!!t.$('#dialog-root .dialogo'), 'Avisa de material insuficiente antes de reservar');
  await t.confirmarDialogo();
  const ped = t.App.repo.all('pedidos').find(p => p.clienteId === cli.id);
  check(!!ped && ped.etapas.length === nEtapas && ped.etapas[0].completada, 'Crea el pedido con su ruta y la primera etapa hecha');
  check(t.App.catalogo.materialDisponible(t.App.repo.get('productos', pig.id)) === -0.5, 'Reserva material: disponible 3,5 − 4 = −0,5');
  check(t.App.repo.get('productos', pig.id).stock === 3.5, 'La reserva no toca el stock real');
  check(!!t.$('#pedido-' + ped.id + '.abierto'), 'El pedido nuevo aparece abierto');

  await t.clic('[data-action="alternar-etapa"][data-id="' + ped.id + '"][data-idx="1"]');
  check(t.App.repo.get('pedidos', ped.id).etapas[1].completada, 'Avanza la etapa 2');
  await t.clic('[data-action="alternar-etapa"][data-id="' + ped.id + '"][data-idx="1"]');
  check(!t.App.repo.get('pedidos', ped.id).etapas[1].completada, 'Deshace la etapa 2');
  check(!t.$('[data-action="alternar-etapa"][data-id="' + ped.id + '"][data-idx="5"]'), 'No deja saltarse etapas');

  await t.clic('[data-action="despachar"][data-id="' + ped.id + '"]');
  await t.confirmarDialogo();
  check(t.App.repo.get('productos', pig.id).stock === -0.5, 'Despachar descuenta del stock real');
  check(t.App.catalogo.movimientosDe(pig.id).some(m => m.pedidoId === ped.id && m.tipo === 'salida'), 'Queda un movimiento de salida');

  // Asignar etapa a usuario1
  await t.clic('[data-action="abrir-etapa"][data-id="' + ped.id + '"][data-idx="1"]');
  t.rellenar('#asignar-etapa', 'u-usuario1');
  check(t.App.repo.get('pedidos', ped.id).etapas[1].asignadoA === 'u-usuario1', 'Asigna la etapa a Usuario 1');
  await t.clic('[data-action="cerrar-hoja"].btn-icono');

  console.log('\n3. Operario: solo lectura + tiempos + incidencias');
  const almacen = t.almacenActual();
  t = await arrancar({ almacen, url: 'https://ejemplo.github.io/produccion/?como=usuario1&modo=local' });
  check(t.$('.usuario-nombre').textContent === 'Usuario 1', 'Entra como Usuario 1 con ?como=usuario1 (y los datos persisten)');
  check(!!t.$('.tarea') && /Mi trabajo/.test(t.$('#contenido').textContent), 'El panel muestra "Mi trabajo" con sus tareas asignadas');
  await t.clic('[data-action="pestana"][data-valor="pedidos"]');
  check(!t.accion('nuevo-pedido'), 'No ve "Nuevo pedido"');
  await t.clic('[data-action="filtro-pedidos"][data-valor="todos"]');
  await t.clic('[data-action="alternar-pedido"][data-id="' + ped.id + '"]');
  check(!t.$('[data-action="alternar-etapa"]'), 'No puede marcar etapas');
  check(!t.accion('eliminar-pedido') && !t.accion('editar-pedido') && !t.accion('despachar'), 'No ve editar, eliminar ni despachar');
  check(t.$$('.pestana').length === 3 && !t.$('[data-valor="catalogo"].pestana') && !t.$('[data-valor="clientes"].pestana'), 'Solo ve Panel, Pedidos e Incidencias (sin Catálogo ni Clientes)');
  const clienteDelPedido = t.App.repo.get('clientes', ped.clienteId).nombre;
  check(!t.$('#contenido').textContent.includes(clienteDelPedido) && !t.$('#contenido').textContent.includes('Estudio Brisa'), 'No aparece el nombre de ningún cliente en sus pedidos');
  check(t.$('#pedido-' + ped.id + ' .pedido-cliente').textContent === 'Taburete Cal' && /OF-\d{4}/.test(t.$('#pedido-' + ped.id).textContent), 'Ve la orden de fabricación: producto y número OF');
  check(!/€/.test(t.d.body.textContent), 'No aparece ningún precio');
  await t.clic('[data-action="pestana"][data-valor="panel"]');
  check(!/stock bajo/i.test(t.$('#contenido').textContent) && !t.$('#contenido').textContent.includes('Estudio Brisa'), 'El panel no enseña stock ni clientes');
  await t.clic('[data-action="pestana"][data-valor="pedidos"]');

  // Defensa en profundidad: la lógica de negocio también bloquea
  let bloqueado = false;
  try { t.App.pedidos.alternarEtapa(ped.id, 1); } catch (e) { bloqueado = /permiso/.test(e.message); }
  check(bloqueado, 'La lógica de negocio rechaza al operario aunque se salte la interfaz');
  bloqueado = false;
  try { t.App.catalogo.guardarCliente({ nombre: 'X' }); } catch (e) { bloqueado = /permiso/.test(e.message); }
  check(bloqueado, 'Tampoco puede crear clientes por código');

  // Temporizador
  await t.clic('[data-action="pestana"][data-valor="pedidos"]');
  if (!t.$('#pedido-' + ped.id + '.abierto')) await t.clic('[data-action="alternar-pedido"][data-id="' + ped.id + '"]');
  await t.clic('[data-action="iniciar-tiempo"][data-id="' + ped.id + '"]');
  const enMarcha = t.App.tiempos.enMarcha('u-usuario3') === null && t.App.tiempos.enMarcha('u-usuario1');
  check(!!enMarcha, 'Inicia el temporizador');
  check(!!t.$('.banner-tiempo'), 'Aparece la barra del temporizador en marcha');
  // Simular 25 minutos
  enMarcha.inicio = new Date(Date.now() - 25 * 60000).toISOString();
  t.App.app.pintar();
  check(t.$('.banner-tiempo-reloj').textContent.startsWith('00:25'), 'El reloj cuenta desde la hora de inicio (00:25:xx)');
  // Iniciar en otra etapa para el temporizador anterior
  await t.clic('[data-action="abrir-etapa"][data-id="' + ped.id + '"][data-idx="3"]');
  await t.clic('#sheet-root [data-action="iniciar-tiempo"]');
  const cerrado = t.App.repo.get('tiempos', enMarcha.id);
  check(cerrado.fin && cerrado.minutos === 25, 'Al iniciar otro, el anterior se guarda (25 min)');
  await t.clic('#sheet-root [data-action="parar-tiempo"]');
  check(!t.App.tiempos.enMarcha('u-usuario1') && !t.$('.banner-tiempo'), 'Parar guarda y quita la barra');

  // Imputación manual
  t.rellenar('#tm-horas', '1,5');
  t.rellenar('#tm-minutos', '10');
  t.rellenar('#tm-nota', 'Lijado fino');
  await t.enviar('form[data-form="tiempo-manual"]');
  const manual = t.App.repo.where('tiempos', x => x.modo === 'manual' && x.nota === 'Lijado fino')[0];
  check(manual && manual.minutos === 100 && manual.usuarioId === 'u-usuario1', 'Imputa 1,5 h + 10 min = 100 min a su nombre');
  check(t.$('#tm-horas').value === '', 'El formulario se vacía tras guardar');
  check(!t.$('#tm-usuario'), 'El operario no puede imputar a nombre de otro');
  t.rellenar('#tm-horas', '30');
  await t.enviar('form[data-form="tiempo-manual"]');
  check(/no puede pasar/.test(t.toast()), 'Rechaza imputaciones de más de 16 h');
  check(t.$('#tm-horas').value === '30', 'Con error conserva lo tecleado');

  // Borrar: propio sí, ajeno no
  check(!!t.$('[data-action="borrar-tiempo"][data-id="' + manual.id + '"]'), 'Puede borrar su propio registro');
  const ajeno = t.App.repo.where('tiempos', x => x.usuarioId !== 'u-usuario1')[0];
  bloqueado = false;
  try { t.App.tiempos.eliminar(ajeno.id); } catch (e) { bloqueado = true; }
  check(bloqueado, 'No puede borrar registros de otros');
  await t.clic('[data-action="borrar-tiempo"][data-id="' + manual.id + '"]');
  await t.confirmarDialogo();
  check(!t.App.repo.get('tiempos', manual.id), 'Borra su registro tras confirmar');

  // Incidencia desde la hoja de etapa
  await t.clic('#sheet-root [data-action="nueva-incidencia"]');
  check(t.$('#inc-pedido').value === ped.id && t.$('#inc-etapa').value === '3', 'La incidencia llega con pedido y etapa ya elegidos');
  t.$$('input[name="gravedad"]').find(x => x.value === 'alta').checked = true;
  t.rellenar('#inc-texto', 'Falta pigmento para terminar.');
  await t.enviar('form[data-form="incidencia"]');
  const inc = t.App.incidencias.todas().find(x => x.texto === 'Falta pigmento para terminar.');
  check(inc && inc.gravedad === 'alta' && inc.etapaIdx === 3 && inc.usuarioId === 'u-usuario1', 'Registra la incidencia (alta, etapa 4, a su nombre)');
  // Nota de campo desde la pestaña
  await t.clic('[data-action="pestana"][data-valor="incidencias"]');
  await t.clic(t.accion('nueva-incidencia'));
  const radioNota = t.$('input[name="tipo"][value="nota"]');
  radioNota.checked = true; radioNota.dispatchEvent(new t.w.Event('change', { bubbles: true }));
  check(t.$('#campo-gravedad').hidden, 'Al elegir "Nota" se oculta la gravedad');
  t.rellenar('#inc-texto', 'Humedad alta hoy.');
  await t.enviar('form[data-form="incidencia"]');
  const nota = t.App.incidencias.todas().find(x => x.texto === 'Humedad alta hoy.');
  check(nota && nota.tipo === 'nota' && nota.pedidoId === null, 'Registra una nota general sin pedido');
  check(!t.accion('resolver-incidencia'), 'El operario no puede resolver incidencias');
  const ajena = t.App.incidencias.todas().find(x => x.usuarioId !== 'u-usuario1');
  check(!t.$('[data-action="borrar-incidencia"][data-id="' + ajena.id + '"]'), 'No puede borrar incidencias de otros');

  console.log('\n4. Editor resuelve y limpia');
  t = await arrancar({ almacen: t.almacenActual(), url: 'https://ejemplo.github.io/produccion/?como=sergio&modo=local' });
  await t.clic('[data-action="pestana"][data-valor="incidencias"]');
  await t.clic('[data-action="resolver-incidencia"][data-id="' + inc.id + '"]');
  check(t.App.repo.get('incidencias', inc.id).resuelta && t.App.repo.get('incidencias', inc.id).resueltaPor === 'u-sergio', 'Sergio resuelve la incidencia');
  await t.clic('[data-action="pestana"][data-valor="pedidos"]');
  await t.clic('[data-action="filtro-pedidos"][data-valor="todos"]');
  await t.clic('[data-action="alternar-pedido"][data-id="' + ped.id + '"]');
  await t.clic('[data-action="eliminar-pedido"][data-id="' + ped.id + '"]');
  await t.confirmarDialogo();
  check(!t.App.repo.get('pedidos', ped.id), 'Elimina el pedido');
  check(t.App.repo.get('productos', pig.id).stock === 3.5, 'El material despachado vuelve al stock');
  check(!t.App.repo.where('tiempos', x => x.pedidoId === ped.id).length && !t.App.repo.get('incidencias', inc.id), 'Se borran sus tiempos e incidencias');

  console.log('\n5. Importar copia de la versión anterior');
  const legado = {
    clientes: [{ id: 'c_1', nombre: 'Cliente antiguo' }],
    productos: [
      { id: 'pr_m', categoria: 'material', nombre: 'Cal', unidad: 'kg', stock: 10, movimientos: [{ id: 'm_1', fecha: '2026-09-01', tipo: 'entrada', cantidad: 10, nota: 'Compra' }] },
      { id: 'pr_f', categoria: 'fabricado', nombre: 'Mesa', ruta: ['A', 'B'], receta: [{ materialId: 'pr_m', cantidad: 1 }] }
    ],
    pedidos: [{ id: 'p_1', clienteId: 'c_1', productoId: 'pr_f', cantidad: 1, fechaPedido: '2026-09-02', etapas: [{ nombre: 'A', completada: true, fecha: '2026-09-02' }, { nombre: 'B', completada: false, fecha: null }], consumo: [{ materialId: 'pr_m', cantidad: 1 }], materialesDespachados: false }]
  };
  t.App.repo.replaceAll(legado);
  check(t.App.repo.all('movimientos').length === 1 && !t.App.repo.get('productos', 'pr_m').movimientos, 'Convierte los movimientos antiguos a su colección');
  check(t.App.repo.get('pedidos', 'p_1').etapas[1].asignadoA === null, 'Completa los campos nuevos de las etapas');
  t.App.app.pintar();
  check(/Cliente antiguo/.test(t.$('#contenido').textContent), 'Pinta los datos importados');

  console.log('\n6. Errores de JavaScript');
  check(t.errores.length === 0, 'Sin errores en consola' + (t.errores.length ? ': ' + t.errores.join(' | ') : ''));

  console.log('\n7. Modo servidor (Supabase simulado)');
  const E = 'aaaaaaaa-0000-0000-0000-00000000000';
  const S = {
    sesion: null, log: [],
    usuarios: [{ id: E + '1', email: 'eduardo@taller.es', password: 'clave-ed' }, { id: E + '3', email: 'usuario1@taller.es', password: 'clave-u1' }],
    tablas: {
      perfiles: [{ id: E + '1', nombre: 'Eduardo Díaz', rol: 'editor' }, { id: E + '3', nombre: 'Usuario 1', rol: 'operario' }],
      clientes: [{ id: 'c1', nombre: 'Hotel Marjal', contacto: '', telefono: '', email: '', direccion: '', notas: '', creado: '2026-09-01T10:00:00+00:00' }],
      productos: [
        { id: 'f1', categoria: 'fabricado', nombre: 'Banco exterior', notas: '', tipo: 'exterior', material: 'cal', dimensiones: '160×45', ruta: ['Corte', 'Base', 'Entrega'], receta: [], unidad: 'ud', stock: 0, stock_minimo: null, creado: '2026-09-01T10:00:00+00:00' }
      ],
      precios: [{ producto_id: 'f1', precio: 890 }],
      pedidos: [{ id: 'p1', numero: 7, cliente_id: 'c1', producto_id: 'f1', cantidad: 2, fecha_pedido: '2026-09-20', fecha_entrega: null, notas: 'Tono arena',
        etapas: [{ nombre: 'Corte', completada: true, fecha: '2026-09-20', asignadoA: null }, { nombre: 'Base', completada: false, fecha: null, asignadoA: E + '3' }, { nombre: 'Entrega', completada: false, fecha: null, asignadoA: null }],
        consumo: [], materiales_despachados: false, fecha_despacho: null, creado: '2026-09-20T10:00:00+00:00' }],
      movimientos_stock: [], tiempos: [], incidencias: []
    }
  };
  function falsoSupabase(estado) {
    const from = tabla => {
      let op = 'select', payload = null, filtro = null, rango = null;
      const run = () => {
        const t = estado.tablas[tabla] = estado.tablas[tabla] || [];
        estado.log.push({ tabla, op, payload });
        if (op === 'select') { let d = t.slice(); if (rango) d = d.slice(rango[0], rango[1] + 1); return { data: JSON.parse(JSON.stringify(d)), error: null }; }
        if (op === 'insert') { [].concat(payload).forEach(r => t.push(Object.assign({}, r))); return { error: null }; }
        if (op === 'update') { t.filter(r => r[filtro[0]] === filtro[1]).forEach(r => Object.assign(r, payload)); return { error: null }; }
        if (op === 'upsert') { const k = tabla === 'precios' ? 'producto_id' : 'id'; [].concat(payload).forEach(r => { const i = t.findIndex(x => x[k] === r[k]); if (i >= 0) Object.assign(t[i], r); else t.push(Object.assign({}, r)); }); return { error: null }; }
        if (op === 'delete') { estado.tablas[tabla] = t.filter(r => r[filtro[0]] !== filtro[1]); return { error: null }; }
      };
      const b = {
        select() { return b; }, order() { return b; }, range(a, z) { rango = [a, z]; return b; },
        insert(p) { op = 'insert'; payload = p; return b; }, update(p) { op = 'update'; payload = p; return b; },
        upsert(p) { op = 'upsert'; payload = p; return b; }, delete() { op = 'delete'; return b; },
        eq(c, v) { filtro = [c, v]; return b; },
        then(ok, ko) { return Promise.resolve().then(run).then(ok, ko); }
      };
      return b;
    };
    return {
      from,
      auth: {
        async getSession() { return { data: { session: estado.sesion } }; },
        async signInWithPassword({ email, password }) {
          const u = estado.usuarios.find(x => x.email === email && x.password === password);
          if (!u) return { data: null, error: { message: 'Invalid login credentials' } };
          estado.sesion = { user: { id: u.id } };
          return { data: { user: { id: u.id } }, error: null };
        },
        async signOut() { estado.sesion = null; return { error: null }; }
      }
    };
  }
  const fake = falsoSupabase(S);
  const URL_SRV = 'https://ejemplo.github.io/produccion/';
  let s2 = await arrancar({ url: URL_SRV, supabase: fake });
  check(!!s2.$('form[data-form="acceso"] #acc-email') && !s2.$('[data-action="entrar"]'), 'Sin sesión pide email y contraseña (no hay lista de usuarios)');
  s2.$('#acc-email').value = 'eduardo@taller.es'; s2.$('#acc-pass').value = 'mal';
  await s2.enviar('form[data-form="acceso"]'); await espera(5);
  check(/incorrectos/.test(s2.$('.acceso-error').textContent), 'Contraseña mala: «Email o contraseña incorrectos.»');
  s2.$('#acc-pass').value = 'clave-ed';
  await s2.enviar('form[data-form="acceso"]'); await espera(5);
  check(s2.$('.usuario-nombre') && s2.$('.usuario-nombre').textContent === 'Eduardo Díaz', 'Entra Eduardo con su contraseña; nombre y rol desde «perfiles»');
  const p1 = s2.App.repo.get('pedidos', 'p1');
  check(p1 && p1.clienteId === 'c1' && p1.fechaPedido === '2026-09-20' && p1.etapas.length === 3, 'Lee las tablas y traduce columnas (cliente_id → clienteId)');
  check(s2.App.repo.get('productos', 'f1').precio === 890, 'Junta el precio (tabla aparte) con su producto');
  check(s2.App.pedidos.codigo(p1) === 'OF-0007', 'Respeta el número de OF del servidor (OF-0007)');

  await s2.clic('[data-action="pestana"][data-valor="clientes"]');
  await s2.clic(s2.accion('nuevo-cliente'));
  s2.rellenar('#cl-nombre', 'Casa Llorens');
  await s2.enviar('form[data-form="cliente"]'); await espera(5);
  const filaCli = S.tablas.clientes.find(c => c.nombre === 'Casa Llorens');
  check(filaCli && Object.keys(filaCli).every(k => /^[a-z_]+$/.test(k)), 'Crear cliente inserta una fila con columnas snake_case');

  await s2.clic('[data-action="pestana"][data-valor="catalogo"]');
  await s2.clic('[data-action="alternar-producto"][data-id="f1"]');
  await s2.clic('[data-action="editar-producto"][data-id="f1"]');
  s2.rellenar('#pr-precio', '950');
  await s2.enviar('form[data-form="producto"]'); await espera(5);
  check(S.tablas.precios.find(p => p.producto_id === 'f1').precio === 950 && !('precio' in S.tablas.productos.find(p => p.id === 'f1')), 'El precio se guarda en «precios», nunca en «productos»');

  await s2.clic('[data-action="pestana"][data-valor="pedidos"]');
  await s2.clic('[data-action="nuevo-pedido"]');
  s2.$('#pf-cliente').value = 'c1';
  await s2.enviar('form[data-form="pedido"]'); await espera(5);
  check(S.tablas.pedidos.some(p => p.numero === 8 && Array.isArray(p.etapas) && p.etapas.length === 3), 'Pedido nuevo: OF-0008 con sus etapas como jsonb');

  // Cambio hecho por otra persona → aparece al recargar
  S.tablas.pedidos[0].notas = 'Cambiado desde otro móvil';
  await s2.App.app.recargar(true); await espera(5);
  check(s2.App.repo.get('pedidos', 'p1').notas === 'Cambiado desde otro móvil', 'Recargar trae los cambios de los demás');

  // Subir la copia de la versión anterior
  const antes = S.tablas.pedidos.length;
  await s2.App.repo.importar(legado);
  check(S.tablas.pedidos.length === antes + 1 && S.tablas.movimientos_stock.length === 1 && S.tablas.clientes.some(c => c.id === 'c_1'), 'Subir la copia antigua añade sus pedidos, clientes y movimientos sin borrar nada');
  const nums = S.tablas.pedidos.map(p => p.numero);
  check(new Set(nums).size === nums.length, 'Al subir la copia no se repiten números de OF (' + nums.join(', ') + ')');

  await s2.clic('[data-action="ajustes"]');
  check(!s2.accion('cargar-demo') && !s2.accion('borrar-todo'), 'Con datos compartidos no se ofrece «Borrar todo» ni «Datos de ejemplo»');
  await s2.clic('[data-action="salir"]'); await espera(5);
  check(!!s2.$('form[data-form="acceso"]') && S.sesion === null, 'Cerrar sesión vuelve al acceso');

  // Operario con sesión recordada
  S.sesion = { user: { id: E + '3' } };
  s2 = await arrancar({ url: URL_SRV, supabase: fake });
  check(s2.$('.usuario-nombre').textContent === 'Usuario 1' && s2.$$('.pestana').length === 3, 'Operario: sesión recordada y solo 3 pestañas');
  check(!s2.$('#contenido').textContent.includes('Hotel Marjal') && /OF-0007/.test(s2.$('#contenido').textContent), 'Operario: «Mi trabajo» muestra OF-0007, sin cliente');
  await s2.clic('.tarea [data-action="iniciar-tiempo"]'); await espera(5);
  const tFila = S.tablas.tiempos[0];
  check(tFila && tFila.usuario_id === E + '3' && tFila.etapa_idx === 1 && tFila.fin === null, 'Iniciar temporizador inserta en «tiempos» a su nombre');
  await s2.clic('.banner-tiempo [data-action="parar-tiempo"]'); await espera(5);
  check(S.tablas.tiempos[0].fin && S.tablas.tiempos[0].minutos >= 1, 'Parar actualiza la fila con fin y minutos');
  check(s2.errores.length === 0, 'Modo servidor sin errores en consola' + (s2.errores.length ? ': ' + s2.errores.join(' | ') : ''));

  console.log('\n' + ok + ' correctas, ' + fallos + ' fallidas\n');
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
