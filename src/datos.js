'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DEPOSITO, Costos, Mundo, Pedido, Vehiculo, Ruta, Plan, horaAMinutos } = require('./modelo');

// Un campo faltante o null vale lo mismo: toma el valor por defecto.
const vacio = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

function leerJson(archivo) {
  const texto = fs.readFileSync(archivo, 'utf8').replace(/^﻿/, '');
  try {
    return JSON.parse(texto);
  } catch (e) {
    throw new Error(`${path.basename(archivo)}: JSON inválido (${e.message})`);
  }
}

function entero(v, donde) {
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  if (typeof n !== 'number' || !Number.isInteger(n)) {
    throw new Error(`${donde}: se esperaba un entero y vino ${JSON.stringify(v)}`);
  }
  return n;
}

function numero(v, donde) {
  const n = typeof v === 'string' ? Number(v.trim().replace(',', '.')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new Error(`${donde}: se esperaba un número y vino ${JSON.stringify(v)}`);
  }
  return n;
}

function hora(v, donde) {
  try {
    return horaAMinutos(v);
  } catch (e) {
    throw new Error(`${donde}: ${e.message}`);
  }
}

// Copia al objeto los campos que el programa no conoce (reglas nuevas).
function guardarExtras(objeto, fila, conocidos) {
  for (const [clave, valor] of Object.entries(fila)) {
    if (!conocidos.includes(clave) && !(clave in objeto)) objeto[clave] = valor;
  }
  return objeto;
}

// ---------------------------------------------------------------------- mundo

// [clave en el archivo, propiedad, conversor, defecto]
const CAMPOS_MUNDO = [
  ['grilla_ancho', 'ancho', entero, 20],
  ['grilla_alto', 'alto', entero, 20],
  ['deposito_x', 'depositoX', entero, 0],
  ['deposito_y', 'depositoY', entero, 0],
  ['hora_salida', 'horaSalida', hora, '08:00'],
  ['tiempo_servicio', 'tiempoServicio', entero, 5],
  ['tiempo_carga', 'tiempoCarga', entero, 10],
  ['min_por_cuadra', 'minPorCuadra', entero, 3],
  ['costo_por_cuadra', 'porCuadra', numero, 3],
  ['costo_por_vehiculo', 'porVehiculo', numero, 60],
  ['costo_por_minuto_total', 'porMinutoTotal', numero, 1],
  ['costo_por_falla', 'porFalla', numero, 200],
];

function mundoDesdeObjeto(d) {
  if (vacio(d)) d = {};
  if (typeof d !== 'object' || Array.isArray(d)) throw new Error('mundo: se esperaba un objeto con claves');
  const v = {};
  for (const [clave, prop, conversor, defecto] of CAMPOS_MUNDO) {
    v[prop] = conversor(vacio(d[clave]) ? defecto : d[clave], `mundo.${clave}`);
  }
  const mundo = new Mundo({
    ancho: v.ancho,
    alto: v.alto,
    deposito: { x: v.depositoX, y: v.depositoY },
    horaSalida: v.horaSalida,
    tiempoServicio: v.tiempoServicio,
    tiempoCarga: v.tiempoCarga,
    minPorCuadra: v.minPorCuadra,
    costos: new Costos({
      porCuadra: v.porCuadra,
      porVehiculo: v.porVehiculo,
      porMinutoTotal: v.porMinutoTotal,
      porFalla: v.porFalla,
    }),
  });
  if (mundo.ancho <= 0 || mundo.alto <= 0) throw new Error('mundo: la grilla debe tener tamaño positivo');
  if (!mundo.contiene(mundo.deposito)) throw new Error('mundo: el depósito está fuera de la grilla');
  return guardarExtras(mundo, d, CAMPOS_MUNDO.map((c) => c[0]));
}

// -------------------------------------------------------------------- pedidos

const CAMPOS_PEDIDO = ['id', 'x', 'y', 'peso'];

function pedidosDesdeLista(filas, mundo) {
  if (!Array.isArray(filas)) throw new Error('pedidos: se esperaba una lista');
  const pedidos = new Map();
  filas.forEach((f, i) => {
    if (vacio(f) || typeof f !== 'object') throw new Error(`pedidos, elemento ${i + 1}: se esperaba un objeto`);
    for (const req of ['id', 'x', 'y']) {
      if (vacio(f[req])) throw new Error(`pedidos, elemento ${i + 1}: falta '${req}'`);
    }
    const id = entero(f.id, `pedidos, elemento ${i + 1}, id`);
    const donde = `pedido ${id}`;
    const pos = { x: entero(f.x, `${donde}, x`), y: entero(f.y, `${donde}, y`) };
    const peso = vacio(f.peso) ? 0 : entero(f.peso, `${donde}, peso`);
    if (pedidos.has(id)) throw new Error(`${donde}: id repetido`);
    if (!mundo.contiene(pos)) throw new Error(`${donde}: (${pos.x},${pos.y}) está fuera de la grilla`);
    if (peso < 0) throw new Error(`${donde}: peso negativo`);
    pedidos.set(id, guardarExtras(new Pedido({ id, pos, peso }), f, CAMPOS_PEDIDO));
  });
  return pedidos;
}

// ------------------------------------------------------------------ vehículos

const CAMPOS_VEHICULO = ['id', 'min_por_cuadra', 'costo_fijo'];

function vehiculosDesdeLista(filas, mundo) {
  if (!Array.isArray(filas)) throw new Error('vehiculos: se esperaba una lista');
  const vehiculos = new Map();
  filas.forEach((f, i) => {
    if (vacio(f) || typeof f !== 'object' || vacio(f.id)) throw new Error(`vehiculos, elemento ${i + 1}: falta 'id'`);
    const id = String(f.id).trim();
    const donde = `vehículo ${id}`;
    if (vehiculos.has(id)) throw new Error(`${donde}: id repetido`);
    if (id.toUpperCase() === DEPOSITO) throw new Error(`${donde}: '${DEPOSITO}' no puede usarse como id de vehículo`);
    const propios = {};
    if (!vacio(f.min_por_cuadra)) propios.minPorCuadra = entero(f.min_por_cuadra, `${donde}, min_por_cuadra`);
    if (!vacio(f.costo_fijo)) propios.costoFijo = numero(f.costo_fijo, `${donde}, costo_fijo`);
    if (propios.minPorCuadra !== undefined && propios.minPorCuadra <= 0) {
      throw new Error(`${donde}: min_por_cuadra debe ser positivo`);
    }
    vehiculos.set(id, guardarExtras(new Vehiculo({ id }, mundo, propios), f, CAMPOS_VEHICULO));
  });
  return vehiculos;
}

// ------------------------------------------------------------------- archivos

// Devuelve { mundo, pedidos, vehiculos }. pedidos (por id numérico) y
// vehiculos (por id de texto) son Map que conservan el orden del archivo.
function cargarDataset(carpeta) {
  if (!fs.existsSync(carpeta) || !fs.statSync(carpeta).isDirectory()) {
    throw new Error(`no existe la carpeta de datos: ${carpeta}`);
  }
  const archivo = (nombre) => path.join(carpeta, `${nombre}.json`);
  const mundo = fs.existsSync(archivo('mundo')) ? mundoDesdeObjeto(leerJson(archivo('mundo'))) : mundoDesdeObjeto({});
  for (const nombre of ['pedidos', 'vehiculos']) {
    if (!fs.existsSync(archivo(nombre))) throw new Error(`falta ${nombre}.json en ${carpeta}`);
  }
  return {
    mundo,
    pedidos: pedidosDesdeLista(leerJson(archivo('pedidos')), mundo),
    vehiculos: vehiculosDesdeLista(leerJson(archivo('vehiculos')), mundo),
  };
}

function parada(p) {
  if (typeof p === 'string' && p.trim().toUpperCase() === DEPOSITO) return DEPOSITO;
  const n = typeof p === 'string' ? Number(p.trim()) : p;
  if (!Number.isInteger(n)) throw new Error(`parada inválida: ${JSON.stringify(p)}`);
  return n;
}

// Escribe { "rutas": [ { "vehiculo": "V1", "paradas": [2, 1, "DEPOSITO", 8] } ] }
// sin los vehículos de ruta vacía.
function guardarPlan(ruta, plan) {
  const rutas = plan.rutas
    .filter((r) => r.paradas.length > 0)
    .map((r) => ({ vehiculo: String(r.vehiculo), paradas: r.paradas.map(parada) }));
  fs.writeFileSync(ruta, `${JSON.stringify({ rutas }, null, 2)}\n`, 'utf8');
}

// Relee un plan escrito con guardarPlan.
function cargarPlan(ruta) {
  const d = leerJson(ruta);
  if (!d || !Array.isArray(d.rutas)) throw new Error('el plan debe ser un objeto con una lista "rutas"');
  return new Plan(d.rutas.map((r) => new Ruta(String(r.vehiculo), (r.paradas || []).map(parada))));
}

module.exports = { cargarDataset, guardarPlan, cargarPlan };
