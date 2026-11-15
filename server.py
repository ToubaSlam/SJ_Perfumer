"""Local server for Perfume Atelier: serves the app and stores notebook formulas in SQLite.

Run: python server.py  (then open http://localhost:4173). Data lives in atelier.db next to this file.
"""
import json, sqlite3
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB = ROOT / 'atelier.db'
TABLES = {'/api/formulas': 'formulas', '/api/catalog': 'catalog'}  # URL -> fixed table name


def db():
    con = sqlite3.connect(DB)
    con.execute('CREATE TABLE IF NOT EXISTS formulas (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated TEXT NOT NULL)')
    con.execute('CREATE TABLE IF NOT EXISTS catalog (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated TEXT NOT NULL)')
    return con


class Handler(SimpleHTTPRequestHandler):
    def send_json(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        table = TABLES.get(self.path.split('?')[0])
        if not table:
            return super().do_GET()
        with db() as con:
            rows = con.execute(f'SELECT data FROM {table} ORDER BY updated DESC').fetchall()
        self.send_json(200, [json.loads(r[0]) for r in rows])

    def do_PUT(self):
        # Replace the whole table with the posted list (the app always sends its full state).
        table = TABLES.get(self.path)
        if not table:
            return self.send_json(404, {'error': 'not found'})
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length > 10_000_000:
                raise ValueError
            formulas = json.loads(self.rfile.read(length))
            if not isinstance(formulas, list) or not all(isinstance(f, dict) and isinstance(f.get('id'), str) for f in formulas):
                raise ValueError
        except ValueError:
            return self.send_json(400, {'error': 'invalid formulas'})
        with db() as con:
            con.execute(f'DELETE FROM {table}')
            con.executemany(f'INSERT INTO {table} VALUES (?,?,?)',
                            [(f['id'], json.dumps(f, ensure_ascii=False), str(f.get('date', ''))) for f in formulas])
        self.send_json(200, {'saved': len(formulas)})


if __name__ == '__main__':
    db().close()
    print('Perfume Atelier running at http://localhost:4173  (formulas saved in atelier.db)')
    ThreadingHTTPServer(('127.0.0.1', 4173), partial(Handler, directory=str(ROOT))).serve_forever()
