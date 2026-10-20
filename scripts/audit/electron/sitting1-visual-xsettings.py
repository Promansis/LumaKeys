#!/usr/bin/env python3
# Sitting 1 (visual) helper: a minimal XSETTINGS manager for a throwaway Xvfb display. It publishes
# Gtk/EnableAnimations, the XSETTINGS key that GNOME's gsd-xsettings derives from
# `gsettings org.gnome.desktop.interface enable-animations` on an X11 session, so GTK clients
# (Chrome, Electron) see the OS reduced-motion switch the same way they do on the owner's desktop.
#   DISPLAY=:91 python3 -I sitting1-visual-xsettings.py 0      # animations off; SIGUSR1 toggles; SIGTERM exits
# Writes the current value to stdout on each change.
import ctypes
import os
import signal
import struct
import sys

disp_name = os.environ.get('DISPLAY', '')
if disp_name in ('', ':0', ':1'):
    sys.exit('refusing to run on a non-throwaway display: %r' % disp_name)

x11 = ctypes.cdll.LoadLibrary('libX11.so.6')
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XDefaultScreen.argtypes = [ctypes.c_void_p]
x11.XDefaultRootWindow.restype = ctypes.c_ulong
x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
x11.XCreateSimpleWindow.restype = ctypes.c_ulong
x11.XCreateSimpleWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.c_uint, ctypes.c_uint, ctypes.c_uint, ctypes.c_ulong, ctypes.c_ulong]
x11.XInternAtom.restype = ctypes.c_ulong
x11.XInternAtom.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
x11.XGetSelectionOwner.restype = ctypes.c_ulong
x11.XGetSelectionOwner.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XSetSelectionOwner.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong]
x11.XChangeProperty.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.c_char_p, ctypes.c_int]
x11.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
x11.XDestroyWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XCloseDisplay.argtypes = [ctypes.c_void_p]


class XClientMessageEvent(ctypes.Structure):
    _fields_ = [('type', ctypes.c_int), ('serial', ctypes.c_ulong), ('send_event', ctypes.c_int),
                ('display', ctypes.c_void_p), ('window', ctypes.c_ulong), ('message_type', ctypes.c_ulong),
                ('format', ctypes.c_int), ('data', ctypes.c_long * 5)]


class XEvent(ctypes.Union):
    _fields_ = [('xclient', XClientMessageEvent), ('pad', ctypes.c_long * 24)]


x11.XSendEvent.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_long, ctypes.POINTER(XEvent)]

dpy = x11.XOpenDisplay(disp_name.encode())
if not dpy:
    sys.exit('cannot open display')
screen = x11.XDefaultScreen(dpy)
root = x11.XDefaultRootWindow(dpy)
sel = x11.XInternAtom(dpy, b'_XSETTINGS_S%d' % screen, 0)
prop = x11.XInternAtom(dpy, b'_XSETTINGS_SETTINGS', 0)
if x11.XGetSelectionOwner(dpy, sel):
    sys.exit('another XSETTINGS manager already owns this display')
win = x11.XCreateSimpleWindow(dpy, root, -1, -1, 1, 1, 0, 0, 0)
state = {'value': int(sys.argv[1]), 'serial': 0}


def publish():
    name = b'Gtk/EnableAnimations'
    pad = (4 - len(name) % 4) % 4
    setting = struct.pack('<BxH', 0, len(name)) + name + b'\0' * pad + struct.pack('<Ii', state['serial'], state['value'])
    data = struct.pack('<B3xII', 0, state['serial'], 1) + setting  # 0 = LSBFirst
    x11.XChangeProperty(dpy, win, prop, prop, 8, 0, data, len(data))
    x11.XSync(dpy, 0)
    state['serial'] += 1
    print('Gtk/EnableAnimations', state['value'], 'serial', state['serial'] - 1, flush=True)


publish()
x11.XSetSelectionOwner(dpy, sel, win, 0)
x11.XSync(dpy, 0)
if x11.XGetSelectionOwner(dpy, sel) != win:
    sys.exit('could not take the XSETTINGS selection')
ev = XEvent()
ev.xclient.type = 33
ev.xclient.window = root
ev.xclient.message_type = x11.XInternAtom(dpy, b'MANAGER', 0)
ev.xclient.format = 32
ev.xclient.data[0] = 0
ev.xclient.data[1] = sel
ev.xclient.data[2] = win
x11.XSendEvent(dpy, root, 0, 1 << 17, ctypes.byref(ev))  # StructureNotifyMask
x11.XSync(dpy, 0)
print('manager window', hex(win), flush=True)


def toggle(*_):
    state['value'] = 1 - state['value']
    publish()


def stop(*_):
    x11.XDestroyWindow(dpy, win)
    x11.XSync(dpy, 0)
    x11.XCloseDisplay(dpy)
    print('stopped', flush=True)
    sys.exit(0)


signal.signal(signal.SIGUSR1, toggle)
signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
while True:
    signal.pause()
