// Helpers for serial numbers
const MAX = 5000;
const keyOf = s => String(s).toUpperCase().replace(/\s+/g, '');

// Free text (new lines, commas, semicolons) -> unique list. Empty is allowed.
function splitSerials(text) {
  return [...new Set(String(text || '').split(/[\n\r,;]+/).map(s => s.trim()).filter(Boolean))];
}

// "Add serial numbers" form -> list. mode 'range' = prefix + numbers + suffix
function parseSerials(b) {
  let list;
  if (b.mode === 'range') {
    const from = parseInt(b.from, 10), to = parseInt(b.to, 10);
    if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) throw new Error('Enter a valid From and To number (To must not be smaller than From)');
    if (to - from + 1 > MAX) throw new Error(`You can add at most ${MAX} serial numbers at once`);
    const pad = Math.max(0, Math.min(12, parseInt(b.pad, 10) || 0));
    const prefix = String(b.prefix || '').trim(), suffix = String(b.suffix || '').trim();
    list = [];
    for (let n = from; n <= to; n++) list.push(prefix + String(n).padStart(pad, '0') + suffix);
  } else list = splitSerials(b.text);
  if (!list.length) throw new Error('Enter at least one serial number');
  if (list.length > MAX) throw new Error(`You can add at most ${MAX} serial numbers at once`);
  if (list.some(s => s.length > 100)) throw new Error('A serial number is too long (max 100 characters)');
  return [...new Set(list)];
}

module.exports = { parseSerials, splitSerials, keyOf, MAX };
