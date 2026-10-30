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

// ------------------------------------------------------------------ resolver

// Para cada k construye grupos por barrido y, en cada uno, elige entre vecino
// más cercano y árbol (ambos con 2-opt). El plan devuelto lleva en `detalle`
// el k elegido y el método que ganó en cada grupo.
function resolver(datos, { costoPlan }) {
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
    const plan = armarPlan(datos, rutas);
    const costo = costoPlan(datos, plan);
    if (costo < mejorCosto) {
      mejorCosto = costo;
      mejor = plan;
      mejor.detalle = { k: grupos.length, metodos, costo };
    }
  }
  return mejor;
}

module.exports = {
  barrido,
  vecinoMasCercano,
  arbolExpansionMinimo,
  rutaPorArbol,
  dosOpt,
  armarPlan,
  distanciaRuta,
  resolver,
};
