#!/usr/bin/env python3
"""Optional offline browser QA; uses installed Playwright, adds no project dependency."""
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--out',default='/workspace/zurvan-agent-shots')
    p.add_argument('--head-code',default='/workspace/zurvan-agent-api/src/head-code.js')
    a=p.parse_args();out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def do_GET(self):
            if self.path=='/zurvan-widget.js': body=(ROOT/'frontend/public/zurvan-widget.js').read_bytes();kind='text/javascript'
            elif self.path=='/head-code.js': body=Path(a.head_code).read_bytes();kind='text/javascript'
            elif self.path.endswith('/config'): body=json.dumps({'ok':True,'enabled':True}).encode();kind='application/json'
            else:
                body=b'''<!doctype html><html dir="rtl"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f4f0e8;min-height:100vh;font:18px Tahoma;color:#8b5e34"><p style="padding:30px">ZURVAN</p><script type="module">import {installHeadCode} from '/head-code.js';installHeadCode(document,'<script async src="/zurvan-widget.js" data-site-id="synthetic123"><'+'/script>','synthetic-business');</script></body></html>''';kind='text/html'
            self.send_response(200);self.send_header('Content-Type',kind+'; charset=utf-8');self.end_headers();self.wfile.write(body)
        def do_POST(self):
            self.rfile.read(int(self.headers.get('Content-Length','0')))
            self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps({'ok':True,'text':'اطلاعات ندارم'}).encode())
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
    evidence=[]
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(headless=True)
            for width in (390,1440):
                for theme in ('light','dark'):
                    page=browser.new_page(viewport={'width':width,'height':900},color_scheme=theme,reduced_motion='reduce')
                    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                    page.goto(f'http://127.0.0.1:{server.server_port}/')
                    page.evaluate("t=>{document.documentElement.dataset.theme=t;document.body.style.background=t==='dark'?'#221e1b':'#f4f0e8'}",theme)
                    launch=page.get_by_role('button',name='گفت‌وگو با زروان');launch.wait_for()
                    page.screenshot(path=str(out/f'{theme}-{width}-collapsed.png'))
                    launch.click();page.get_by_role('textbox',name='پیام شما').wait_for()
                    page.get_by_role('log').get_by_text('سلام، من زروان هستم.',exact=False).wait_for()
                    page.screenshot(path=str(out/f'{theme}-{width}-open.png'))
                    page.get_by_role('textbox',name='پیام شما').fill('قیمت؟');page.get_by_role('button',name='ارسال',exact=True).click()
                    page.get_by_role('log').get_by_text('اطلاعات ندارم',exact=True).wait_for()
                    assert not errors,errors
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                    page.keyboard.press('Escape');assert launch.get_attribute('aria-expanded')=='false'
                    # Public action cannot access host auth; the widget uses no cookies or setup endpoint.
                    evidence.append({'width':width,'theme':theme,'headCodeInjection':True,'noPageErrors':True,'noHorizontalOverflow':True,'escapeRestoresLauncher':True})
                    page.close()
            browser.close()
    finally: server.shutdown()
    (out/'evidence.json').write_text(json.dumps(evidence,indent=2))
    print(f'{len(evidence)*2} screenshots and offline browser evidence saved to {out}')

if __name__=='__main__': main()
