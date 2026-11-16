/** Square-pixel letterboxing shared by live and finite codecs; callers admit even target dimensions. */
export function squarePixelLetterboxFilter(width: number, height: number): string {
  // Scale once inside the target box using display aspect ratio, which includes input SAR.
  // Rounding to even pixels keeps the encoder format valid without an oversized intermediate.
  return `scale=w='max(2,round(min(${width},${height}*dar)/2)*2)':h='max(2,round(min(${height},${width}/dar)/2)*2)',` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p`;
}
