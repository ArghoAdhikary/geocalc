/* units.js — typed quantities and unit conversion (GeoCalc Pro domain core).
 *
 * Implements FR-ARC-002: the domain model uses typed quantities with unit
 * conversion at the boundaries, and a single canonical internal system (SI).
 * All conversions are exact factors to the SI base unit of each dimension.
 *
 * Dual-mode: usable as a browser global (window.Units) and as a CommonJS
 * module (require) so the headless test suite can exercise it.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Units = api;
})(this, function () {
  "use strict";

  // Each unit maps to: factor to the SI base, and the dimension it belongs to.
  // SI base units: length=m, angle=rad, unitWeight=N/m^3, stress=Pa,
  // permeability=m/s, time=s.
  const UNITS = {
    // length
    m:   { dim: "length", toSI: 1 },
    cm:  { dim: "length", toSI: 0.01 },
    mm:  { dim: "length", toSI: 0.001 },
    ft:  { dim: "length", toSI: 0.3048 },
    // angle
    rad: { dim: "angle", toSI: 1 },
    deg: { dim: "angle", toSI: Math.PI / 180 },
    // unit weight (force per volume)
    "kN/m3": { dim: "unitWeight", toSI: 1000 },      // 1 kN/m^3 = 1000 N/m^3
    "N/m3":  { dim: "unitWeight", toSI: 1 },
    pcf:     { dim: "unitWeight", toSI: 157.087464 }, // lbf/ft^3 -> N/m^3
    // stress / pressure
    Pa:  { dim: "stress", toSI: 1 },
    kPa: { dim: "stress", toSI: 1000 },
    MPa: { dim: "stress", toSI: 1e6 },
    psf: { dim: "stress", toSI: 47.880259 },
    psi: { dim: "stress", toSI: 6894.757 },
    // permeability (velocity)
    "m/s":   { dim: "permeability", toSI: 1 },
    "m/day": { dim: "permeability", toSI: 1 / 86400 },
    "cm/s":  { dim: "permeability", toSI: 0.01 },
    // time
    s:   { dim: "time", toSI: 1 },
    min: { dim: "time", toSI: 60 },
    hr:  { dim: "time", toSI: 3600 },
    day: { dim: "time", toSI: 86400 }
  };

  function unit(name) {
    const u = UNITS[name];
    if (!u) throw new Error("Unknown unit: " + name);
    return u;
  }

  // Convert a value from one unit to another within the same dimension.
  function convert(value, from, to) {
    const a = unit(from), b = unit(to);
    if (a.dim !== b.dim) throw new Error(`Incompatible units: ${from} (${a.dim}) -> ${to} (${b.dim})`);
    return (value * a.toSI) / b.toSI;
  }

  // Convert a value to the SI base unit of its dimension.
  function toSI(value, from) { return value * unit(from).toSI; }
  // Convert a value given in SI base to a target unit.
  function fromSI(value, to) { return value / unit(to).toSI; }

  function dimensionOf(name) { return unit(name).dim; }
  function unitsForDimension(dim) { return Object.keys(UNITS).filter(k => UNITS[k].dim === dim); }

  return { UNITS, convert, toSI, fromSI, dimensionOf, unitsForDimension };
});
