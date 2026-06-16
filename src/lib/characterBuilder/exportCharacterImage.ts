import html2canvas from 'html2canvas'

/** Capture a DOM node as PNG data URL (from avatar_maker html2canvas pattern). */
export async function captureElementAsPng(
  element: HTMLElement,
  backgroundColor: string | null = 'transparent'
): Promise<string> {
  const canvas = await html2canvas(element, {
    backgroundColor,
    scale: 2,
    useCORS: true,
    logging: false,
  })
  return canvas.toDataURL('image/png')
}
