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

function tablaComparar(datos, plan, ms) {
  const ids = [...datos.pedidos.keys()].sort((a, b) => a - b);
  const vecino = vecinoMasCercano(datos, ids);
  const arbol = rutaPorArbol(datos, ids);
  const base = resolver(datos, { costoPlan, mejora: false });
  const t0 = performance.now();
  const local = resolver(datos, { costoPlan, romper: false });
  const msLocal = performance.now() - t0;
  const filas = [
    ['Ingenua (1 vehículo, orden de id)', planDeUnVehiculo(datos, ids)],
    ['1 vehículo, vecino más cercano', planDeUnVehiculo(datos, vecino)],
    ['1 vehículo, vecino + 2-opt', planDeUnVehiculo(datos, dosOpt(datos, vecino))],
    ['1 vehículo, árbol', planDeUnVehiculo(datos, arbol)],
    ['1 vehículo, árbol + 2-opt', planDeUnVehiculo(datos, dosOpt(datos, arbol))],
    [`Barrido (k=${base.detalle.k}, mejor método por grupo)`, base],
    [`Barrido + mejora local (k=${local.detalle.vehiculos}, ${msLocal.toFixed(0)} ms)`, local],
    [`Romper y reconstruir (k=${plan.detalle.vehiculos}, ${ms.toFixed(0)} ms)`, plan],
  ];
  const ancho = Math.max(...filas.map(([n]) => n.length));
  console.log('\nComparación:');
  for (const [nombre, p] of filas) {
    console.log(`  ${nombre.padEnd(ancho)}  ${costoPlan(datos, p).toFixed(2).padStart(10)}`);
  }
}

const USO = 'Uso: node src/main.js <carpeta_dataset> [archivo_salida] [--comparar] [--ms <milisegundos>] [--semilla <n>]';

// Separa las opciones (--comparar, --ms N, --semilla N) de los argumentos posicionales.
function leerArgumentos(argv) {
  const opciones = { comparar: false };
  const posicionales = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--comparar') {
      opciones.comparar = true;
    } else if (a === '--ms' || a === '--semilla') {
      const valor = Number(argv[i + 1]);
      if (!Number.isInteger(valor) || valor < 0) throw new Error(`${a} necesita un entero no negativo`);
      opciones[a.slice(2)] = valor;
      i += 1;
    } else if (a.startsWith('--')) {
      throw new Error(`opción desconocida: ${a}
${USO}`);
    } else {
      posicionales.push(a);
    }
  }
  [opciones.carpeta, opciones.salida = 'plan.json'] = posicionales;
  return opciones;
}

function main(argv) {
  const {
    comparar, carpeta, salida, ms: limite, semilla,
  } = leerArgumentos(argv);
  if (!carpeta) {
    console.error(USO);
    return 1;
  }

  const datos = cargarDataset(carpeta);
  const inicio = performance.now();
  const plan = resolver(datos, { costoPlan, ms: limite, semilla });
  const ms = performance.now() - inicio;
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
  if (comparar) tablaComparar(datos, plan, ms);
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exitCode = 1;
}
