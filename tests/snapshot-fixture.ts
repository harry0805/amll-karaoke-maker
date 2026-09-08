// Original timed lyrics for repeatable long-song performance and paint checks.
export async function benchmarkLyrics() {
  if (process.env.TTML_PATH) return Bun.file(process.env.TTML_PATH).text();
  const words = ['Golden', 'words', 'drift', 'softly', 'through', 'the', 'evening', 'sky'];
  const lines = Array.from({ length: 90 }, (_, i) => {
    const start = i * 4,
      end = start + 3;
    const spans = words
      .map(
        (word, j) =>
          `<span begin="${start + j * 0.25}s" end="${j === words.length - 1 ? end : start + (j + 1) * 0.25}s">${word}${j < words.length - 1 ? ' ' : ''}</span>`,
      )
      .join('');
    const bg =
      i % 7 === 0
        ? `<span ttm:role="x-bg" begin="${start + 1}s" end="${end + 1}s"><span begin="${start + 1}s" end="${end + 1}s">Echoes by the waves</span></span>`
        : '';
    return `<p ttm:agent="${i % 3 === 0 ? 'v2' : 'v1'}" begin="${start}s" end="${end}s">${spans}${bg}</p>`;
  }).join('');
  return `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><head><metadata><ttm:agent xml:id="v1" type="person"/><ttm:agent xml:id="v2" type="person"/></metadata></head><body><div>${lines}</div></body></tt>`;
}
