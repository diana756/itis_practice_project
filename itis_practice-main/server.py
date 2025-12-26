#!/usr/bin/env python3
import http.server
import socketserver
import os
from functools import partial

# Change to the workspace directory
os.chdir('/Users/0/PythonProjects/itis_practice-main')

# Define the port
PORT = 8000

# Create a simple HTTP request handler
Handler = http.server.SimpleHTTPRequestHandler

# Start the server
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Server running at http://localhost:{PORT}/")
    print("Press Ctrl+C to stop the server")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")