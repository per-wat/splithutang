export type ProcessedReceiptImage = {
  blob: Blob;
  width: number;
  height: number;
};

const MAX_IMAGE_WIDTH = 1800;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    const sourceUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(sourceUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      reject(new Error("The selected image could not be loaded."));
    };

    image.src = sourceUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("The receipt image could not be processed."));
      },
      "image/jpeg",
      0.92,
    );
  });
}

function findPercentile(
  histogram: Uint32Array,
  totalPixels: number,
  percentile: number,
) {
  const target = totalPixels * percentile;
  let runningTotal = 0;

  for (let value = 0; value < histogram.length; value += 1) {
    runningTotal += histogram[value];

    if (runningTotal >= target) {
      return value;
    }
  }

  return 255;
}

export async function preprocessReceiptImage(
  file: File,
): Promise<ProcessedReceiptImage> {
  const image = await loadImage(file);

  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error("The selected image has invalid dimensions.");
  }

  const scale = Math.min(1, MAX_IMAGE_WIDTH / image.naturalWidth);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!context) {
    throw new Error("Your browser could not process this image.");
  }

  context.drawImage(image, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const histogram = new Uint32Array(256);

  // First pass: convert every pixel to grayscale and build a histogram.
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];

    const grayscale = Math.round(red * 0.299 + green * 0.587 + blue * 0.114);

    pixels[index] = grayscale;
    pixels[index + 1] = grayscale;
    pixels[index + 2] = grayscale;

    histogram[grayscale] += 1;
  }

  // Ignore the darkest and brightest 1% when enhancing contrast.
  const totalPixels = width * height;
  const darkPoint = findPercentile(histogram, totalPixels, 0.01);
  const lightPoint = findPercentile(histogram, totalPixels, 0.99);
  const contrastRange = Math.max(1, lightPoint - darkPoint);

  // Second pass: stretch the useful brightness range.
  for (let index = 0; index < pixels.length; index += 4) {
    const grayscale = pixels[index];
    const enhanced = Math.max(
      0,
      Math.min(
        255,
        Math.round(((grayscale - darkPoint) * 255) / contrastRange),
      ),
    );

    pixels[index] = enhanced;
    pixels[index + 1] = enhanced;
    pixels[index + 2] = enhanced;
    pixels[index + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);

  return {
    blob: await canvasToBlob(canvas),
    width,
    height,
  };
}
