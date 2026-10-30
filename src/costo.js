'use strict';

const { DEPOSITO, distancia } = require('./modelo');

function listaRutas(rutas) {
  return Array.isArray(rutas) ? rutas : rutas.rutas;
}

// Evento 1: peso de la demora de los premium (1 si el mundo no lo trae).
function porMinutoPremium(mundo) {
  return mundo.costos.porMinutoPremium ?? 1;
}

function obtenerVehiculo(datos, vehiculo) {
  return typeof vehiculo === 'string' ? datos.vehiculos.get(vehiculo) : vehiculo;
}

function validarPlan(datos, rutas) {
  const errores = [];
  const vehiculosVistos = new Set();
  const pedidosVistos = new Map();

  listaRutas(rutas).forEach((ruta, i) => {
    const vehiculo = datos.vehiculos.get(ruta.vehiculo);
    if (vehiculo === undefined) {
      errores.push(`Ruta ${i + 1}: el vehículo '${ruta.vehiculo}' no existe.`);
      return;
    }
    if (vehiculosVistos.has(ruta.vehiculo)) {
      errores.push(`El vehículo '${ruta.vehiculo}' aparece en más de una ruta.`);
      return;
    }
    vehiculosVistos.add(ruta.vehiculo);

    for (const parada of ruta.paradas) {
      if (parada === DEPOSITO) continue;

      if (!datos.pedidos.has(parada)) {
        errores.push(`Vehículo ${vehiculo.id}: el pedido ${parada} no existe.`);
        continue;
      }
      if (pedidosVistos.has(parada)) {
        errores.push(
          `El pedido ${parada} aparece más de una vez `
          + `(vehículos ${pedidosVistos.get(parada)} y ${vehiculo.id}).`,
        );
        continue;
      }
      pedidosVistos.set(parada, vehiculo.id);
    }
  });

  return errores;
}

function simularRuta(datos, vehiculo, paradas) {
  const v = obtenerVehiculo(datos, vehiculo);
  const { mundo } = datos;
  const deposito = mundo.deposito;
  let t = mundo.horaSalida;
  let posicion = deposito;
  let cuadras = 0;
  let entregados = 0;
  let minutosPremium = 0;
  let usado = false;

  for (const parada of paradas) {
    if (parada === DEPOSITO) {
      const d = distancia(posicion, deposito);
      cuadras += d;
      t += d * v.minPorCuadra + mundo.tiempoCarga;
      posicion = deposito;
      continue;
    }

    const pedido = datos.pedidos.get(parada);
    const d = distancia(posicion, pedido.pos);
    cuadras += d;
    t += d * v.minPorCuadra;
    // La entrega empieza al llegar: ahí se cuenta la demora del premium.
    if (pedido.premium) minutosPremium += t - mundo.horaSalida;
    t += mundo.tiempoServicio;
    posicion = pedido.pos;
    entregados += 1;
    usado = true;
  }

  // REGLAS DE EVENTOS: aquí se agregarían capacidad, ventanas horarias y esperas.
  const regreso = distancia(posicion, deposito);
  cuadras += regreso;
  if (usado) t += regreso * v.minPorCuadra;

  return {
    cuadras, fin: usado ? t : mundo.horaSalida, entregados, minutosPremium, usado,
  };
}

function costoPlan(datos, rutas) {
  const lista = listaRutas(rutas);
  const { mundo } = datos;
  const deposito = mundo.deposito;
  const salida = mundo.horaSalida;
  let cuadras = 0;
  let entregados = 0;
  let minutosPremium = 0;
  let costoVehiculos = 0;
  let finUltimo = salida;

  for (const ruta of lista) {
    const vehiculo = datos.vehiculos.get(ruta.vehiculo);
    let tienePedidos = false;
    for (const parada of ruta.paradas) {
      if (parada !== DEPOSITO) {
        tienePedidos = true;
        break;
      }
    }
    if (!tienePedidos) continue;

    let t = salida;
    let posicion = deposito;
    for (const parada of ruta.paradas) {
      if (parada === DEPOSITO) {
        const d = distancia(posicion, deposito);
        cuadras += d;
        t += d * vehiculo.minPorCuadra + mundo.tiempoCarga;
        posicion = deposito;
      } else {
        const pedido = datos.pedidos.get(parada);
        const d = distancia(posicion, pedido.pos);
        cuadras += d;
        t += d * vehiculo.minPorCuadra;
        if (pedido.premium) minutosPremium += t - salida;
        t += mundo.tiempoServicio;
        posicion = pedido.pos;
        entregados += 1;
      }
    }

    const regreso = distancia(posicion, deposito);
    cuadras += regreso;
    t += regreso * vehiculo.minPorCuadra;
    finUltimo = Math.max(finUltimo, t);
    costoVehiculos += vehiculo.costoFijo;
  }

  const fallidos = datos.pedidos.size - entregados;
  return cuadras * mundo.costos.porCuadra
    + costoVehiculos
    + (finUltimo - salida) * mundo.costos.porMinutoTotal
    + fallidos * mundo.costos.porFalla
    + minutosPremium * porMinutoPremium(mundo);
}

function evaluarPlan(datos, rutas) {
  const errores = validarPlan(datos, rutas);
  if (errores.length > 0) {
    return { valido: false, errores, costo: null, metricas: {} };
  }

  const lista = listaRutas(rutas);
  const { mundo } = datos;
  const deposito = mundo.deposito;
  const salida = mundo.horaSalida;
  let cuadras = 0;
  let entregados = 0;
  let minutosPremium = 0;
  let vehiculosUsados = 0;
  let costoVehiculos = 0;
  let finUltimo = salida;

  for (const ruta of lista) {
    const vehiculo = datos.vehiculos.get(ruta.vehiculo);
    let tienePedidos = false;
    for (const parada of ruta.paradas) {
      if (parada !== DEPOSITO) {
        tienePedidos = true;
        break;
      }
    }
    if (!tienePedidos) continue;

    vehiculosUsados += 1;
    costoVehiculos += vehiculo.costoFijo;
    let t = salida;
    let posicion = deposito;
    for (const parada of ruta.paradas) {
      if (parada === DEPOSITO) {
        const d = distancia(posicion, deposito);
        cuadras += d;
        t += d * vehiculo.minPorCuadra + mundo.tiempoCarga;
        posicion = deposito;
      } else {
        const pedido = datos.pedidos.get(parada);
        const d = distancia(posicion, pedido.pos);
        cuadras += d;
        t += d * vehiculo.minPorCuadra;
        if (pedido.premium) minutosPremium += t - salida;
        t += mundo.tiempoServicio;
        posicion = pedido.pos;
        entregados += 1;
      }
    }

    const regreso = distancia(posicion, deposito);
    cuadras += regreso;
    t += regreso * vehiculo.minPorCuadra;
    finUltimo = Math.max(finUltimo, t);
  }

  const fallidos = datos.pedidos.size - entregados;
  const makespan = finUltimo - salida;
  const costo = {
    distancia: cuadras * mundo.costos.porCuadra,
    vehiculos: costoVehiculos,
    tiempo: makespan * mundo.costos.porMinutoTotal,
    fallas: fallidos * mundo.costos.porFalla,
    premium: minutosPremium * porMinutoPremium(mundo),
  };
  costo.total = costo.distancia + costo.vehiculos + costo.tiempo + costo.fallas + costo.premium;
  let premiumTotal = 0;
  for (const pedido of datos.pedidos.values()) if (pedido.premium) premiumTotal += 1;

  return {
    valido: true,
    errores,
    costo,
    metricas: {
      entregados, fallidos, cuadras, vehiculosUsados, makespan, premiumTotal, minutosPremium,
    },
  };
}

module.exports = { validarPlan, simularRuta, costoPlan, evaluarPlan };
