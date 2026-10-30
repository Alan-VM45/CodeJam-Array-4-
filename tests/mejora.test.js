'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { cargarDataset } = require('../src/datos');
const { DEPOSITO } = require('../src/modelo');
const { costoPlan, validarPlan } = require('../src/costo');
const {
  barrido, vecinoMasCercano, dosOpt, armarPlan, mejoraLocal, resolver,
} = require('../src/estrategia');

const CIERRE1 = path.join(__dirname, '..', 'cierre1');
const ordenados = (lista) => [...lista].sort((a, b) => a - b);

// cierre1 con el depósito original y movido al centro y a la esquina opuesta.
const escenarios = [null, { x: 10, y: 10 }, { x: 19, y: 19 }].map((dep) => {
  const datos = cargarDataset(CIERRE1);
  if (dep) datos.mundo.deposito = dep;
  return { nombre: dep ? `depósito (${dep.x},${dep.y})` : 'cierre1', datos };
});

function assertTodosUnaVez(datos, plan) {
  assert.deepEqual(validarPlan(datos, plan), []);
  const paradas = plan.rutas.flatMap((r) => r.paradas);
  assert.ok(!paradas.includes(DEPOSITO));
  assert.deepEqual(ordenados(paradas), ordenados(datos.pedidos.keys()));
}

for (const { nombre, datos } of escenarios) {
  test(`${nombre}: la mejora entrega todos los pedidos exactamente una vez`, () => {
    assertTodosUnaVez(datos, resolver(datos, { costoPlan, romper: false }));
  });

  test(`${nombre}: el costo nunca sube respecto del plan sin mejora`, () => {
    const base = resolver(datos, { costoPlan, mejora: false });
    const mejorado = resolver(datos, { costoPlan, romper: false });
    assert.ok(costoPlan(datos, mejorado) <= costoPlan(datos, base));
  });

  test(`${nombre}: la mejora no empeora ningún k y es determinística`, () => {
    for (let k = 1; k <= datos.vehiculos.size; k += 1) {
      const rutas = barrido(datos, k, { costoPlan }).map((g) => dosOpt(datos, vecinoMasCercano(datos, g)));
      const base = armarPlan(datos, rutas);
      const mejorado = mejoraLocal(datos, base, { costoPlan });
      assertTodosUnaVez(datos, mejorado);
      assert.ok(costoPlan(datos, mejorado) <= costoPlan(datos, base));
      assert.deepEqual(mejoraLocal(datos, base, { costoPlan }), mejorado);
    }
  });
}

test('cierre1: la mejora local baja de 965', () => {
  const { datos } = escenarios[0];
  assert.ok(costoPlan(datos, resolver(datos, { costoPlan, romper: false })) < 965);
});

test('resolver es determinístico con mejora local', () => {
  const { datos } = escenarios[0];
  assert.deepEqual(resolver(datos, { costoPlan, romper: false }), resolver(datos, { costoPlan, romper: false }));
});
