import http.server, socketserver, functools
class H(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        t = super().guess_type(path)
        if str(path).endswith(".html"):
            return "text/html; charset=utf-8"
        return t
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", 5602), functools.partial(H, directory=".")) as s:
    s.serve_forever()
