export const parseNumber = (value) => {
  const num = Number(value ?? '');
  return Number.isFinite(num) ? num : undefined;
};

export const parseDateMs = (value) => {
  const ms = Date.parse(value ?? '');
  return Number.isFinite(ms) ? ms : undefined;
};
