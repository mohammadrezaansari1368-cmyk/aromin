#!/usr/bin/env python3
"""Offline, sanitized private-repo corpus. Never uploads or writes inside either git repo."""
import argparse
import hashlib
import ipaddress
import json
from pathlib import Path
import re
import subprocess

REDACTED = '[REDACTED]'
BOT_PATHS = ['tgcloud/lib/'+name+'.js' for name in ('bot-surface','decision-chat','leave-chat','mission-chat','punch-chat','request-flow','ticket-chat','presets')]
SOURCE_PATHS = ['docs','README.md','AGENTS.md','src/sidebar-menu.js','src/menu.jsx','src/pages/Assistant.jsx',*BOT_PATHS]

def sanitize(text):
    text = re.sub(r'-----BEGIN [^-]*(?:PRIVATE KEY|OPENSSH)[^-]*-----[\s\S]*?-----END [^-]+-----', REDACTED, text)
    # Discard whole lines: secrets can be embedded in examples, prose and shell commands.
    text = re.sub(r'^.*(?:password|passwd|secret|token|api[_ -]?key|authorization|bearer|ssh\b|scp\b|sftp\b|\.env\b|رمز عبور|کلید خصوصی).*$','[REDACTED]',text,flags=re.I|re.M)
    text = re.sub(r'https?://[^\s/@:]+:[^\s/@]+@[^\s]+', REDACTED, text)
    text = re.sub(r'\b(?:sk-|ghp_|github_pat_|AKIA)[A-Za-z0-9_/-]{8,}', REDACTED, text)
    text = re.sub(r'\beyJ[\w-]+\.[\w-]+\.[\w-]+\b', REDACTED, text)
    def address(m):
        try:
            a = ipaddress.ip_address(m.group())
            return REDACTED if not a.is_global else m.group()
        except ValueError:
            return m.group()
    text = re.sub(r'(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])', address, text)
    text = re.sub(r'(?<!\w)(?:[a-fA-F0-9]{0,4}:){2,}[a-fA-F0-9:]+', address, text)
    # Remove contact/customer identifiers and long opaque credentials conservatively.
    text = re.sub(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}', REDACTED, text)
    text = re.sub(r'(?<!\w)(?:\+98|0098|0)9[\d -]{9,13}', REDACTED, text)
    text = re.sub(r'\b[A-Za-z0-9_+/=-]{40,}\b', REDACTED, text)
    return text

def git(repo, *args):
    return subprocess.check_output(['git','-C',str(repo),*args], text=True)

def generate(repo, output):
    repo, output = Path(repo).resolve(), Path(output).resolve()
    if any((p / '.git').exists() for p in [output, *output.parents]):
        raise ValueError('output must be outside git')
    output.mkdir(parents=True, exist_ok=True)
    refs = git(repo,'for-each-ref','--format=%(refname)','refs/heads','refs/remotes').splitlines()
    # Include historical deleted docs, not just current tips.
    commits = git(repo,'log','--all','--format=%H','--',*SOURCE_PATHS).splitlines()
    sources, seen = [], set()
    for ref in dict.fromkeys(refs + commits):
        paths = git(repo,'ls-tree','-r','--name-only',ref,*SOURCE_PATHS).splitlines()
        for path in paths:
            if not path.endswith(('.md','.txt','.csv','.js','.jsx')) or '/landing/' in path or 'frames-prompts' in path:
                continue
            blob = git(repo,'rev-parse',f'{ref}:{path}').strip()
            if blob in seen:
                continue
            seen.add(blob)
            clean = sanitize(git(repo,'show',f'{ref}:{path}'))
            name = 'zurvan-' + hashlib.sha256((path+blob).encode()).hexdigest()[:16] + '.md'
            (output/name).write_text('# Source: '+sanitize(path)+'\n\nHistorical repository evidence; not approved public pricing/features.\n\n'+clean, encoding='utf-8')
            sources.append({'file':name,'path':path,'revision':ref,'collections':['zurvan_setup'],'internal':True})
    public = output/'public'
    public.mkdir(exist_ok=True)
    menu = git(repo,'show','HEAD:src/sidebar-menu.js')
    labels = list(dict.fromkeys(re.findall(r"label:\s*'([^']+)'", menu)))
    (public/'zurvan-menu.md').write_text('# گزینه‌های منوی نسخهٔ فعلی زروان\n\n'+
        'این فهرست فقط نام گزینه‌های موجود در منوی برنامه است؛ دربارهٔ جزئیات قابلیت، پلن و قیمت اطلاعات ندارم.\n\n'+
        '\n'.join('- '+sanitize(label) for label in labels),encoding='utf-8')
    (output/'manifest.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Generated {len(sources)} sanitized internal documents; manifest outside git. Public sales corpus requires owner-reviewed documentation.')
    return sources

if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--repo',required=True)
    p.add_argument('--out',default='/workspace/zurvan-kb')
    a=p.parse_args()
    generate(a.repo,a.out)
