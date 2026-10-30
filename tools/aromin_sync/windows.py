"""Windows-only owner isolation and task lifecycle; no password-store access."""
import ctypes
from ctypes import wintypes
import os
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET


def home():
    if sys.platform != 'win32':
        raise OSError('این دستور فقط در ویندوز اجرا می‌شود.')
    return Path(os.environ['LOCALAPPDATA']) / 'AROMINSync'


def secure_home():
    folder = home()
    folder.mkdir(parents=True, exist_ok=True)
    sid = subprocess.check_output(['whoami','/user','/fo','csv','/nh'], text=True)
    import csv
    sid = next(csv.reader([sid.strip()]))[1]
    # Replace inherited access, and remove explicit grants except this owner.
    subprocess.run(['icacls',str(folder),'/inheritance:r','/grant:r',f'*{sid}:(OI)(CI)F'], check=True, capture_output=True)
    # Fail closed if any other explicit principal still has access.
    # -Command does not bind trailing arguments to $args, so the path travels in an environment variable.
    script = '(Get-Acl -LiteralPath $env:AROMIN_SYNC_HOME).Access | ForEach-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value }'
    principals = subprocess.check_output(['powershell','-NoProfile','-NonInteractive','-Command',script], text=True, env={**os.environ, 'AROMIN_SYNC_HOME': str(folder)}).split()
    if any(p != sid for p in principals):
        raise OSError('دسترسی پوشه فقط باید برای کاربر جاری باشد.')
    return folder


class Blob(ctypes.Structure):
    _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_ubyte))]


def crypt(data, decrypt=False):
    if sys.platform != 'win32':
        raise OSError('DPAPI فقط در ویندوز در دسترس است.')
    buffer = ctypes.create_string_buffer(data)
    src = Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
    dst = Blob()
    dll = ctypes.WinDLL('crypt32', use_last_error=True)
    fn = dll.CryptUnprotectData if decrypt else dll.CryptProtectData
    fn.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    fn.restype = wintypes.BOOL
    if not fn(ctypes.byref(src), None, None, None, None, 1, ctypes.byref(dst)):
        raise ctypes.WinError(ctypes.get_last_error())
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    try:
        return ctypes.string_at(dst.data, dst.size)
    finally:
        kernel.LocalFree(dst.data)


class Lock:
    def __enter__(self):
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.CreateMutexW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR]
        kernel.CreateMutexW.restype = wintypes.HANDLE
        self.kernel = kernel
        self.handle = kernel.CreateMutexW(None, False, 'Local\\AROMINSync')
        if not self.handle or ctypes.get_last_error() == 183:
            if self.handle:
                kernel.CloseHandle(wintypes.HANDLE(self.handle))
            raise OSError('آرومین‌سینک در حال اجرا است.')
        return self

    def __exit__(self, *args):
        self.kernel.CloseHandle(wintypes.HANDLE(self.handle))


def stop_task():
    subprocess.run(['schtasks','/End','/TN','AROMINSync'], check=False, capture_output=True)


def task(install=False, remove=False, repo=None):
    if remove:
        subprocess.run(['schtasks','/Delete','/TN','AROMINSync','/F'], check=True, capture_output=True)
        return
    if not install:
        subprocess.run(['schtasks','/Run','/TN','AROMINSync'], check=True, capture_output=True)
        return
    folder = secure_home()
    owner = subprocess.check_output(['whoami'], text=True).strip()
    ns = 'http://schemas.microsoft.com/windows/2004/02/mit/task'
    ET.register_namespace('', ns)
    def add(parent, name, text=None, **attrs):
        child = ET.SubElement(parent, '{'+ns+'}'+name, attrs)
        child.text = text
        return child
    root = ET.Element('{'+ns+'}Task', version='1.2')
    triggers = add(root,'Triggers')
    add(add(triggers,'LogonTrigger'),'UserId',owner)
    principal = add(add(root,'Principals'),'Principal', id='Owner')
    add(principal,'UserId',owner)
    add(principal,'LogonType','InteractiveToken')
    add(principal,'RunLevel','LeastPrivilege')
    settings = add(root,'Settings')
    add(settings,'MultipleInstancesPolicy','IgnoreNew')
    add(settings,'DisallowStartIfOnBatteries','false')
    add(settings,'StopIfGoingOnBatteries','false')
    add(settings,'ExecutionTimeLimit','PT0S')
    restart = add(settings,'RestartOnFailure')
    add(restart,'Interval','PT1M')
    add(restart,'Count','999')
    action = add(add(root,'Actions', Context='Owner'),'Exec')
    add(action,'Command',str(Path(sys.executable).with_name('pythonw.exe')))
    add(action,'Arguments','-m tools.aromin_sync _serve')
    add(action,'WorkingDirectory',str(repo or Path(__file__).resolve().parents[2]))
    xml = folder / 'task.xml'
    ET.ElementTree(root).write(xml, encoding='utf-16', xml_declaration=True)
    try:
        subprocess.run(['schtasks','/Create','/TN','AROMINSync','/XML',str(xml),'/F'], check=True, capture_output=True)
    finally:
        xml.unlink(missing_ok=True)
