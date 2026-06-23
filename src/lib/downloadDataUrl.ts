/** Trigger a browser download for a data URL or blob URL. */
export function downloadDataUrl(dataUrl: string, filename = 'superhero-portrait.png'): void {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}
