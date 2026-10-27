#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from pathlib import Path
import argparse
parser = argparse.ArgumentParser(description='Serve the Room Proof review artifacts locally.')
parser.add_argument('--port', type=int, default=8080)
args = parser.parse_args()
class ReviewServer(ThreadingHTTPServer):
    request_queue_size = 128
root = Path(__file__).resolve().parent.parent
server = ReviewServer(('127.0.0.1', args.port), partial(SimpleHTTPRequestHandler, directory=str(root)))
print(f'http://127.0.0.1:{args.port}/room-proof-round4-2026-10-22/index.html', flush=True)
server.serve_forever()
