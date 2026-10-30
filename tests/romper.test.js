'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { cargarDataset } = require('../src/datos');
const { DEPOSITO } = require('../src/modelo');
const { costoPlan, validarPlan } = require('../src/costo');
const { mulberry32, romperYReconstruir, resolver } = require('../src/estrategia');

const CIERRE1 = path.join(__dirname, '..', 'cierre1');
const ordenados = (lista) => [...lista].sort((a, b) => a - b);
// Con `intentos` el corte no depende del reloj, así los tests son reproducibles.
const INTENTOS = 150;

const escenarios = [null, { x: 10, y: 10 }, { x: 19, y: 19 }].map((dep) => {
  const datos = cargarDataset(CIERRE1);
  if (dep) datos.mundo.deposito = dep;
  const local = resolver(datos, { costoPlan, romper: false });
  return { nombre: dep ? `depósito (${dep.x},${dep.y})` : 'cierre1', datos, local };
});

function assertTodosUnaVez(datos, plan) {
  assert.deepEqual(validarPlan(datos, plan), []);
  const paradas = plan.rutas.flatMap((r) => r.paradas);
  assert.ok(!paradas.includes(DEPOSITO));
  assert.deepEqual(ordenados(paradas), ordenados(datos.pedidos.keys()));
}

test('mulberry32 repite la secuencia con la misma semilla y da números en [0, 1)', () => {
  const a = mulberry32(7);
  const b = mulberry32(7);
  for (let i = 0; i < 100; i += 1) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

for (const { nombre, datos, local } of escenarios) {
  test(`${nombre}: romper y reconstruir entrega todos los pedidos exactamente una vez`, () => {
    assertTodosUnaVez(datos, romperYReconstruir(datos, local, { costoPlan, intentos: INTENTOS }));
    assertTodosUnaVez(datos, resolver(datos, { costoPlan, intentos: INTENTOS }));
  });

  test(`${nombre}: el costo nunca sube respecto de la mejora local`, () => {
    for (let semilla = 1; semilla <= 3; semilla += 1) {
      const roto = romperYReconstruir(datos, local, { costoPlan, semilla, intentos: INTENTOS });
      assert.ok(costoPlan(datos, roto) <= costoPlan(datos, local));
      const final = resolver(datos, { costoPlan, semilla, intentos: INTENTOS });
      assert.ok(costoPlan(datos, final) <= costoPlan(datos, local));
    }
  });
}

test('con la misma semilla da el mismo plan', () => {
  const { datos, local } = escenarios[0];
  for (const semilla of [1, 2]) {
    const opciones = { costoPlan, semilla, intentos: INTENTOS };
    assert.deepEqual(romperYReconstruir(datos, local, opciones), romperYReconstruir(datos, local, opciones));
    assert.deepEqual(resolver(datos, opciones), resolver(datos, opciones));
  }
});

test('el corte por tiempo termina solo y respeta ms', () => {
  const { datos, local } = escenarios[0];
  const inicio = performance.now();
  const plan = romperYReconstruir(datos, local, { costoPlan, ms: 200 });
  assert.ok(performance.now() - inicio < 1000);
  assertTodosUnaVez(datos, plan);
});

test('cierre1: llega a 922 o menos', () => {
  const { datos } = escenarios[0];
  assert.ok(costoPlan(datos, resolver(datos, { costoPlan, intentos: 2000 })) <= 922);
});
