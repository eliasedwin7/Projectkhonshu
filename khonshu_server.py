"""Serves the Khonshu night sky on your home network so a phone can act as its remote.

Run it (or double-click "Start Khonshu.bat"), and the sky opens in your browser. The address
for the phone remote is printed below and shown in the sky's control panel.

    python khonshu_server.py [--kiosk] [--no-browser] [--local] [--port 8765]

--kiosk opens the sky fullscreen with the music already playing ("Khonshu Bedtime.bat").
--local keeps it on this computer only (no phone remote).
"""
import argparse
import ctypes
import json
import os
import socket
import subprocess
import threading
import time
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
# only the sky itself is served, never the rest of the folder
PAGES = {'/': '/index.html', '/index.html': '/index.html', '/remote': '/remote.html', '/remote.html': '/remote.html',
         '/manifest.webmanifest': '/manifest.webmanifest', '/sw.js': '/sw.js'}
FOLDERS = ('/js/', '/data/', '/css/', '/icons/')
MAX_BODY = 64 * 1024

lock = threading.Lock()
commands = []          # (id, command) pairs waiting for the sky to collect
latest = 0
display = {}           # what the sky last reported about itself
remote_url = ''
last_playing = 0.0     # when the sky last said it was playing
CAN_KEEP_AWAKE = os.name == 'nt'


def keep_awake():
    """Stop Windows sleeping or blanking the screen while the sky is playing.

    This is the request a video player makes: it lasts only while this program runs and asks for
    it, and changes no power setting. It lapses 30 seconds after the sky stops reporting in, so
    closing the browser lets the computer sleep again. The call applies to the thread that makes
    it, which is why it has a thread of its own.
    """
    CONTINUOUS, SYSTEM_REQUIRED, DISPLAY_REQUIRED = 0x80000000, 0x00000001, 0x00000002
    held = False
    while True:
        wanted = time.time() - last_playing < 30
        if wanted != held:
            ctypes.windll.kernel32.SetThreadExecutionState(
                CONTINUOUS | (SYSTEM_REQUIRED | DISPLAY_REQUIRED if wanted else 0))
            held = wanted
        time.sleep(5)


def lan_address():
    """This computer's address on the local network (no packets are actually sent)."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(('10.255.255.255', 1))
        return probe.getsockname()[0]
    except OSError:
        return '127.0.0.1'
    finally:
        probe.close()


class Handler(SimpleHTTPRequestHandler):
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map, **{'.webmanifest': 'application/manifest+json'})
    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def reply(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get('Content-Length') or 0)
        if not 0 < length <= MAX_BODY:
            return None
        try:
            data = json.loads(self.rfile.read(length))
        except ValueError:
            return None
        return data if isinstance(data, dict) else None

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == '/api/poll':
            # the sky asks for anything newer than the last command it has seen
            try:
                since = int(parse_qs(url.query).get('since', ['-1'])[0])
            except ValueError:
                since = -1
            with lock:
                fresh = [c for i, c in commands if i > since] if since >= 0 else []
                self.reply({'latest': latest, 'commands': fresh})
        elif url.path == '/api/state':
            with lock:
                self.reply(dict(display, remote=remote_url, keepsAwake=CAN_KEEP_AWAKE))
        elif url.path in PAGES:
            self.path = PAGES[url.path]
            super().do_GET()
        elif url.path.startswith(FOLDERS) and '..' not in url.path:
            self.path = url.path
            super().do_GET()
        else:
            self.send_error(404)

    def do_POST(self):
        global latest, display, last_playing
        data = self.read_json()
        if data is None:
            self.send_error(400)
        elif self.path == '/api/command':
            with lock:
                latest += 1
                commands.append((latest, data))
                del commands[:-200]
            self.reply({'ok': True})
        elif self.path == '/api/state':
            with lock:
                display = data
                if data.get('awake'):
                    last_playing = time.time()
            self.reply({'ok': True})
        else:
            self.send_error(404)


def open_kiosk(url):
    """Open the sky fullscreen in Edge or Chrome, allowed to play sound without a click.

    Browsers only honour those switches when starting fresh, so it gets a profile of its own.
    Returns False if neither browser is installed in the usual place.
    """
    programs = (r'Microsoft\Edge\Application\msedge.exe', r'Google\Chrome\Application\chrome.exe')
    folders = [os.environ.get(name) for name in ('PROGRAMFILES(X86)', 'PROGRAMFILES', 'LOCALAPPDATA')]
    browser = next((path for folder in folders if folder for program in programs
                    if os.path.isfile(path := os.path.join(folder, program))), None)
    if not browser:
        return False
    profile = os.path.join(os.environ.get('LOCALAPPDATA') or ROOT, 'Khonshu', 'browser')
    subprocess.Popen([browser, '--kiosk', url + '?autostart=1', '--edge-kiosk-type=fullscreen',
                      '--autoplay-policy=no-user-gesture-required', '--no-first-run',
                      '--user-data-dir=' + profile])
    return True


def main():
    global remote_url
    parser = argparse.ArgumentParser(description='Serve the Khonshu night sky and its phone remote.')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--kiosk', action='store_true', help='open fullscreen with the music already playing')
    parser.add_argument('--local', action='store_true', help='this computer only, no phone remote')
    parser.add_argument('--no-browser', action='store_true', help='do not open the sky in a browser')
    args = parser.parse_args()

    server = ThreadingHTTPServer(('127.0.0.1' if args.local else '0.0.0.0', args.port), partial(Handler, directory=ROOT))
    sky = f'http://localhost:{args.port}/'
    print('Khonshu night sky:', sky)
    if not args.local:
        remote_url = f'http://{lan_address()}:{args.port}/remote'
        print('Phone remote (same Wi-Fi):', remote_url)
        print('If the phone cannot connect, allow Python through Windows Firewall for private networks.')
    print('Leave this window open. Press Ctrl+C to stop.')
    if CAN_KEEP_AWAKE:
        threading.Thread(target=keep_awake, daemon=True).start()
        print('The computer will not sleep while the sky is playing.')
    if args.kiosk and open_kiosk(sky):
        print('Opened fullscreen. Press Alt+F4 on the sky to close it.')
    elif not args.no_browser:
        webbrowser.open(sky)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
