/** I biglietti stampano spesso tutto maiuscolo: "ORBITAL PARTS" → "Orbital Parts". Le sigle corte (ESA, GMV) restano. */
export function unshout(value: string): string {
  if (!value || value !== value.toUpperCase() || !/[A-ZÀ-Ý]{4,}/.test(value)) return value;
  return value.replace(/[\p{L}\p{N}']+/gu, (w) => (w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase()));
}
