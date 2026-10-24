/**
 * 3.9.86: the forecast notes are built as HTML (<span style=…>, <b>, <br>). For the Markdown renderer: drop every tag and inline
 * style, keep bold as **…**, turn <br>/<span> boundaries into line breaks, remove emoji, decode the few entities we use.
 */
export function stripHtml(html: string): string {
	return String(html || '')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/?(b|strong)\b[^>]*>/gi, '**')
		.replace(/<\/?span\b[^>]*>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]️?/gu, '')
		.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
		.replace(/\*\*\s*\*\*/g, '')
		.replace(/[ \t]+/g, ' ')
}

/** Clean text → a Markdown bullet list: one bullet per line / sentence. */
export function toBullets(text: string): string {
	return text.split(/\n+/)
		.flatMap((l) => l.split(/(?<=[.؛])\s+(?=\S)/))
		.map((s) => s.trim())
		.filter((s) => s.replace(/[*\s.·—-]/g, '').length > 1)
		.map((s) => '- ' + s)
		.join('\n')
}
