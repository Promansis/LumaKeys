#!/usr/bin/env python3
# Send real X key events (XTEST) to a display. usage: xkey.py :93 ctrl+l text:/path Return
import ctypes, sys, time
x11 = ctypes.CDLL('libX11.so.6'); xtst = ctypes.CDLL('libXtst.so.6')
x11.XOpenDisplay.restype = ctypes.c_void_p; x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XStringToKeysym.restype = ctypes.c_ulong; x11.XStringToKeysym.argtypes = [ctypes.c_char_p]
x11.XKeysymToKeycode.restype = ctypes.c_ubyte; x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
xtst.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
x11.XFlush.argtypes = [ctypes.c_void_p]
d = x11.XOpenDisplay(sys.argv[1].encode())
assert d, 'cannot open display'
def kc(name):
    ks = x11.XStringToKeysym(name.encode()); assert ks, name
    return x11.XKeysymToKeycode(d, ks)
def press(name, mods=()):
    for m in mods: xtst.XTestFakeKeyEvent(d, kc(m), 1, 0)
    xtst.XTestFakeKeyEvent(d, kc(name), 1, 0); xtst.XTestFakeKeyEvent(d, kc(name), 0, 0)
    for m in reversed(mods): xtst.XTestFakeKeyEvent(d, kc(m), 0, 0)
    x11.XFlush(d); time.sleep(0.15)
NAMES = {'/': 'slash', '.': 'period', '-': 'minus', '_': 'underscore', ' ': 'space'}
for a in sys.argv[2:]:
    if a.startswith('text:'):
        for ch in a[5:]:
            if ch == '_': press('minus', ('Shift_L',))
            elif ch.isupper(): press(ch.lower(), ('Shift_L',))
            else: press(NAMES.get(ch, ch))
    else:
        parts = a.split('+'); mods = [{'ctrl': 'Control_L', 'alt': 'Alt_L', 'shift': 'Shift_L'}[m] for m in parts[:-1]]; press(parts[-1], mods)
print('sent', sys.argv[2:])
