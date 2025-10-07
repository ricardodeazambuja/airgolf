import http.server
import ssl
import socketserver
import socket

# Configuration
PORT = 8443
SERVER_ADDRESS = ('0.0.0.0', PORT) # 0.0.0.0 listens on all interfaces

# Get local IP address
def get_local_ip():
    try:
        # Create a socket to determine the local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Connect to an external address (doesn't actually send data)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return "127.0.0.1"

# Custom handler with no-cache headers to prevent iOS Safari aggressive caching
class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add cache-prevention headers for all responses
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

# Custom TCP server that allows address reuse
class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

Handler = NoCacheHTTPRequestHandler

# Set up the SSL/TLS context
# PROTOCOL_TLS_SERVER is preferred in modern Python versions
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)

# Load your certificate chain and private key
# Ensure key.pem and cert.pem are in the same directory
# $ openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes
context.load_cert_chain(certfile="cert.pem", keyfile="key.pem")

try:
    # Start the server with address reuse enabled
    with ReusableTCPServer(SERVER_ADDRESS, Handler) as httpd:
        # Wrap the server socket with SSL
        httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
        local_ip = get_local_ip()
        print(f"Serving HTTPS on 0.0.0.0 port {PORT} (Press Ctrl+C to stop)")
        print(f"Access from iPhone: https://{local_ip}:{PORT}")
        httpd.serve_forever()
except KeyboardInterrupt:
    print("\nServer shutting down...")
    pass
except OSError as e:
    if "Address already in use" in str(e):
        print(f"\n❌ ERROR: Port {PORT} is already in use!")
        print(f"To fix: Kill the old process with: lsof -ti:{PORT} | xargs kill -9")
    else:
        print(f"\n❌ ERROR: {e}")
    exit(1)


# If using ufw
# $ sudo ufw allow 8443/tcp
