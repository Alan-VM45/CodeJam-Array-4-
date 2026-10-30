'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEPOSITO, distancia, horaAMinutos, minutosAHora, Mundo, Vehiculo } = require('../src/modelo');

test('horaAMinutos y minutosAHora', () => {
  assert.equal(horaAMinutos('08:00'), 480);
  assert.equal(horaAMinutos('00:00'), 0);
  assert.equal(horaAMinutos('23:59'), 1439);
  assert.equal(horaAMinutos(480), 480);
  assert.equal(minutosAHora(480), '08:00');
  assert.equal(minutosAHora(5), '00:05');
  assert.equal(minutosAHora(horaAMinutos('17:45')), '17:45');
});

test('horaAMinutos rechaza horas inválidas', () => {
  for (const mala of ['24:00', '10:60', 'abc', '8', '', null, true]) {
    assert.throws(() => horaAMinutos(mala), /hora inválida/);
  }
});

test('distancia Manhattan', () => {
  assert.equal(distancia({ x: 0, y: 0 }, { x: 3, y: 4 }), 7);
  assert.equal(distancia({ x: 5, y: 2 }, { x: 1, y: 9 }), 11);
  assert.equal(distancia({ x: 4, y: 4 }, { x: 4, y: 4 }), 0);
  assert.equal(new Mundo().distancia({ x: 0, y: 0 }, { x: 2, y: 1 }), 3);
});

test('constantes y valores por defecto del mundo', () => {
  assert.equal(DEPOSITO, 'DEPOSITO');
  const m = new Mundo();
  assert.deepEqual([m.ancho, m.alto, m.horaSalida, m.tiempoServicio, m.tiempoCarga, m.minPorCuadra], [20, 20, 480, 5, 10, 3]);
  assert.deepEqual(m.deposito, { x: 0, y: 0 });
  assert.deepEqual({ ...m.costos }, { porCuadra: 3, porVehiculo: 60, porMinutoTotal: 1, porFalla: 200 });
});

test('el vehículo toma lo del mundo salvo que traiga lo suyo', () => {
  const m = new Mundo({ minPorCuadra: 4 });
  const normal = new Vehiculo({ id: 'V1' }, m);
  assert.equal(normal.minPorCuadra, 4);
  assert.equal(normal.costoFijo, 60);
  const propio = new Vehiculo({ id: 'V2' }, m, { minPorCuadra: 2, costoFijo: 0 });
  assert.equal(propio.minPorCuadra, 2);
  assert.equal(propio.costoFijo, 0);
});
