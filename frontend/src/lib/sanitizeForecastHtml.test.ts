import { describe, expect, it } from 'vitest'
import { sanitizeForecastHtml } from './sanitizeForecastHtml'

describe('forecast HTML', () => {
  it('preserves plain formatting and Persian text', () => {
    expect(sanitizeForecastHtml('متن <b>مهم</b><br> <em>سال</em>')).toBe('متن <b>مهم</b><br> <em>سال</em>')
  })
  it('escapes scripts, attributes, URLs, SVG, and encoded markup', () => {
    for (const value of ['<script>alert(1)</script>', '<b onclick="alert(1)">x</b>', '<img src=x onerror=alert(1)>', '<svg/onload=alert(1)>', '<a href="javascript:alert(1)">x</a>', '&lt;img src=x onerror=alert(1)&gt;']) {
      expect(sanitizeForecastHtml(value)).not.toMatch(/<(?!\/?(?:b|em|i|strong|br)>)/i)
    }
  })
})
