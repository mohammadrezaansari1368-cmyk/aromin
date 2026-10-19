/** Escape all content, restoring only exact, attribute-free formatting tags. */
export function sanitizeForecastHtml(html: string): string {
  return html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/&lt;(\/?(?:b|strong|em|i|br))\s*\/?&gt;/gi, '<$1>')
}
