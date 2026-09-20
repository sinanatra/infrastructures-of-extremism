export const normalizeGroupId = (value) => (value ?? '').trim().toLowerCase();

export const normalizeHandle = (v) =>
  (v ?? '')
    .toString()
    .trim()
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^@/, '')
    .replace(/\s+/g, '')
    .toLowerCase();

export const stripHandle = (v) => normalizeHandle(v).split(':')[0];

export const cleanLabel = (g) => {
  const base = g?.label ?? g?.username ?? g?.id ?? '';
  return base.toString().trim().replace(/^@/, '');
};
