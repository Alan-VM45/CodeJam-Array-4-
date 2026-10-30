'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { cargarDataset, cargarPlan } = require('../src/datos');
const { Costos, DEPOSITO, Mundo, Pedido, Vehiculo } = require('../src/modelo');
const { validarPlan, simularRuta, costoPlan, evaluarPlan } = require('../src/costo');

const RAIZ = path.join(__dirname, '..');
const EJEMPLO = path.join(RAIZ, '..', 'quickdrop-sim', 'datos', 'ejemplo');
const CIERRE1 = path.join(RAIZ, 'cierre1');
const planEjemplo = cargarPlan(path.join(EJEMPLO, 'plan_ejemplo.json'));
const datosEjemplo = cargarDataset(EJEMPLO);
const datosCierre1 = cargarDataset(CIERRE1);

function assertCostosCoinciden(datos, rutas) {
  const evaluacion = evaluarPlan(datos, rutas);
  assert.equal(evaluacion.valido, true, evaluacion.errores.join('\n'));
  assert.equal(costoPlan(datos, rutas), evaluacion.costo.total);
  return evaluacion;
}

test('el plan oficial del ejemplo cuesta 1124 con el Evento 1 (premium)', () => {
  const resultado = assertCostosCoinciden(datosEjemplo, planEjemplo.rutas);
  assert.deepEqual(resultado.costo, {
    distancia: 594,
    vehiculos: 180,
    tiempo: 239,
    fallas: 0,
    premium: 111,
    total: 1124,
  });
  assert.deepEqual(resultado.metricas, {
    entregados: 10,
    fallidos: 0,
    cuadras: 198,
    vehiculosUsados: 3,
    makespan: 239,
    premiumTotal: 2,
    minutosPremium: 111,
  });
  const minutos = planEjemplo.rutas
    .map((r) => simularRuta(datosEjemplo, r.vehiculo, r.paradas).minutosPremium)
    .reduce((a, b) => a + b, 0);
  assert.equal(minutos, 111);
});

test('el plan ingenuo de V1 sobre cierre1 cuesta 3584', () => {
  const rutas = [{
    vehiculo: 'V1',
    paradas: Array.from(datosCierre1.pedidos.keys()),
  }];
  const resultado = assertCostosCoinciden(datosCierre1, rutas);
  assert.equal(resultado.costo.total, 3584);
});

test('valida vehículo inexistente, rutas duplicadas, pedido inexistente y pedido repetido', () => {
  assert.deepEqual(validarPlan(datosCierre1, [
    { vehiculo: 'V1', paradas: [1, 1] },
    { vehiculo: 'V2', paradas: [1] },
    { vehiculo: 'V3', paradas: [999] },
    { vehiculo: 'VX', paradas: [] },
    { vehiculo: 'V1', paradas: [] },
  ]), [
    'El pedido 1 aparece más de una vez (vehículos V1 y V1).',
    'El pedido 1 aparece más de una vez (vehículos V1 y V2).',
    'Vehículo V3: el pedido 999 no existe.',
    "Ruta 4: el vehículo 'VX' no existe.",
    "El vehículo 'V1' aparece en más de una ruta.",
  ]);
});

test('los pedidos no asignados cuestan como fallas y una ruta vacía no usa el vehículo', () => {
  const rutas = [{ vehiculo: 'V1', paradas: [] }];
  const resultado = assertCostosCoinciden(datosCierre1, rutas);
  assert.deepEqual(resultado.costo, {
    distancia: 0,
    vehiculos: 0,
    tiempo: 0,
    fallas: 8000,
    premium: 0,
    total: 8000,
  });
  assert.deepEqual(resultado.metricas, {
    entregados: 0,
    fallidos: 40,
    cuadras: 0,
    vehiculosUsados: 0,
    makespan: 0,
    premiumTotal: 0,
    minutosPremium: 0,
  });
  assert.deepEqual(simularRuta(datosCierre1, 'V1', []), {
    cuadras: 0,
    fin: datosCierre1.mundo.horaSalida,
    entregados: 0,
    minutosPremium: 0,
    usado: false,
  });
});

test('un DEPOSITO intermedio suma el regreso y el tiempo de carga', () => {
  const rutas = [{ vehiculo: 'V1', paradas: [1, DEPOSITO, 2] }];
  const evaluacion = assertCostosCoinciden(datosCierre1, rutas);
  const simulacion = simularRuta(datosCierre1, 'V1', rutas[0].paradas);
  assert.equal(simulacion.entregados, 2);
  assert.equal(simulacion.usado, true);
  assert.equal(evaluacion.metricas.cuadras, simulacion.cuadras);
  assert.equal(evaluacion.metricas.makespan, simulacion.fin - datosCierre1.mundo.horaSalida);
});

function datosDeposito1010() {
  const mundo = new Mundo({
    deposito: { x: 10, y: 10 },
    tiempoServicio: 5,
    tiempoCarga: 7,
    minPorCuadra: 2,
    costos: new Costos(),
  });
  return {
    mundo,
    pedidos: new Map([
      [1, new Pedido({ id: 1, pos: { x: 8, y: 8 } })],
      [2, new Pedido({ id: 2, pos: { x: 12, y: 12 } })],
    ]),
    vehiculos: new Map([['V1', new Vehiculo({ id: 'V1' }, mundo)]]),
  };
}

test('simula distancias y tiempos con el depósito en (10,10)', () => {
  const datos = datosDeposito1010();
  const rutas = [{ vehiculo: 'V1', paradas: [1, DEPOSITO, 2] }];
  const resultado = assertCostosCoinciden(datos, rutas);
  assert.deepEqual(resultado.metricas, {
    entregados: 2,
    fallidos: 0,
    cuadras: 16,
    vehiculosUsados: 1,
    makespan: 49,
    premiumTotal: 0,
    minutosPremium: 0,
  });
  assert.deepEqual(resultado.costo, {
    distancia: 48,
    vehiculos: 60,
    tiempo: 49,
    fallas: 0,
    premium: 0,
    total: 157,
  });
});

test('Evento 1: un premium suma los minutos hasta el inicio de su entrega', () => {
  const datos = datosDeposito1010();
  datos.mundo.costos.porMinutoPremium = 2;
  datos.pedidos.get(2).premium = true;
  // Llega a 1 en 8 min, servicio 5, vuelve (8) y carga (7): sale a los 28 y llega a 2 a los 36.
  const rutas = [{ vehiculo: 'V1', paradas: [1, DEPOSITO, 2] }];
  const resultado = assertCostosCoinciden(datos, rutas);
  assert.equal(resultado.metricas.minutosPremium, 36);
  assert.equal(resultado.costo.premium, 72);
  assert.equal(resultado.costo.total, 157 + 72);
  assert.equal(simularRuta(datos, 'V1', rutas[0].paradas).minutosPremium, 36);
});

test('Evento 1: un premium no entregado falla pero no suma minutos', () => {
  const datos = datosDeposito1010();
  datos.pedidos.get(2).premium = true;
  const resultado = assertCostosCoinciden(datos, [{ vehiculo: 'V1', paradas: [1] }]);
  assert.equal(resultado.metricas.minutosPremium, 0);
  assert.equal(resultado.costo.premium, 0);
  assert.equal(resultado.metricas.fallidos, 1);
});

test('un plan inválido devuelve los errores del simulador sin calcular costo', () => {
  const rutas = [{ vehiculo: 'V1', paradas: [999] }];
  const resultado = evaluarPlan(datosCierre1, rutas);
  assert.deepEqual(resultado, {
    valido: false,
    errores: ['Vehículo V1: el pedido 999 no existe.'],
    costo: null,
    metricas: {},
  });
});
