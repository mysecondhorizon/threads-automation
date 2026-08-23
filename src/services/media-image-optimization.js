export const OPTIMIZED_IMAGE_CONTENT_TYPE =
  "image/jpeg";

export const OPTIMIZED_IMAGE_EXTENSION =
  ".jpg";

export const IMAGE_MAX_DIMENSION =
  2048;

export const IMAGE_QUALITY =
  84;

function requireImagesBinding(imagesBinding) {
  if (
    !imagesBinding ||
    typeof imagesBinding.input !== "function"
  ) {
    throw new Error(
      "Cloudflare Images binding is unavailable"
    );
  }
}

export async function optimizeUploadedImage(
  imagesBinding,
  file
) {
  requireImagesBinding(imagesBinding);

  if (
    !file ||
    typeof file.stream !== "function"
  ) {
    throw new Error(
      "A valid image file is required"
    );
  }

  const output =
    await imagesBinding
      .input(file.stream())
      .transform({
        width: IMAGE_MAX_DIMENSION,
        height: IMAGE_MAX_DIMENSION,
        fit: "scale-down",
      })
      .output({
        format: OPTIMIZED_IMAGE_CONTENT_TYPE,
        quality: IMAGE_QUALITY,
      });

  const response =
    output?.response?.();

  if (
    !response ||
    typeof response.arrayBuffer !== "function"
  ) {
    throw new Error(
      "Image optimization returned an invalid response"
    );
  }

  if (response.ok === false) {
    throw new Error(
      "Image optimization failed"
    );
  }

  const body =
    new Uint8Array(
      await response.arrayBuffer()
    );

  if (!body.byteLength) {
    throw new Error(
      "Image optimization returned an empty image"
    );
  }

  return {
    body,
    contentType:
      OPTIMIZED_IMAGE_CONTENT_TYPE,
    originalBytes:
      Number(file.size || 0),
    storedBytes:
      body.byteLength,
    transformed: true,
    maxDimension:
      IMAGE_MAX_DIMENSION,
    quality:
      IMAGE_QUALITY,
    outputFormat:
      "jpeg",
  };
}
