'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { cargarDataset } = require('../src/datos');
const { DEPOSITO } = require('../src/modelo');
const { costoPlan, validarPlan } = require('../src/costo');
const {
  barrido, vecinoMasCercano, arbolExpansionMinimo, rutaPorArbol, dosOpt, resolver,
} = require('../src/estrategia');

const datos = cargarDataset(path.join(__dirname, '..', 'cierre1'));
const ids = [...datos.pedidos.keys()];
const ordenados = (lista) => [...lista].sort((a, b) => a - b);

test('el árbol tiene una arista por pedido y alcanza a todos', () => {
  const hijos = arbolExpansionMinimo(datos, ids);
  const aristas = [...hijos.values()].reduce((s, h) => s + h.length, 0);
  assert.equal(aristas, ids.length);
  assert.equal(hijos.size, ids.length + 1);
  assert.equal(rutaPorArbol(datos, ids).length, ids.length);
});

test('cada ruta incluye cada pedido una sola vez', () => {
  const rutas = [vecinoMasCercano(datos, ids), rutaPorArbol(datos, ids)];
  rutas.push(dosOpt(datos, rutas[0]), dosOpt(datos, rutas[1]));
  for (const ruta of rutas) {
    assert.deepEqual(ordenados(ruta), ordenados(ids));
    assert.ok(!ruta.includes(DEPOSITO));
  }
});

test('barrido reparte todos los pedidos', () => {
  for (let k = 1; k <= datos.vehiculos.size; k += 1) {
    for (const opciones of [{}, { costoPlan }]) {
      const grupos = barrido(datos, k, opciones);
      assert.equal(grupos.length, k);
      assert.deepEqual(ordenados(grupos.flat()), ordenados(ids));
    }
  }
});

test('barrido ordena por ángulo alrededor del depósito del mundo', () => {
  const movido = cargarDataset(path.join(__dirname, '..', 'cierre1'));
  movido.mundo.deposito = { x: 10, y: 10 };
  const grupos = barrido(movido, 3);
  assert.deepEqual(ordenados(grupos.flat()), ordenados(ids));
});

test('resolver produce un plan válido y sin pedidos fallidos', () => {
  const plan = resolver(datos, { costoPlan });
  assert.deepEqual(validarPlan(datos, plan), []);
  const entregados = plan.rutas.flatMap((r) => r.paradas);
  assert.deepEqual(ordenados(entregados), ordenados(ids));
  assert.ok(!entregados.includes(DEPOSITO));
});

test('todo es determinístico', () => {
  assert.deepEqual(resolver(datos, { costoPlan }), resolver(datos, { costoPlan }));
  assert.deepEqual(rutaPorArbol(datos, ids), rutaPorArbol(datos, ids));
  assert.deepEqual(barrido(datos, 3, { costoPlan }), barrido(datos, 3, { costoPlan }));
});
