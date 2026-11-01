// The little of fontkit that scripts/glyphs.ts uses; the package ships no types.
declare module 'fontkit' {
  type Command = { command: 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'bezierCurveTo' | 'closePath'; args: number[] };
  type Glyph = { id: number; advanceWidth: number; path: { commands: Command[] } };
  type Font = {
    unitsPerEm: number;
    characterSet: number[];
    glyphForCodePoint(codePoint: number): Glyph;
  };
  export function openSync(path: string): Font;
}
