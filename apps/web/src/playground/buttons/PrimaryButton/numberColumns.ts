export type NumberColumn = {
  from: string | null;
  to: string | null;
  changed: boolean;
};

export function numberColumns(from: number, to: number): NumberColumn[] {
  const fromText = String(from);
  const toText = String(to);
  const columnCount = Math.max(fromText.length, toText.length);
  const fromColumns = fromText.padStart(columnCount, " ");
  const toColumns = toText.padStart(columnCount, " ");

  return Array.from({ length: columnCount }, (_, index) => {
    const fromDigit = fromColumns[index] === " " ? null : fromColumns[index];
    const toDigit = toColumns[index] === " " ? null : toColumns[index];

    return {
      from: fromDigit,
      to: toDigit,
      changed: fromDigit !== toDigit,
    };
  });
}
