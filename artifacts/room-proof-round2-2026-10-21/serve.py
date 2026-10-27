"""Serve the review and its previous-round comparison on localhost."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class ReviewServer(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8080)
    args = parser.parse_args()
    directory = Path(__file__).resolve().parent.parent
    print(f'Open http://127.0.0.1:{args.port}/room-proof-round2-2026-10-21/index.html', flush=True)
    ReviewServer(('127.0.0.1', args.port), partial(SimpleHTTPRequestHandler, directory=str(directory))).serve_forever()
