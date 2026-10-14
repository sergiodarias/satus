/* ==========================================================================
   demo.js — Datos de ejemplo
   --------------------------------------------------------------------------
   Genera un taller ficticio con fechas relativas a hoy, para probar la app
   sin tocar datos reales. Se carga desde Ajustes (solo editores) o sola si
   App.config.AUTO_DEMO está activo y no hay datos.
   ========================================================================== */
(function (App) {
  'use strict';

  function hace(dias) {
    const d = new Date(); d.setDate(d.getDate() - dias);
    return App.util.todayISO(d);
  }
  function haceHoras(horas) { return new Date(Date.now() - horas * 3600000).toISOString(); }

  App.demo = function generarDatosDemo() {
    const R = App.config.DEFAULT_ROUTE;
    const id = App.util.uid;

    const clientes = [
      { id: id(), nombre: 'Estudio Brisa Interiorismo', contacto: 'Lucía Ferrer', telefono: '600 112 233', email: 'lucia@estudiobrisa.es', direccion: 'C/ Colón 14, Valencia', notas: 'Prefieren entregas a primera hora.' },
      { id: id(), nombre: 'Hotel Marjal', contacto: 'Andrés Pons', telefono: '961 445 210', email: 'compras@hotelmarjal.es', direccion: 'Av. del Mar 3, Cullera', notas: '' },
      { id: id(), nombre: 'Carmen Llorens', contacto: '', telefono: '655 908 771', email: '', direccion: 'Camí Vell 22, Picassent', notas: 'Particular. Terraza exterior.' }
    ];

    const matBase = { id: id(), categoria: 'material', nombre: 'Microcemento base', unidad: 'kg', precio: 6.5, notas: '' };
    const matFino = { id: id(), categoria: 'material', nombre: 'Microcemento fino', unidad: 'kg', precio: 7.9, notas: '' };
    const matCal = { id: id(), categoria: 'material', nombre: 'Estuco de cal', unidad: 'kg', precio: 4.2, notas: '' };
    const matPu = { id: id(), categoria: 'material', nombre: 'Poliuretano al agua', unidad: 'l', precio: 22, notas: 'Bicomponente' };
    const matDm = { id: id(), categoria: 'material', nombre: 'Tablero DM hidrófugo 19 mm', unidad: 'ud', precio: 38, notas: '' };

    const mesa = {
      id: id(), categoria: 'fabricado', nombre: 'Mesa comedor 200', tipo: 'interior', material: 'microcemento',
      dimensiones: '200×90×75 cm', precio: 1450, notas: '', ruta: R.slice()
    };
    const banco = {
      id: id(), categoria: 'fabricado', nombre: 'Banco exterior corrido', tipo: 'exterior', material: 'cal',
      dimensiones: '160×45×45 cm', precio: 890, notas: 'Acabado hidrofugado', ruta: R.slice()
    };
    const lavabo = {
      id: id(), categoria: 'fabricado', nombre: 'Mueble lavabo suspendido', tipo: 'interior', material: 'microcemento',
      dimensiones: '120×50×45 cm', precio: 980, notas: '',
      ruta: ['Pedido recibido', 'Recibir material del carpintero', 'Aplicar puente de unión', 'Dar 1.ª mano base', 'Lijar', 'Dar 1.ª mano de acabado', 'Dar 1.ª mano de poliuretano', 'Entregar pedido']
    };

    function etapas(ruta, hechas, inicio) {
      return ruta.map((nombre, i) => ({
        nombre, completada: i < hechas,
        fecha: i < hechas ? hace(Math.max(0, inicio - Math.round(i * inicio / Math.max(1, hechas)))) : null,
        asignadoA: null, consumoMaterial: null
      }));
    }

    const p1 = {
      id: id(), clienteId: clientes[0].id, productoId: mesa.id, cantidad: 2, fechaPedido: hace(12), fechaEntrega: hace(-9),
      notas: 'Tono gris perla. Cantos redondeados.', etapas: etapas(mesa.ruta, 6, 12),
      asignados: ['u-usuario1', 'u-usuario2']
    };
    const p2 = {
      id: id(), clienteId: clientes[1].id, productoId: banco.id, cantidad: 4, fechaPedido: hace(9), fechaEntrega: hace(-3),
      notas: 'Para la terraza del restaurante.', etapas: etapas(banco.ruta, 3, 9),
      asignados: ['u-usuario2']
    };
    const p3 = {
      id: id(), clienteId: clientes[2].id, productoId: lavabo.id, cantidad: 1, fechaPedido: hace(30), fechaEntrega: hace(8),
      notas: '', etapas: etapas(lavabo.ruta, 8, 30), asignados: ['u-usuario3']
    };
    p3.etapas[p3.etapas.length - 1].fecha = hace(7);
    const p4 = {
      id: id(), clienteId: clientes[0].id, productoId: lavabo.id, cantidad: 1, fechaPedido: hace(2), fechaEntrega: hace(-20),
      notas: 'Hueco para sifón a la izquierda.', etapas: etapas(lavabo.ruta, 1, 2), asignados: []
    };

    // Material consumido por etapa. Lo del lavabo terminado (p3) ya se puso a 0.
    const regLavabo = id();
    const c = (pedido, idx, mat, cantidad, usuarioId, dias, regularizacionId) => ({
      id: id(), pedidoId: pedido.id, etapaIdx: idx, etapaNombre: pedido.etapas[idx].nombre, materialId: mat.id, cantidad,
      fecha: hace(dias), usuarioId, nota: '', regularizacionId: regularizacionId || null
    });
    const consumos = [
      c(p1, 3, matBase, 6, 'u-usuario1', 7), c(p1, 4, matBase, 5.5, 'u-usuario1', 5), c(p1, 5, matFino, 3, 'u-usuario2', 3),
      c(p2, 2, matDm, 4, 'u-usuario2', 4),
      c(p3, 2, matBase, 3, 'u-usuario3', 25, regLavabo), c(p3, 6, matPu, 0.5, 'u-usuario3', 10)
    ];
    [[p1, [3, 4, 5]], [p2, [2]], [p3, [2, 6]]].forEach(([p, idxs]) => idxs.forEach(i => { p.etapas[i].consumoMaterial = 'si'; }));
    p1.etapas[1].consumoMaterial = 'no'; p1.etapas[2].consumoMaterial = 'no';

    const movimientos = [
      { id: regLavabo, materialId: matBase.id, fecha: hace(9), tipo: 'regularizacion', cantidad: 3, nota: 'Inventario cuadrado en la otra app', auto: false, pedidoId: null, usuarioId: 'u-eduardo' }
    ];

    const t = (pedido, idx, usuarioId, minutos, dias, nota) => ({
      id: id(), pedidoId: pedido.id, etapaIdx: idx, etapaNombre: pedido.etapas[idx].nombre, usuarioId, modo: 'manual',
      inicio: null, fin: null, minutos, fecha: hace(dias), nota: nota || ''
    });
    const tiempos = [
      t(p1, 3, 'u-usuario1', 150, 7, 'Corte y canteado'),
      t(p1, 4, 'u-usuario1', 95, 5),
      t(p1, 4, 'u-usuario2', 60, 5),
      t(p1, 5, 'u-usuario1', 80, 2, 'Lijado grano 120'),
      t(p2, 2, 'u-usuario2', 45, 4),
      t(p3, 2, 'u-usuario3', 120, 25),
      t(p3, 3, 'u-usuario3', 70, 22),
      t(p3, 6, 'u-usuario1', 40, 10),
      { id: id(), pedidoId: p1.id, etapaIdx: 6, etapaNombre: p1.etapas[6].nombre, usuarioId: 'u-usuario1', modo: 'timer',
        inicio: haceHoras(3.2), fin: haceHoras(1.9), minutos: 78, fecha: hace(0), nota: '' }
    ];

    const incidencias = [
      { id: id(), tipo: 'incidencia', gravedad: 'alta', texto: 'Uno de los tableros llegó con el canto astillado. Hay que pedir otro al carpintero.',
        pedidoId: p2.id, etapaIdx: 2, usuarioId: 'u-usuario2', creada: haceHoras(20), resuelta: false, resueltaPor: null, fechaResolucion: null },
      { id: id(), tipo: 'nota', gravedad: null, texto: 'Con 20 °C la primera capa ha tardado 6 h en secar. Dejar margen mañana.',
        pedidoId: p1.id, etapaIdx: 5, usuarioId: 'u-usuario1', creada: haceHoras(28), resuelta: false, resueltaPor: null, fechaResolucion: null },
      { id: id(), tipo: 'incidencia', gravedad: 'media', texto: 'Burbujas en la capa de poliuretano del lateral izquierdo.',
        pedidoId: p3.id, etapaIdx: 6, usuarioId: 'u-usuario1', creada: haceHoras(250), resuelta: true, resueltaPor: 'u-eduardo', fechaResolucion: haceHoras(230) }
    ];

    return {
      version: 3, clientes,
      productos: [mesa, banco, lavabo, matBase, matFino, matCal, matPu, matDm],
      pedidos: [p4, p1, p2, p3], movimientos, consumos, tiempos, incidencias
    };
  };
})(window.App = window.App || {});
