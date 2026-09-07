#!/usr/bin/env python3
"""Static server for local editing.

python3 -m http.server sends no cache directives, so browsers keep serving
stale JS and CSS from memory cache without ever revalidating — you edit a
file, reload, and see the old page. Everything here is local and cheap to
re-read, so nothing is cached at all.
"""
import argparse
import http.server
import socketserver


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):  # quieter: drop the 200s, keep problems
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--bind", default="127.0.0.1")
    args = ap.parse_args()
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer((args.bind, args.port), NoCacheHandler) as httpd:
        print(f"  serving  http://localhost:{args.port}/displayer/   (ctrl-c to stop)")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
