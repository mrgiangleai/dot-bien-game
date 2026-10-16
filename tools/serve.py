"""Server tĩnh nội bộ, tắt cache để mỗi lần mở game luôn chạy code mới nhất.
Dùng: python3 tools/serve.py [port] [thư_mục]"""
import functools
import http.server
import sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
root = sys.argv[2] if len(sys.argv) > 2 else '.'


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


handler = functools.partial(NoCacheHandler, directory=root)
http.server.ThreadingHTTPServer(('127.0.0.1', port), handler).serve_forever()
