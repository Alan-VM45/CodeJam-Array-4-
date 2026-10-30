'use strict';

const { DEPOSITO, distancia, Plan, Ruta } = require('./modelo');

// Los grupos son listas de ids de pedido; las rutas, listas de ids en orden de visita.
// Todo desempate es por id o por posición, así el resultado es determinístico.

function pedidosOrdenados(datos) {
  return [...datos.pedidos.values()].sort((a, b) => a.id - b.id);
}

function posDe(datos, id) {
  return id === DEPOSITO ? datos.mundo.deposito : datos.pedidos.get(id).pos;
}

function distanciaRuta(datos, ruta) {
  let total = 0;
  let previo = datos.mundo.deposito;
  for (const id of ruta) {
    const p = datos.pedidos.get(id).pos;
    total += distancia(previo, p);
    previo = p;
  }
  return total + distancia(previo, datos.mundo.deposito);
}

// ------------------------------------------------------------------- barrido

function ordenPorAngulo(datos) {
  const dep = datos.mundo.deposito;
  const angulo = (p) => Math.atan2(p.pos.y - dep.y, p.pos.x - dep.x);
  return pedidosOrdenados(datos).sort((a, b) => (
    angulo(a) - angulo(b)
    || distancia(dep, a.pos) - distancia(dep, b.pos)
    || a.id - b.id
  ));
}

// Corta una lista en k tramos consecutivos de tamaño casi igual.
function cortarPorCantidad(ids, k) {
  const grupos = [];
  for (let i = 0; i < k; i += 1) {
    grupos.push(ids.slice(Math.floor((i * ids.length) / k), Math.floor(((i + 1) * ids.length) / k)));
  }
  return grupos;
}

// Corta en k tramos con una suma de cuadras al depósito parecida en cada uno.
function cortarPorCuadras(datos, ids, k) {
  const dep = datos.mundo.deposito;
  const pesos = ids.map((id) => distancia(dep, datos.pedidos.get(id).pos));
  const total = pesos.reduce((a, b) => a + b, 0);
  const grupos = Array.from({ length: k }, () => []);
  let acumulado = 0;
  ids.forEach((id, i) => {
    const medio = acumulado + pesos[i] / 2;
    const g = total === 0 ? 0 : Math.min(k - 1, Math.floor((medio * k) / total));
    grupos[g].push(id);
    acumulado += pesos[i];
  });
  return grupos;
}

function vehiculosPorVelocidad(datos) {
  return [...datos.vehiculos.values()].sort((a, b) => a.minPorCuadra - b.minPorCuadra || (a.id < b.id ? -1 : 1));
}

// Un vehículo por grupo: los grupos con más pedidos se llevan los vehículos más rápidos.
function armarPlan(datos, rutasPorGrupo) {
  const vehiculos = vehiculosPorVelocidad(datos);
  const orden = rutasPorGrupo
    .map((paradas, i) => ({ paradas, i }))
    .sort((a, b) => b.paradas.length - a.paradas.length || a.i - b.i);
  return new Plan(orden.map(({ paradas }, j) => new Ruta(vehiculos[j].id, paradas)));
}

// Reparte todos los pedidos en k grupos consecutivos por ángulo. Si recibe
// costoPlan prueba el corte por cantidad y por cuadras y devuelve el más barato.
function barrido(datos, k, { costoPlan } = {}) {
  const ids = ordenPorAngulo(datos).map((p) => p.id);
  const candidatos = [cortarPorCantidad(ids, k), cortarPorCuadras(datos, ids, k)];
  if (!costoPlan) return candidatos[0];

  let mejor = null;
  let mejorCosto = Infinity;
  for (const grupos of candidatos) {
    const rutas = grupos.map((g) => dosOpt(datos, vecinoMasCercano(datos, g)));
    const costo = costoPlan(datos, armarPlan(datos, rutas));
    if (costo < mejorCosto) {
      mejor = grupos;
      mejorCosto = costo;
    }
  }
  return mejor;
}

// ------------------------------------------------------------ vecino cercano

function vecinoMasCercano(datos, grupo) {
  const faltan = [...grupo].sort((a, b) => a - b);
  const ruta = [];
  let pos = datos.mundo.deposito;
  while (faltan.length > 0) {
    let mejor = 0;
    let mejorD = Infinity;
    faltan.forEach((id, i) => {
      const d = distancia(pos, datos.pedidos.get(id).pos);
      if (d < mejorD) {
        mejor = i;
        mejorD = d;
      }
    });
    const [id] = faltan.splice(mejor, 1);
    ruta.push(id);
    pos = datos.pedidos.get(id).pos;
  }
  return ruta;
}

// ------------------------------------------------------------------- árbol

// Prim con el depósito como raíz. Devuelve Map nodo -> hijos (ids), ordenados
// por distancia al padre y luego por id. Tiene una arista por cada pedido.
function arbolExpansionMinimo(datos, grupo) {
  const hijos = new Map([[DEPOSITO, []]]);
  const pendientes = [...grupo].sort((a, b) => a - b);
  const enArbol = [DEPOSITO];
  for (const id of pendientes) hijos.set(id, []);

  while (pendientes.length > 0) {
    let mejorPadre = null;
    let mejorIdx = -1;
    let mejorD = Infinity;
    pendientes.forEach((id, i) => {
      const p = datos.pedidos.get(id).pos;
      for (const padre of enArbol) {
        const d = distancia(posDe(datos, padre), p);
        if (d < mejorD) {
          mejorPadre = padre;
          mejorIdx = i;
          mejorD = d;
        }
      }
    });
    const [hijo] = pendientes.splice(mejorIdx, 1);
    hijos.get(mejorPadre).push(hijo);
    enArbol.push(hijo);
  }

  for (const [padre, lista] of hijos) {
    const pp = posDe(datos, padre);
    lista.sort((a, b) => distancia(pp, datos.pedidos.get(a).pos) - distancia(pp, datos.pedidos.get(b).pos) || a - b);
  }
  return hijos;
}

// Preorden del árbol desde el depósito (iterativo, sin recursión).
function rutaPorArbol(datos, grupo) {
  const hijos = arbolExpansionMinimo(datos, grupo);
  const ruta = [];
  const pila = [...hijos.get(DEPOSITO)].reverse();
  while (pila.length > 0) {
    const id = pila.pop();
    ruta.push(id);
    pila.push(...[...hijos.get(id)].reverse());
  }
  return ruta;
}

// --------------------------------------------------------------------- 2-opt

function dosOpt(datos, ruta) {
  const r = [...ruta];
  const dep = datos.mundo.deposito;
  const pos = (i) => (i < 0 || i >= r.length ? dep : datos.pedidos.get(r[i]).pos);
  let mejoro = true;
  while (mejoro) {
    mejoro = false;
    for (let i = 0; i < r.length - 1; i += 1) {
      for (let j = i + 1; j < r.length; j += 1) {
        const antes = distancia(pos(i - 1), pos(i)) + distancia(pos(j), pos(j + 1));
        const despues = distancia(pos(i - 1), pos(j)) + distancia(pos(i), pos(j + 1));
        if (despues < antes) {
          r.splice(i, j - i + 1, ...r.slice(i, j + 1).reverse());
          mejoro = true;
        }
      }
    }
  }
  return r;
}

// ------------------------------------------------------------- mejora local

// Todas las decisiones se toman con costoPlan sobre el plan completo. El estado
// es una ruta por vehículo (en el orden del archivo), vacía si no se usa, así
// mover y orOpt pueden estrenar vehículos. Solo se acepta lo que baja el costo.
const EPS = 1e-9;

function mejoraLocal(datos, plan, { costoPlan }) {
  const porVehiculo = new Map(plan.rutas.map((r) => [r.vehiculo, [...r.paradas]]));
  const rutas = [...datos.vehiculos.keys()].map((id) => new Ruta(id, porVehiculo.get(id) ?? []));
  const costo = () => costoPlan(datos, rutas);
  let actual = costo();

  // Prueba insertar `tramo` en cada ruta y posición; deja aplicada la mejor si
  // baja de `limite` y devuelve su costo, si no devuelve null sin tocar nada.
  function insertarMejor(tramo, limite) {
    let mejor = null;
    rutas.forEach((ruta, r) => {
      for (let p = 0; p <= ruta.paradas.length; p += 1) {
        ruta.paradas.splice(p, 0, ...tramo);
        const c = costo();
        ruta.paradas.splice(p, tramo.length);
        if (c < (mejor ? mejor.c : limite - EPS)) mejor = { c, r, p };
      }
    });
    if (mejor) rutas[mejor.r].paradas.splice(mejor.p, 0, ...tramo);
    return mejor && mejor.c;
  }

  // Saca tramos de largo `largo` y los reinserta donde el plan quede más barato.
  function moverTramos(largo) {
    let mejoro = false;
    for (let r = 0; r < rutas.length; r += 1) {
      for (let i = 0; i + largo <= rutas[r].paradas.length; i += 1) {
        const tramo = rutas[r].paradas.splice(i, largo);
        const c = insertarMejor(tramo, actual);
        if (c === null) {
          rutas[r].paradas.splice(i, 0, ...tramo);
        } else {
          actual = c;
          mejoro = true;
        }
      }
    }
    return mejoro;
  }

  const mover = () => moverTramos(1);
  const orOpt = () => moverTramos(2) | moverTramos(3);

  function intercambiar() {
    let mejoro = false;
    for (let a = 0; a < rutas.length; a += 1) {
      for (let b = a + 1; b < rutas.length; b += 1) {
        const ra = rutas[a].paradas;
        const rb = rutas[b].paradas;
        for (let i = 0; i < ra.length; i += 1) {
          for (let j = 0; j < rb.length; j += 1) {
            [ra[i], rb[j]] = [rb[j], ra[i]];
            const c = costo();
            if (c < actual - EPS) {
              actual = c;
              mejoro = true;
            } else {
              [ra[i], rb[j]] = [rb[j], ra[i]];
            }
          }
        }
      }
    }
    return mejoro;
  }

  function dosOptPlan() {
    let mejoro = false;
    for (const { paradas } of rutas) {
      for (let i = 0; i < paradas.length - 1; i += 1) {
        for (let j = i + 1; j < paradas.length; j += 1) {
          const invertir = () => paradas.splice(i, j - i + 1, ...paradas.slice(i, j + 1).reverse());
          invertir();
          const c = costo();
          if (c < actual - EPS) {
            actual = c;
            mejoro = true;
          } else {
            invertir();
          }
        }
      }
    }
    return mejoro;
  }

  let mejoro = true;
  while (mejoro) {
    mejoro = false;
    for (const paso of [mover, intercambiar, orOpt, dosOptPlan]) {
      if (paso()) mejoro = true;
    }
  }
  return new Plan(rutas.filter((r) => r.paradas.length > 0));
}

// ------------------------------------------------------- romper y reconstruir

// Generador pseudoaleatorio con semilla (mulberry32): números en [0, 1).
function mulberry32(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const copiarRutas = (rutas) => rutas.map((r) => new Ruta(r.vehiculo, [...r.paradas]));

// Recocido simulado: en cada intento saca de 3 a 8 pedidos cercanos entre sí,
// los reinserta uno por uno donde costoPlan quede más bajo (cualquier vehículo,
// incluso sin usar) y aplica 2-opt a las rutas tocadas. Corta a los `ms`
// milisegundos o, si se pasa `intentos`, tras esa cantidad de intentos: solo
// así el resultado no depende de la velocidad de la máquina.
function romperYReconstruir(datos, plan, {
  costoPlan, ms = 4000, semilla = 1, intentos,
}) {
  const azar = mulberry32(semilla);
  const porVehiculo = new Map(plan.rutas.map((r) => [r.vehiculo, [...r.paradas]]));
  let rutas = [...datos.vehiculos.keys()].map((id) => new Ruta(id, porVehiculo.get(id) ?? []));
  const ids = [...datos.pedidos.keys()].sort((a, b) => a - b);
  if (ids.length === 0) return new Plan([]);

  // Vecinos de cada pedido por distancia (desempate por id), calculados una vez.
  const vecinos = new Map(ids.map((id) => {
    const p = datos.pedidos.get(id).pos;
    const orden = [...ids].sort((a, b) => (
      distancia(p, datos.pedidos.get(a).pos) - distancia(p, datos.pedidos.get(b).pos) || a - b
    ));
    return [id, orden];
  }));

  let actual = costoPlan(datos, rutas);
  let mejor = copiarRutas(rutas);
  let mejorCosto = actual;
  const tInicial = Math.max(1, actual * 0.02);
  const tFinal = Math.max(0.01, actual * 0.0002);
  const inicio = performance.now();
  const avance = (n) => (intentos !== undefined ? n / intentos : (performance.now() - inicio) / ms);

  for (let n = 0; ; n += 1) {
    const progreso = avance(n);
    if (progreso >= 1) break;
    const temperatura = tInicial * (tFinal / tInicial) ** progreso;

    const nuevas = copiarRutas(rutas);
    const cantidad = Math.min(ids.length, 3 + Math.floor(azar() * 6));
    const centro = ids[Math.floor(azar() * ids.length)];
    const sacados = vecinos.get(centro).slice(0, cantidad);
    const quitar = new Set(sacados);
    const tocadas = new Set();
    nuevas.forEach((r, i) => {
      const antes = r.paradas.length;
      r.paradas = r.paradas.filter((id) => !quitar.has(id));
      if (r.paradas.length !== antes) tocadas.add(i);
    });

    // Reinserción en orden aleatorio (Fisher-Yates con el generador propio).
    for (let i = sacados.length - 1; i > 0; i -= 1) {
      const j = Math.floor(azar() * (i + 1));
      [sacados[i], sacados[j]] = [sacados[j], sacados[i]];
    }
    for (const id of sacados) {
      let elegido = null;
      nuevas.forEach((r, i) => {
        for (let pos = 0; pos <= r.paradas.length; pos += 1) {
          r.paradas.splice(pos, 0, id);
          const c = costoPlan(datos, nuevas);
          r.paradas.splice(pos, 1);
          if (elegido === null || c < elegido.c - EPS) elegido = { c, i, pos };
        }
      });
      nuevas[elegido.i].paradas.splice(elegido.pos, 0, id);
      tocadas.add(elegido.i);
    }
    for (const i of tocadas) nuevas[i].paradas = dosOpt(datos, nuevas[i].paradas);

    const costo = costoPlan(datos, nuevas);
    const delta = costo - actual;
    if (delta < EPS || azar() < Math.exp(-delta / temperatura)) {
      rutas = nuevas;
      actual = costo;
      if (actual < mejorCosto - EPS) {
        mejor = copiarRutas(rutas);
        mejorCosto = actual;
      }
    }
  }
  return new Plan(mejor.filter((r) => r.paradas.length > 0));
}

// ------------------------------------------------------------------ resolver

// Para cada k construye grupos por barrido y, en cada uno, elige entre vecino
// más cercano y árbol (ambos con 2-opt). Salvo que mejora sea false, aplica la
// mejora local a cada k antes de compararlos. Salvo que romper sea false, al
// mejor de todos le aplica romper y reconstruir y otra vez la mejora local.
// El plan devuelto lleva en `detalle` el k inicial, los vehículos usados y el
// método de cada grupo.
function resolver(datos, {
  costoPlan, mejora = true, romper = true, ms, semilla, intentos,
}) {
  if (datos.pedidos.size === 0) return new Plan([]);
  const maxK = Math.min(datos.vehiculos.size, datos.pedidos.size);
  let mejor = null;
  let mejorCosto = Infinity;

  for (let k = 1; k <= maxK; k += 1) {
    const grupos = barrido(datos, k, { costoPlan }).filter((g) => g.length > 0);
    const rutas = [];
    const metodos = [];
    for (const grupo of grupos) {
      const vecino = dosOpt(datos, vecinoMasCercano(datos, grupo));
      const arbol = dosOpt(datos, rutaPorArbol(datos, grupo));
      const cV = costoPlan(datos, armarPlan(datos, [vecino]));
      const cA = costoPlan(datos, armarPlan(datos, [arbol]));
      const eligeArbol = cA < cV;
      rutas.push(eligeArbol ? arbol : vecino);
      metodos.push(eligeArbol ? 'arbol' : 'vecino');
    }
    const base = armarPlan(datos, rutas);
    const plan = mejora ? mejoraLocal(datos, base, { costoPlan }) : base;
    const costo = costoPlan(datos, plan);
    if (costo < mejorCosto - EPS) {
      mejorCosto = costo;
      mejor = plan;
      mejor.detalle = { k: grupos.length, vehiculos: plan.rutas.length, metodos, costo };
    }
  }
  if (!mejora || !romper) return mejor;

  const roto = romperYReconstruir(datos, mejor, {
    costoPlan, ms, semilla, intentos,
  });
  const final = mejoraLocal(datos, roto, { costoPlan });
  const costo = costoPlan(datos, final);
  if (costo >= mejorCosto - EPS) return mejor;
  final.detalle = { ...mejor.detalle, vehiculos: final.rutas.length, costo };
  return final;
}

module.exports = {
  barrido,
  vecinoMasCercano,
  arbolExpansionMinimo,
  rutaPorArbol,
  dosOpt,
  mejoraLocal,
  mulberry32,
  romperYReconstruir,
  armarPlan,
  distanciaRuta,
  resolver,
};
