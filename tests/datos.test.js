'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { cargarDataset, guardarPlan, cargarPlan } = require('../src/datos');
const { Plan, Ruta } = require('../src/modelo');

const RAIZ = path.join(__dirname, '..');
const EJEMPLO = path.join(RAIZ, '..', 'quickdrop-sim', 'datos', 'ejemplo');

function carpetaTemporal(archivos) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quickdrop-'));
  for (const [nombre, contenido] of Object.entries(archivos)) {
    fs.writeFileSync(path.join(dir, `${nombre}.json`), JSON.stringify(contenido));
  }
  return dir;
}

test('cierre1: 40 pedidos, 5 vehículos y puntos de verificación', () => {
  const { mundo, pedidos, vehiculos } = cargarDataset(path.join(RAIZ, 'cierre1'));
  assert.equal(pedidos.size, 40);
  assert.deepEqual([...vehiculos.keys()], ['V1', 'V2', 'V3', 'V4', 'V5']);
  assert.deepEqual([mundo.ancho, mundo.alto], [20, 20]);
  assert.deepEqual(mundo.deposito, { x: 0, y: 0 });
  assert.equal(mundo.costos.porCuadra, 3);
  assert.equal(mundo.costos.porVehiculo, 60);
  assert.equal(mundo.costos.porMinutoTotal, 1);
  assert.equal(mundo.costos.porFalla, 200);
  const verificacion = { 1: [8, 17], 39: [14, 0], 28: [0, 1], 37: [17, 19], 22: [19, 11] };
  for (const [id, [x, y]] of Object.entries(verificacion)) {
    assert.deepEqual(pedidos.get(Number(id)).pos, { x, y }, `pedido ${id}`);
  }
  for (const v of vehiculos.values()) {
    assert.equal(v.minPorCuadra, 3);
    assert.equal(v.costoFijo, 60);
  }
});

test('ejemplo oficial del simulador', { skip: !fs.existsSync(EJEMPLO) && 'falta ../quickdrop-sim' }, () => {
  const { mundo, pedidos, vehiculos } = cargarDataset(EJEMPLO);
  assert.equal(pedidos.size, 10);
  assert.equal(vehiculos.size, 3);
  assert.deepEqual(pedidos.get(1).pos, { x: 3, y: 4 });
  assert.equal(pedidos.get(7).peso, 25);
  assert.equal(mundo.horaSalida, 480);
});

test('campos faltantes o null toman el valor por defecto', () => {
  const dir = carpetaTemporal({
    mundo: { grilla_ancho: 10, deposito_x: null, costo_por_falla: null, hora_salida: '09:30' },
    pedidos: [{ id: 1, x: 2, y: 3, peso: null }],
    vehiculos: [{ id: 'V1', min_por_cuadra: null, costo_fijo: null }, { id: 'V2' }],
  });
  const { mundo, pedidos, vehiculos } = cargarDataset(dir);
  assert.equal(mundo.ancho, 10);
  assert.equal(mundo.alto, 20);
  assert.equal(mundo.deposito.x, 0);
  assert.equal(mundo.costos.porFalla, 200);
  assert.equal(mundo.tiempoServicio, 5);
  assert.equal(mundo.horaSalida, 570);
  assert.equal(pedidos.get(1).peso, 0);
  assert.equal(vehiculos.get('V1').minPorCuadra, 3);
  assert.equal(vehiculos.get('V1').costoFijo, 60);
});

test('un mundo vacío usa todos los defaults', () => {
  const dir = carpetaTemporal({ mundo: {}, pedidos: [], vehiculos: [{ id: 'V1' }] });
  const { mundo } = cargarDataset(dir);
  assert.equal(mundo.costos.porVehiculo, 60);
  assert.equal(mundo.tiempoCarga, 10);
});

test('el vehículo puede traer su propia velocidad y costo', () => {
  const dir = carpetaTemporal({
    mundo: { min_por_cuadra: 3, costo_por_vehiculo: 60 },
    pedidos: [],
    vehiculos: [{ id: 'V1', min_por_cuadra: 2, costo_fijo: 100 }, { id: 'V2' }],
  });
  const { vehiculos } = cargarDataset(dir);
  assert.equal(vehiculos.get('V1').minPorCuadra, 2);
  assert.equal(vehiculos.get('V1').costoFijo, 100);
  assert.equal(vehiculos.get('V2').minPorCuadra, 3);
  assert.equal(vehiculos.get('V2').costoFijo, 60);
});

test('campos desconocidos se conservan', () => {
  const dir = carpetaTemporal({
    mundo: { limite_peso: 50 },
    pedidos: [{ id: 1, x: 1, y: 1, peso: 5, ventana_desde: '09:00', prioridad: 2 }],
    vehiculos: [{ id: 'V1', capacidad: 100, velocidad: 'alta' }],
  });
  const { mundo, pedidos, vehiculos } = cargarDataset(dir);
  assert.equal(mundo.limite_peso, 50);
  assert.equal(pedidos.get(1).ventana_desde, '09:00');
  assert.equal(pedidos.get(1).prioridad, 2);
  assert.equal(vehiculos.get('V1').capacidad, 100);
  assert.equal(vehiculos.get('V1').velocidad, 'alta');
});

test('datos inválidos dan error claro', () => {
  const fuera = carpetaTemporal({ mundo: {}, pedidos: [{ id: 1, x: 25, y: 0, peso: 1 }], vehiculos: [] });
  assert.throws(() => cargarDataset(fuera), /fuera de la grilla/);
  const repetido = carpetaTemporal({ mundo: {}, pedidos: [], vehiculos: [{ id: 'V1' }, { id: 'V1' }] });
  assert.throws(() => cargarDataset(repetido), /repetido/);
  assert.throws(() => cargarDataset(path.join(RAIZ, 'no-existe')), /no existe/);
});

test('guardarPlan escribe y se relee, sin rutas vacías', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quickdrop-'));
  const archivo = path.join(dir, 'plan.json');
  const plan = new Plan([
    new Ruta('V1', [2, 1, 'DEPOSITO', 8]),
    new Ruta('V2', []),
    new Ruta('V3', ['4', 9]),
  ]);
  guardarPlan(archivo, plan);
  const crudo = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  assert.deepEqual(crudo, {
    rutas: [
      { vehiculo: 'V1', paradas: [2, 1, 'DEPOSITO', 8] },
      { vehiculo: 'V3', paradas: [4, 9] },
    ],
  });
  const releido = cargarPlan(archivo);
  assert.deepEqual(releido.rutas.map((r) => r.vehiculo), ['V1', 'V3']);
  assert.deepEqual(releido.rutas[0].paradas, [2, 1, 'DEPOSITO', 8]);
});
