import { createWorker, OEM, PSM } from "tesseract.js";

export type ReceiptOcrPhase = "loading" | "layout" | "structured" | "recovery";

export type ReceiptOcrProgress = {
  phase: ReceiptOcrPhase;
  status: string;
  overallProgress: number;
};

export type ReceiptOcrBoundingBox = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type ReceiptOcrWord = {
  text: string;
  confidence: number;
  boundingBox: ReceiptOcrBoundingBox;
  blockIndex: number;
  paragraphIndex: number;
  lineIndex: number;
  wordIndex: number;
};

export type ReceiptOcrPassResult = {
  text: string;
  confidence: number;
  words: ReceiptOcrWord[];
};

export type ReceiptOcrResult = {
  layout: ReceiptOcrPassResult;
  structured: ReceiptOcrPassResult;
  recovery: ReceiptOcrPassResult;
  durationSeconds: number;
};

type TesseractWord = {
  text: string;
  confidence: number;
  bbox: ReceiptOcrBoundingBox;
};

type TesseractLine = {
  words: TesseractWord[];
};

type TesseractParagraph = {
  lines: TesseractLine[];
};

type TesseractBlock = {
  paragraphs: TesseractParagraph[];
};

function extractPositionedWords(
  blocks: TesseractBlock[] | null,
): ReceiptOcrWord[] {
  if (!blocks) {
    return [];
  }

  const positionedWords: ReceiptOcrWord[] = [];

  blocks.forEach((block, blockIndex) => {
    block.paragraphs.forEach((paragraph, paragraphIndex) => {
      paragraph.lines.forEach((line, lineIndex) => {
        line.words.forEach((word, wordIndex) => {
          const text = word.text.trim();

          if (!text) {
            return;
          }

          positionedWords.push({
            text,
            confidence: Math.round(word.confidence),
            boundingBox: {
              x0: word.bbox.x0,
              y0: word.bbox.y0,
              x1: word.bbox.x1,
              y1: word.bbox.y1,
            },
            blockIndex,
            paragraphIndex,
            lineIndex,
            wordIndex,
          });
        });
      });
    });
  });

  return positionedWords;
}

function calculateOverallProgress(
  phase: ReceiptOcrPhase,
  phaseProgress: number,
) {
  const safeProgress = Math.max(0, Math.min(1, phaseProgress));

  switch (phase) {
    case "loading":
      return Math.round(safeProgress * 15);

    case "layout":
      return 15 + Math.round(safeProgress * 30);

    case "structured":
      return 45 + Math.round(safeProgress * 30);

    case "recovery":
      return 75 + Math.round(safeProgress * 25);
  }
}

export async function runReceiptOcr(
  image: Blob,
  onProgress?: (progress: ReceiptOcrProgress) => void,
): Promise<ReceiptOcrResult> {
  const startedAt = performance.now();
  let activePhase: ReceiptOcrPhase = "loading";
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

  try {
    worker = await createWorker("eng", OEM.LSTM_ONLY, {
      logger: (message) => {
        onProgress?.({
          phase: activePhase,
          status: message.status,
          overallProgress: calculateOverallProgress(
            activePhase,
            message.progress,
          ),
        });
      },
    });

    activePhase = "layout";

    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
    });

    const layoutResult = await worker.recognize(
      image,
      { rotateAuto: true },
      { text: true, blocks: true },
    );

    activePhase = "structured";

    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: "1",
    });

    const structuredResult = await worker.recognize(
      image,
      { rotateAuto: true },
      { text: true, blocks: true },
    );

    activePhase = "recovery";

    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: "1",
    });

    const recoveryResult = await worker.recognize(
      image,
      { rotateAuto: true },
      { text: true, blocks: true },
    );

    return {
      layout: {
        text: layoutResult.data.text.trim(),
        confidence: Math.round(layoutResult.data.confidence),
        words: extractPositionedWords(layoutResult.data.blocks),
      },
      structured: {
        text: structuredResult.data.text.trim(),
        confidence: Math.round(structuredResult.data.confidence),
        words: extractPositionedWords(structuredResult.data.blocks),
      },
      recovery: {
        text: recoveryResult.data.text.trim(),
        confidence: Math.round(recoveryResult.data.confidence),
        words: extractPositionedWords(recoveryResult.data.blocks),
      },
      durationSeconds: Math.round((performance.now() - startedAt) / 100) / 10,
    };
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}
