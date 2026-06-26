/** Trigger a browser download for a data URL or remote image URL. */
export function downloadDataUrl(dataUrlOrUrl: string, filename = 'superhero-portrait.png'): void {
  const anchor = document.createElement('a')
  anchor.href = dataUrlOrUrl
  anchor.download = filename
  anchor.rel = 'noopener'
  if (dataUrlOrUrl.startsWith('http://') || dataUrlOrUrl.startsWith('https://')) {
    anchor.target = '_blank'
  }
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}
