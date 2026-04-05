/** Simple group ID normalization for CSV-sourced identifiers. */
export const normalizeGroupId = (value) => (value ?? '').trim().toLowerCase();

/**
 * Full Telegram handle normalization: strips URLs, @-prefix, whitespace,
 * then lowercases. Used when input may be a raw t.me URL or @username.
 */
export const normalizeHandle = (v) =>
  (v ?? '')
    .toString()
    .trim()
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^@/, '')
    .replace(/\s+/g, '')
    .toLowerCase();

/** Like normalizeHandle but also drops any ":subpath" suffix. */
export const stripHandle = (v) => normalizeHandle(v).split(':')[0];

/** Returns a clean display label from a group object. */
export const cleanLabel = (g) => {
  const base = g?.label ?? g?.username ?? g?.id ?? '';
  return base.toString().trim().replace(/^@/, '');
};
