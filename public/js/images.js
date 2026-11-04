const TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 40_000_000;
const MAX_PROCESSED_BYTES = 512 * 1024;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    const timer = setTimeout(() => {
      image.src = "";
      URL.revokeObjectURL(url);
      reject(new Error(
        "Image decoding timed out. Choose another image."
      ));
    }, 10000);

    image.onload = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      reject(new Error("This image could not be opened."));
    };

    image.src = url;
  });
}

function blobFromCanvas(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error(
          "This browser could not prepare the image."
        ));
        return;
      }

      resolve(blob);
    }, "image/webp", quality);
  });
}

export async function prepareImage(file) {
  if (!file || !TYPES.has(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }

  if (!file.size || file.size > MAX_SOURCE_BYTES) {
    throw new Error(
      `${file.name}: the original image must be under 8 MB.`
    );
  }

  const image = await loadImage(file);

  if (
    !image.naturalWidth ||
    !image.naturalHeight ||
    image.naturalWidth * image.naturalHeight > MAX_SOURCE_PIXELS
  ) {
    throw new Error(
      `${file.name}: choose an image below 40 megapixels.`
    );
  }

  const scale = Math.min(
    1,
    500 / image.naturalWidth,
    500 / image.naturalHeight
  );

  const canvas = document.createElement("canvas");

  canvas.width = Math.max(
    1,
    Math.round(image.naturalWidth * scale)
  );

  canvas.height = Math.max(
    1,
    Math.round(image.naturalHeight * scale)
  );

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error(
      "Image processing is unavailable in this browser."
    );
  }

  context.drawImage(
    image,
    0,
    0,
    canvas.width,
    canvas.height
  );

  let blob = await blobFromCanvas(canvas, 0.86);

  if (blob.size > MAX_PROCESSED_BYTES) {
    blob = await blobFromCanvas(canvas, 0.65);
  }

  if (blob.size > MAX_PROCESSED_BYTES) {
    throw new Error(
      `${file.name}: choose a less complex image.`
    );
  }

  const extensions = {
    "image/webp": "webp",
    "image/png": "png",
    "image/jpeg": "jpg"
  };

  const extension = extensions[blob.type];

  if (!extension) {
    throw new Error(
      "This browser produced an unsupported image format."
    );
  }

  return new File(
    [blob],
    `${crypto.randomUUID()}.${extension}`,
    { type: blob.type }
  );
}

export async function prepareImages(fileList) {
  const files = Array.from(fileList || []);

  if (files.length < 1 || files.length > 3) {
    throw new Error("Choose between one and three images.");
  }

  const prepared = [];

  // Process sequentially to limit memory use on mobile.
  for (const file of files) {
    prepared.push(await prepareImage(file));
  }

  return prepared;
}
