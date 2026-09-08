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

export type RunReceiptOcrOptions = {
  signal?: AbortSignal;
};

export const RECEIPT_OCR_ASSET_PATHS = {
  workerPath: "/tesseract/7.0.0/worker.min.js",
  corePath: "/tesseract/7.0.0/core",
  langPath: "/tesseract/7.0.0/lang",
} as const;

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

function createAbortError() {
  return new DOMException("Receipt scan cancelled.", "AbortError");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

async function runAbortable<T>(operation: Promise<T>, signal?: AbortSignal) {
  if (!signal) {
    return operation;
  }

  throwIfAborted(signal);

  let abortHandler: (() => void) | null = null;
  const aborted = new Promise<never>((_, reject) => {
    abortHandler = () => reject(createAbortError());
    signal.addEventListener("abort", abortHandler, { once: true });
  });

  try {
    return await Promise.race([operation, aborted]);
  } finally {
    if (abortHandler) {
      signal.removeEventListener("abort", abortHandler);
    }
  }
}

export async function runReceiptOcr(
  image: Blob,
  onProgress?: (progress: ReceiptOcrProgress) => void,
  options: RunReceiptOcrOptions = {},
): Promise<ReceiptOcrResult> {
  const startedAt = performance.now();
  const { signal } = options;
  let activePhase: ReceiptOcrPhase = "loading";
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

  async function terminateActiveWorker() {
    const activeWorker = worker;
    worker = null;

    if (activeWorker) {
      await activeWorker.terminate();
    }
  }

  const handleAbort = () => {
    void terminateActiveWorker().catch(() => {
      // Cancellation is best-effort; the normal finally path also terminates.
    });
  };

  signal?.addEventListener("abort", handleAbort, { once: true });

  try {
    throwIfAborted(signal);

    worker = await createWorker("eng", OEM.LSTM_ONLY, {
      ...RECEIPT_OCR_ASSET_PATHS,
      workerBlobURL: false,
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

    throwIfAborted(signal);

    activePhase = "layout";

    await runAbortable(
      worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: "1",
      }),
      signal,
    );

    const layoutResult = await runAbortable(
      worker.recognize(
        image,
        { rotateAuto: true },
        { text: true, blocks: true },
      ),
      signal,
    );

    activePhase = "structured";

    await runAbortable(
      worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1",
      }),
      signal,
    );

    const structuredResult = await runAbortable(
      worker.recognize(
        image,
        { rotateAuto: true },
        { text: true, blocks: true },
      ),
      signal,
    );

    activePhase = "recovery";

    await runAbortable(
      worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        preserve_interword_spaces: "1",
      }),
      signal,
    );

    const recoveryResult = await runAbortable(
      worker.recognize(
        image,
        { rotateAuto: true },
        { text: true, blocks: true },
      ),
      signal,
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
  } catch (error) {
    if (signal?.aborted) {
      throw createAbortError();
    }

    throw error;
  } finally {
    signal?.removeEventListener("abort", handleAbort);
    await terminateActiveWorker();
  }
}
