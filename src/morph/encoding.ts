// How glyph-data.ts packs a character into a short string, one character per
// number: first the advance in cells, then each horizontal run of pixels as
// [row + ROW_BIAS, half-cell x + X_BIAS, number of pixels].
export const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
export const ROW_BIAS = 32;
export const X_BIAS = 4;
