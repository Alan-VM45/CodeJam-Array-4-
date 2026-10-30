'use strict';

// Entidades del dominio QuickDrop. Las reglas nuevas se agregan como campos
// opcionales en los constructores (y en las tablas de src/datos.js).

const DEPOSITO = 'DEPOSITO';

// Único lugar donde se define cómo se mide la distancia (Manhattan, en cuadras).
function distancia(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// "HH:MM" -> minutos desde las 00:00. Un entero se devuelve tal cual.
function horaAMinutos(valor) {
  if (typeof valor === 'number' && Number.isInteger(valor)) return valor;
  if (typeof valor !== 'string') throw new Error(`hora inválida: ${JSON.stringify(valor)}`);
  const partes = valor.trim().split(':');
  if (partes.length !== 2 || !partes.every((p) => /^\d+$/.test(p.trim()))) {
    throw new Error(`hora inválida: ${JSON.stringify(valor)} (se espera HH:MM)`);
  }
  const h = Number(partes[0]);
  const m = Number(partes[1]);
  if (h >= 24 || m >= 60) throw new Error(`hora inválida: ${JSON.stringify(valor)}`);
  return h * 60 + m;
}

function minutosAHora(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

class Costos {
  constructor({ porCuadra = 3, porVehiculo = 60, porMinutoTotal = 1, porFalla = 200 } = {}) {
    this.porCuadra = porCuadra;
    this.porVehiculo = porVehiculo;
    this.porMinutoTotal = porMinutoTotal;
    this.porFalla = porFalla;
  }
}

class Mundo {
  constructor({
    ancho = 20,
    alto = 20,
    deposito = { x: 0, y: 0 },
    horaSalida = 8 * 60,
    tiempoServicio = 5,
    tiempoCarga = 10,
    minPorCuadra = 3,
    costos = new Costos(),
  } = {}) {
    this.ancho = ancho;
    this.alto = alto;
    this.deposito = { x: deposito.x, y: deposito.y };
    this.horaSalida = horaSalida;
    this.tiempoServicio = tiempoServicio;
    this.tiempoCarga = tiempoCarga;
    this.minPorCuadra = minPorCuadra;
    this.costos = costos;
  }

  distancia(a, b) {
    return distancia(a, b);
  }

  contiene(p) {
    return p.x >= 0 && p.x < this.ancho && p.y >= 0 && p.y < this.alto;
  }
}

class Pedido {
  constructor({ id, pos, peso = 0 }) {
    this.id = id;
    this.pos = { x: pos.x, y: pos.y };
    this.peso = peso;
  }
}

class Vehiculo {
  // minPorCuadra y costoFijo son propios de cada vehículo: se toman del mundo
  // salvo que el vehículo traiga los suyos.
  constructor({ id }, mundo = new Mundo(), { minPorCuadra, costoFijo } = {}) {
    this.id = id;
    this.minPorCuadra = minPorCuadra ?? mundo.minPorCuadra;
    this.costoFijo = costoFijo ?? mundo.costos.porVehiculo;
  }
}

class Ruta {
  constructor(vehiculo, paradas = []) {
    this.vehiculo = vehiculo;
    this.paradas = paradas; // ids de pedido (número) o DEPOSITO
  }
}

class Plan {
  constructor(rutas = []) {
    this.rutas = rutas;
  }
}

module.exports = {
  DEPOSITO,
  distancia,
  horaAMinutos,
  minutosAHora,
  Costos,
  Mundo,
  Pedido,
  Vehiculo,
  Ruta,
  Plan,
};
