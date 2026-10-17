"""A local server that is silent, or that beats — the two lines `probe.swift` listens on.

    /silent?s=75                 nothing at all for s seconds, then a whole reply
    /headers-then-silent?s=75    the status line and headers at once, then nothing for s seconds, then the answer
    /beat?s=75                   headers at once, an event-stream comment every 10 s for s seconds, then the answer

The beat is byte for byte what the coach Worker sends (`withHeartbeat` in server/worker.ts).
"""
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

BODY = b'{"text":"ok","finishReason":"STOP"}'
BEAT = b': beat\n\n'


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *args):
        pass

    def chunk(self, data):
        self.wfile.write(('%x\r\n' % len(data)).encode() + data + b'\r\n')
        self.wfile.flush()

    def stream_headers(self):
        self.send_response(200)
        self.send_header('content-type', 'text/event-stream; charset=utf-8')
        self.send_header('cache-control', 'no-store, no-transform')
        self.send_header('transfer-encoding', 'chunked')
        self.end_headers()
        self.wfile.flush()

    def do_POST(self):
        length = int(self.headers.get('content-length') or 0)
        if length:
            self.rfile.read(length)
        url = urlparse(self.path)
        seconds = float(parse_qs(url.query).get('s', ['75'])[0])
        try:
            if url.path == '/silent':
                time.sleep(seconds)
                self.send_response(200)
                self.send_header('content-type', 'application/json')
                self.send_header('content-length', str(len(BODY)))
                self.end_headers()
                self.wfile.write(BODY)
            elif url.path == '/headers-then-silent':
                self.stream_headers()
                time.sleep(seconds)
                self.chunk(b'data: ' + BODY + b'\n\n')
                self.chunk(b'')
            elif url.path == '/beat':
                self.stream_headers()
                started = time.time()
                self.chunk(BEAT)
                while time.time() - started + 10 <= seconds:
                    time.sleep(10)
                    self.chunk(BEAT)
                time.sleep(max(0.0, seconds - (time.time() - started)))
                self.chunk(b'data: ' + BODY + b'\n\n')
                self.chunk(b'')
            else:
                self.send_response(404)
                self.send_header('content-length', '0')
                self.end_headers()
        except (BrokenPipeError, ConnectionResetError):
            pass  # the client hung up — which is the thing being measured


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
