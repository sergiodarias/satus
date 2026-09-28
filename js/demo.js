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

    const matBase = { id: id(), categoria: 'material', nombre: 'Microcemento base', unidad: 'kg', stock: 60, stockMinimo: 20, precio: 6.5, notas: '' };
    const matFino = { id: id(), categoria: 'material', nombre: 'Microcemento fino', unidad: 'kg', stock: 18, stockMinimo: 15, precio: 7.9, notas: '' };
    const matCal = { id: id(), categoria: 'material', nombre: 'Estuco de cal', unidad: 'kg', stock: 40, stockMinimo: 10, precio: 4.2, notas: '' };
    const matPu = { id: id(), categoria: 'material', nombre: 'Poliuretano al agua', unidad: 'l', stock: 7, stockMinimo: 5, precio: 22, notas: 'Bicomponente' };
    const matDm = { id: id(), categoria: 'material', nombre: 'Tablero DM hidrófugo 19 mm', unidad: 'ud', stock: 12, stockMinimo: 4, precio: 38, notas: '' };

    const mesa = {
      id: id(), categoria: 'fabricado', nombre: 'Mesa comedor 200', tipo: 'interior', material: 'microcemento',
      dimensiones: '200×90×75 cm', precio: 1450, notas: '', ruta: R.slice(),
      receta: [{ materialId: matDm.id, cantidad: 2 }, { materialId: matBase.id, cantidad: 6 }, { materialId: matFino.id, cantidad: 4 }, { materialId: matPu.id, cantidad: 1 }]
    };
    const banco = {
      id: id(), categoria: 'fabricado', nombre: 'Banco exterior corrido', tipo: 'exterior', material: 'cal',
      dimensiones: '160×45×45 cm', precio: 890, notas: 'Acabado hidrofugado', ruta: R.slice(),
      receta: [{ materialId: matDm.id, cantidad: 1 }, { materialId: matCal.id, cantidad: 5 }, { materialId: matPu.id, cantidad: 0.5 }]
    };
    const lavabo = {
      id: id(), categoria: 'fabricado', nombre: 'Mueble lavabo suspendido', tipo: 'interior', material: 'microcemento',
      dimensiones: '120×50×45 cm', precio: 980, notas: '',
      ruta: ['Pedido recibido', 'Material recibido', 'Módulos preparados', 'Mano de producto base', 'Secado y lijado', 'Mano de producto final', 'Poliuretano aplicado', 'Montado y entregado'],
      receta: [{ materialId: matDm.id, cantidad: 1 }, { materialId: matBase.id, cantidad: 3 }, { materialId: matFino.id, cantidad: 2 }, { materialId: matPu.id, cantidad: 0.5 }]
    };

    function etapas(ruta, hechas, inicio, asignaciones) {
      return ruta.map((nombre, i) => ({
        nombre, completada: i < hechas,
        fecha: i < hechas ? hace(Math.max(0, inicio - Math.round(i * inicio / Math.max(1, hechas)))) : null,
        asignadoA: (asignaciones && asignaciones[i]) || null
      }));
    }
    function consumo(prod, cant) { return prod.receta.map(r => ({ materialId: r.materialId, cantidad: r.cantidad * cant })); }

    const p1 = {
      id: id(), clienteId: clientes[0].id, productoId: mesa.id, cantidad: 2, fechaPedido: hace(12), fechaEntrega: hace(-9),
      notas: 'Tono gris perla. Cantos redondeados.', etapas: etapas(mesa.ruta, 6, 12, { 6: 'u-usuario1', 7: 'u-usuario1' }),
      consumo: consumo(mesa, 2), materialesDespachados: true, fechaDespacho: hace(8)
    };
    const p2 = {
      id: id(), clienteId: clientes[1].id, productoId: banco.id, cantidad: 4, fechaPedido: hace(9), fechaEntrega: hace(-3),
      notas: 'Para la terraza del restaurante.', etapas: etapas(banco.ruta, 3, 9, { 3: 'u-usuario2' }),
      consumo: consumo(banco, 4), materialesDespachados: false, fechaDespacho: null
    };
    const p3 = {
      id: id(), clienteId: clientes[2].id, productoId: lavabo.id, cantidad: 1, fechaPedido: hace(30), fechaEntrega: hace(8),
      notas: '', etapas: etapas(lavabo.ruta, 8, 30), consumo: consumo(lavabo, 1), materialesDespachados: true, fechaDespacho: hace(26)
    };
    p3.etapas[p3.etapas.length - 1].fecha = hace(7);
    const p4 = {
      id: id(), clienteId: clientes[0].id, productoId: lavabo.id, cantidad: 1, fechaPedido: hace(2), fechaEntrega: hace(-20),
      notas: 'Hueco para sifón a la izquierda.', etapas: etapas(lavabo.ruta, 1, 2), consumo: consumo(lavabo, 1),
      materialesDespachados: false, fechaDespacho: null
    };

    const movimientos = [
      { id: id(), materialId: matDm.id, fecha: hace(8), tipo: 'salida', cantidad: 4, nota: 'Despacho de materiales — inicio de fabricación', auto: true, pedidoId: p1.id, usuarioId: 'u-eduardo' },
      { id: id(), materialId: matBase.id, fecha: hace(8), tipo: 'salida', cantidad: 12, nota: 'Despacho de materiales — inicio de fabricación', auto: true, pedidoId: p1.id, usuarioId: 'u-eduardo' },
      { id: id(), materialId: matBase.id, fecha: hace(15), tipo: 'entrada', cantidad: 50, nota: 'Compra proveedor', auto: false, pedidoId: null, usuarioId: 'u-eduardo' }
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
      version: 2, clientes,
      productos: [mesa, banco, lavabo, matBase, matFino, matCal, matPu, matDm],
      pedidos: [p4, p1, p2, p3], movimientos, tiempos, incidencias
    };
  };
})(window.App = window.App || {});
