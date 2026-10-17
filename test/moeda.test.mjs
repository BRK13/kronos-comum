import test from "node:test";
import assert from "node:assert/strict";
import { formatarBRL, reaisParaCentavos } from "../dist/moeda.js";

test("centavos x reais", () => {
  assert.equal(formatarBRL(1234, "centavos"), "R$ 12,34");
  assert.equal(formatarBRL(12.34, "reais"), "R$ 12,34");
  assert.equal(formatarBRL(123456789, "centavos"), "R$ 1.234.567,89");
  assert.equal(formatarBRL(NaN, "reais"), "R$ 0,00");
  assert.equal(formatarBRL(0, "centavos"), "R$ 0,00");
  assert.throws(() => formatarBRL(1, /** @type {any} */ ("real")), TypeError);
  assert.equal(reaisParaCentavos(19.9), 1990);
});
