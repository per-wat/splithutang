import type { ReceiptOcrWord } from "@/lib/receipts/run-receipt-ocr";

export type ReceiptVisualRow = {
  id: string;
  text: string;
  confidence: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
  centerY: number;
  words: ReceiptOcrWord[];
};

type RowGeometry = {
  words: ReceiptOcrWord[];
  top: number;
  bottom: number;
  left: number;
  right: number;
  centerY: number;
};

function getWordHeight(word: ReceiptOcrWord) {
  return word.boundingBox.y1 - word.boundingBox.y0;
}

function calculateMedian(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort((first, second) => first - second);

  const middleIndex = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 0) {
    return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
  }

  return sortedValues[middleIndex];
}

function calculateGeometry(words: ReceiptOcrWord[]): RowGeometry {
  const top = Math.min(...words.map((word) => word.boundingBox.y0));

  const bottom = Math.max(...words.map((word) => word.boundingBox.y1));

  const left = Math.min(...words.map((word) => word.boundingBox.x0));

  const right = Math.max(...words.map((word) => word.boundingBox.x1));

  const centerY =
    words.reduce((sum, word) => {
      return sum + (word.boundingBox.y0 + word.boundingBox.y1) / 2;
    }, 0) / words.length;

  return {
    words,
    top,
    bottom,
    left,
    right,
    centerY,
  };
}

function calculateRowConfidence(words: ReceiptOcrWord[]) {
  let weightedConfidence = 0;
  let totalCharacters = 0;

  for (const word of words) {
    const characterCount = Math.max(1, word.text.length);

    weightedConfidence += word.confidence * characterCount;
    totalCharacters += characterCount;
  }

  if (totalCharacters === 0) {
    return 0;
  }

  return Math.round(weightedConfidence / totalCharacters);
}

function buildRowText(words: ReceiptOcrWord[], medianWordHeight: number) {
  const sortedWords = [...words].sort(
    (first, second) => first.boundingBox.x0 - second.boundingBox.x0,
  );

  if (sortedWords.length === 0) {
    return "";
  }

  let text = sortedWords[0].text;

  for (let index = 1; index < sortedWords.length; index += 1) {
    const previousWord = sortedWords[index - 1];
    const currentWord = sortedWords[index];

    const horizontalGap =
      currentWord.boundingBox.x0 - previousWord.boundingBox.x1;

    const separator = horizontalGap > medianWordHeight * 2.5 ? "    " : " ";

    text += `${separator}${currentWord.text}`;
  }

  return text.trim();
}

function createOriginalTesseractLines(words: ReceiptOcrWord[]) {
  const lineGroups = new Map<string, ReceiptOcrWord[]>();

  for (const word of words) {
    const lineKey = [word.blockIndex, word.paragraphIndex, word.lineIndex].join(
      ":",
    );

    const existingWords = lineGroups.get(lineKey);

    if (existingWords) {
      existingWords.push(word);
    } else {
      lineGroups.set(lineKey, [word]);
    }
  }

  return Array.from(lineGroups.values())
    .map(calculateGeometry)
    .sort((first, second) => {
      const verticalDifference = first.centerY - second.centerY;

      if (Math.abs(verticalDifference) > 2) {
        return verticalDifference;
      }

      return first.left - second.left;
    });
}

function canMergeLineFragments(
  existingRow: RowGeometry,
  candidateLine: RowGeometry,
  medianLineHeight: number,
) {
  const overlap =
    Math.min(existingRow.bottom, candidateLine.bottom) -
    Math.max(existingRow.top, candidateLine.top);

  const existingHeight = existingRow.bottom - existingRow.top;

  const candidateHeight = candidateLine.bottom - candidateLine.top;

  const minimumHeight = Math.max(1, Math.min(existingHeight, candidateHeight));

  const verticalOverlapRatio = Math.max(0, overlap) / minimumHeight;

  const centerDistance = Math.abs(existingRow.centerY - candidateLine.centerY);

  /*
   * Different Tesseract blocks may contain separate fragments of the
   * same printed row, such as the description and right-hand price.
   * Only merge them when they are very closely aligned vertically.
   */
  const closelyAligned =
    centerDistance <= Math.max(2, medianLineHeight * 0.22) &&
    verticalOverlapRatio >= 0.72;

  /*
   * Avoid merging two fragments that occupy the same horizontal area.
   * Horizontal overlap usually means they are separate printed lines.
   */
  const horizontalOverlap =
    Math.min(existingRow.right, candidateLine.right) -
    Math.max(existingRow.left, candidateLine.left);

  const horizontallySeparate = horizontalOverlap <= medianLineHeight * 0.25;

  return closelyAligned && horizontallySeparate;
}

export function buildReceiptRows(
  inputWords: ReceiptOcrWord[],
): ReceiptVisualRow[] {
  const words = inputWords.filter((word) => {
    const { x0, y0, x1, y1 } = word.boundingBox;

    return (
      word.text.trim().length > 0 &&
      Number.isFinite(x0) &&
      Number.isFinite(y0) &&
      Number.isFinite(x1) &&
      Number.isFinite(y1) &&
      x1 > x0 &&
      y1 > y0
    );
  });

  if (words.length === 0) {
    return [];
  }

  const medianWordHeight = calculateMedian(words.map(getWordHeight));

  const originalLines = createOriginalTesseractLines(words);

  const medianLineHeight = calculateMedian(
    originalLines.map((line) => line.bottom - line.top),
  );

  const reconstructedRows: RowGeometry[] = [];

  for (const originalLine of originalLines) {
    const matchingRow = reconstructedRows.find((row) =>
      canMergeLineFragments(row, originalLine, medianLineHeight),
    );

    if (!matchingRow) {
      reconstructedRows.push(originalLine);
      continue;
    }

    const updatedGeometry = calculateGeometry([
      ...matchingRow.words,
      ...originalLine.words,
    ]);

    matchingRow.words = updatedGeometry.words;
    matchingRow.top = updatedGeometry.top;
    matchingRow.bottom = updatedGeometry.bottom;
    matchingRow.left = updatedGeometry.left;
    matchingRow.right = updatedGeometry.right;
    matchingRow.centerY = updatedGeometry.centerY;
  }

  return reconstructedRows
    .sort((first, second) => {
      const verticalDifference = first.centerY - second.centerY;

      if (Math.abs(verticalDifference) > 2) {
        return verticalDifference;
      }

      return first.left - second.left;
    })
    .map((row, index) => {
      const sortedWords = [...row.words].sort(
        (first, second) => first.boundingBox.x0 - second.boundingBox.x0,
      );

      return {
        id: `receipt-row-${index + 1}`,
        text: buildRowText(sortedWords, medianWordHeight),
        confidence: calculateRowConfidence(sortedWords),
        top: row.top,
        bottom: row.bottom,
        left: row.left,
        right: row.right,
        centerY: row.centerY,
        words: sortedWords,
      };
    });
}
