/** Max selfie payload size (base64 JPEG data URL). */
export const SELFIE_MAX_BYTES = 3 * 1024 * 1024

export function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? ''
  return Math.ceil((base64.length * 3) / 4)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = src
  })
}

export async function fileToImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    return await loadImage(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

type CompressSource = HTMLImageElement | HTMLVideoElement | ImageBitmap

function sourceDimensions(source: CompressSource): { width: number; height: number } {
  if (source instanceof HTMLVideoElement) {
    return {
      width: source.videoWidth || 640,
      height: source.videoHeight || 480,
    }
  }
  if (source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height,
    }
  }
  return { width: source.width, height: source.height }
}

/**
 * Resize and re-encode as JPEG until the data URL is at most maxBytes.
 */
export async function compressImageSourceToDataUrl(
  source: CompressSource,
  maxBytes: number = SELFIE_MAX_BYTES,
): Promise<string> {
  const { width, height } = sourceDimensions(source)
  if (!width || !height) {
    throw new Error('Image has no size')
  }

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas not supported')
  }

  const maxDimension = 1920
  let scale = Math.min(1, maxDimension / Math.max(width, height))
  let quality = 0.9

  for (let attempt = 0; attempt < 24; attempt++) {
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))
    canvas.width = w
    canvas.height = h
    ctx.drawImage(source, 0, 0, w, h)
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (estimateDataUrlBytes(dataUrl) <= maxBytes) {
      return dataUrl
    }
    if (quality > 0.45) {
      quality -= 0.08
    } else {
      scale *= 0.82
      quality = 0.85
    }
  }

  const dataUrl = canvas.toDataURL('image/jpeg', 0.35)
  if (estimateDataUrlBytes(dataUrl) > maxBytes) {
    throw new Error('Could not compress image enough. Try a smaller photo.')
  }
  return dataUrl
}
