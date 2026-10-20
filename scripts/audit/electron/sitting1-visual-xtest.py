#!/usr/bin/env python3
# Sitting 1 (visual) helper: genuine X input on a throwaway Xvfb display through the XTEST
# extension (python3 ctypes on libXtst/libX11; no xdotool on this host), plus real window
# manager requests (ICCCM iconify, EWMH activate). Only ever pass a throwaway display.
#
#   DISPLAY=:91 python3 -I sitting1-visual-xtest.py key ctrl+equal
#   DISPLAY=:91 python3 -I sitting1-visual-xtest.py click 640 400
#   DISPLAY=:91 python3 -I sitting1-visual-xtest.py iconify 0x1a00003
#   DISPLAY=:91 python3 -I sitting1-visual-xtest.py activate 0x1a00003
# Window state is read with `xprop -id <win> WM_STATE _NET_WM_STATE`.
import ctypes
import os
import sys
import time

disp_name = os.environ.get('DISPLAY', '')
if disp_name in ('', ':0', ':1'):
    sys.exit('refusing to send input to a non-throwaway display: %r' % disp_name)

x11 = ctypes.cdll.LoadLibrary('libX11.so.6')
xtst = ctypes.cdll.LoadLibrary('libXtst.so.6')
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XStringToKeysym.restype = ctypes.c_ulong
x11.XStringToKeysym.argtypes = [ctypes.c_char_p]
x11.XKeysymToKeycode.restype = ctypes.c_ubyte
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XFlush.argtypes = [ctypes.c_void_p]
x11.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
x11.XDefaultScreen.argtypes = [ctypes.c_void_p]
x11.XDefaultRootWindow.restype = ctypes.c_ulong
x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
x11.XIconifyWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int]
x11.XInternAtom.restype = ctypes.c_ulong
x11.XInternAtom.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
xtst.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
xtst.XTestFakeButtonEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
xtst.XTestFakeMotionEvent.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong]

dpy = x11.XOpenDisplay(disp_name.encode())
if not dpy:
    sys.exit('cannot open display %s' % disp_name)

MODS = {'ctrl': 'Control_L', 'shift': 'Shift_L', 'alt': 'Alt_L', 'super': 'Super_L'}


def keycode(name):
    ks = x11.XStringToKeysym(MODS.get(name, name).encode())
    if ks == 0:
        sys.exit('unknown keysym %s' % name)
    kc = x11.XKeysymToKeycode(dpy, ks)
    if kc == 0:
        sys.exit('no keycode for %s' % name)
    return kc


def key(combo, hold_ms=60):
    parts = combo.split('+') if combo != '+' else ['plus']
    codes = [keycode(p) for p in parts]
    for c in codes:
        xtst.XTestFakeKeyEvent(dpy, c, 1, 0)
        x11.XSync(dpy, 0)
        time.sleep(0.02)
    time.sleep(hold_ms / 1000)
    for c in reversed(codes):
        xtst.XTestFakeKeyEvent(dpy, c, 0, 0)
        x11.XSync(dpy, 0)
        time.sleep(0.02)
    print('key', combo, 'codes', codes)


def click(x, y, button=1):
    xtst.XTestFakeMotionEvent(dpy, -1, x, y, 0)
    x11.XSync(dpy, 0)
    time.sleep(0.12)
    xtst.XTestFakeButtonEvent(dpy, button, 1, 0)
    x11.XSync(dpy, 0)
    time.sleep(0.08)
    xtst.XTestFakeButtonEvent(dpy, button, 0, 0)
    x11.XSync(dpy, 0)
    print('click', x, y, 'button', button)


class XClientMessageEvent(ctypes.Structure):
    _fields_ = [('type', ctypes.c_int), ('serial', ctypes.c_ulong), ('send_event', ctypes.c_int),
                ('display', ctypes.c_void_p), ('window', ctypes.c_ulong), ('message_type', ctypes.c_ulong),
                ('format', ctypes.c_int), ('data', ctypes.c_long * 5)]


class XEvent(ctypes.Union):
    _fields_ = [('xclient', XClientMessageEvent), ('pad', ctypes.c_long * 24)]


x11.XSendEvent.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_long, ctypes.POINTER(XEvent)]


def activate(win):
    # EWMH _NET_ACTIVE_WINDOW from a pager (source 2): the WM de-iconifies, maps and focuses it.
    ev = XEvent()
    ev.xclient.type = 33  # ClientMessage
    ev.xclient.send_event = 1
    ev.xclient.window = win
    ev.xclient.message_type = x11.XInternAtom(dpy, b'_NET_ACTIVE_WINDOW', 0)
    ev.xclient.format = 32
    ev.xclient.data[0] = 2
    ev.xclient.data[1] = 0
    root = x11.XDefaultRootWindow(dpy)
    mask = (1 << 19) | (1 << 20)  # SubstructureNotify | SubstructureRedirect
    x11.XSendEvent(dpy, root, 0, mask, ctypes.byref(ev))
    x11.XSync(dpy, 0)
    print('activate', hex(win))


def iconify(win):
    # ICCCM WM_CHANGE_STATE IconicState: the same request a minimise button or shortcut makes.
    st = x11.XIconifyWindow(dpy, win, x11.XDefaultScreen(dpy))
    x11.XSync(dpy, 0)
    print('iconify', hex(win), 'status', st)


cmd = sys.argv[1]
if cmd == 'key':
    for combo in sys.argv[2:]:
        key(combo)
        time.sleep(0.15)
elif cmd == 'keyhold':
    key(sys.argv[2], int(sys.argv[3]))
elif cmd == 'click':
    click(int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]) if len(sys.argv) > 4 else 1)
elif cmd == 'move':
    xtst.XTestFakeMotionEvent(dpy, -1, int(sys.argv[2]), int(sys.argv[3]), 0)
    x11.XSync(dpy, 0)
elif cmd == 'iconify':
    iconify(int(sys.argv[2], 0))
elif cmd == 'activate':
    activate(int(sys.argv[2], 0))
else:
    sys.exit('unknown command ' + cmd)
x11.XCloseDisplay(dpy)
