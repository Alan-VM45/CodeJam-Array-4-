'use strict';

const path = require('node:path');
const { cargarDataset, guardarPlan } = require('./datos');
const { Plan, Ruta } = require('./modelo');
const { costoPlan, evaluarPlan } = require('./costo');
const {
  resolver, vecinoMasCercano, rutaPorArbol, dosOpt,
} = require('./estrategia');

function planDeUnVehiculo(datos, paradas) {
  const [primero] = datos.vehiculos.keys();
  return new Plan([new Ruta(primero, paradas)]);
}

function tablaComparar(datos, plan) {
  const ids = [...datos.pedidos.keys()].sort((a, b) => a - b);
  const vecino = vecinoMasCercano(datos, ids);
  const arbol = rutaPorArbol(datos, ids);
  const filas = [
    ['Ingenua (1 vehículo, orden de id)', planDeUnVehiculo(datos, ids)],
    ['1 vehículo, vecino más cercano', planDeUnVehiculo(datos, vecino)],
    ['1 vehículo, vecino + 2-opt', planDeUnVehiculo(datos, dosOpt(datos, vecino))],
    ['1 vehículo, árbol', planDeUnVehiculo(datos, arbol)],
    ['1 vehículo, árbol + 2-opt', planDeUnVehiculo(datos, dosOpt(datos, arbol))],
    [`Barrido (k=${plan.detalle.k}, mejor método por grupo)`, plan],
  ];
  const ancho = Math.max(...filas.map(([n]) => n.length));
  console.log('\nComparación:');
  for (const [nombre, p] of filas) {
    console.log(`  ${nombre.padEnd(ancho)}  ${costoPlan(datos, p).toFixed(2).padStart(10)}`);
  }
}

function main(argv) {
  const comparar = argv.includes('--comparar');
  const [carpeta, salida = 'plan.json'] = argv.filter((a) => a !== '--comparar');
  if (!carpeta) {
    console.error('Uso: node src/main.js <carpeta_dataset> [archivo_salida] [--comparar]');
    return 1;
  }

  const datos = cargarDataset(carpeta);
  const plan = resolver(datos, { costoPlan });
  const evaluacion = evaluarPlan(datos, plan);
  if (!evaluacion.valido) {
    console.error('Plan inválido:');
    for (const e of evaluacion.errores) console.error(`  - ${e}`);
    return 1;
  }

  guardarPlan(path.resolve(salida), plan);
  const { costo, metricas } = evaluacion;
  console.log(`Plan escrito en ${salida}`);
  console.log(`Costo total: ${costo.total}`);
  console.log(`  distancia: ${costo.distancia}  vehículos: ${costo.vehiculos}  tiempo: ${costo.tiempo}  fallas: ${costo.fallas}`);
  console.log(`Vehículos usados: ${metricas.vehiculosUsados}`);
  console.log(`Makespan: ${metricas.makespan} min`);
  if (comparar) tablaComparar(datos, plan);
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exitCode = 1;
}
