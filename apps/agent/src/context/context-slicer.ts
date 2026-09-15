/**
 * Context Slicer for LLM Prompt Construction.
 *
 * Slices targeted Concrete Syntax Tree (CST) nodes from source markup and extracts
 * an annotated context window with line numbers and directional pointers ('>').
 */

export interface SlicedContext {
  targetSnippet: string;
  startLine: number;
  endLine: number;
  annotatedContext: string;
  lineWindow: {
    start: number;
    end: number;
  };
}

/**
 * Extracts a line-aware context slice surrounding character offsets [startOffset, endOffset].
 *
 * @param sourceCode - Full source markup string
 * @param startOffset - Character start index of target element
 * @param endOffset - Character end index of target element
 * @param paddingLines - Number of context lines to display above and below (default: 10)
 * @returns SlicedContext containing target snippet, line coordinates, and annotated context
 */
export function sliceCstContext(
  sourceCode: string,
  startOffset: number,
  endOffset: number,
  paddingLines = 10
): SlicedContext {
  if (typeof sourceCode !== 'string') {
    throw new TypeError('sourceCode must be a string');
  }

  // Safe clamping of offsets
  const safeStart = Math.max(0, Math.min(startOffset, sourceCode.length));
  const safeEnd = Math.max(safeStart, Math.min(endOffset, sourceCode.length));

  const targetSnippet = sourceCode.slice(safeStart, safeEnd);

  // Split into lines preserving content
  const lines = sourceCode.split(/\r?\n/);
  const totalLines = Math.max(1, lines.length);

  // Precompute line start offsets for fast offset-to-line lookup
  const lineStarts: number[] = [0];
  for (let i = 0; i < sourceCode.length; i++) {
    if (sourceCode[i] === '\n') {
      lineStarts.push(i + 1);
    }
  }

  const getLineNumber = (offset: number): number => {
    let low = 0;
    let high = lineStarts.length - 1;
    let result = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (lineStarts[mid] <= offset) {
        result = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return result + 1; // 1-indexed
  };

  const startLine = getLineNumber(safeStart);
  const endLine = safeEnd > safeStart
    ? getLineNumber(safeEnd - 1)
    : startLine;

  const windowStartLine = Math.max(1, startLine - paddingLines);
  const windowEndLine = Math.min(totalLines, endLine + paddingLines);

  // Calculate width for padded line numbers
  const maxLineDigits = Math.max(2, String(windowEndLine).length);

  const contextLines: string[] = [];
  for (let lineNum = windowStartLine; lineNum <= windowEndLine; lineNum++) {
    const isTarget = lineNum >= startLine && lineNum <= endLine;
    const pointer = isTarget ? '> ' : '  ';
    const paddedNum = String(lineNum).padStart(maxLineDigits, ' ');
    const lineText = lines[lineNum - 1] ?? '';

    contextLines.push(`${pointer}${paddedNum} | ${lineText}`);
  }

  const annotatedContext = contextLines.join('\n');

  return {
    targetSnippet,
    startLine,
    endLine,
    annotatedContext,
    lineWindow: {
      start: windowStartLine,
      end: windowEndLine,
    },
  };
}
