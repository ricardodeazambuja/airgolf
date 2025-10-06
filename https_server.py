import http.server
import ssl
import socketserver

# Configuration
PORT = 8443
SERVER_ADDRESS = ('0.0.0.0', PORT) # 0.0.0.0 listens on all interfaces

# Set up the HTTP handler
Handler = http.server.SimpleHTTPRequestHandler

# Set up the SSL/TLS context
# PROTOCOL_TLS_SERVER is preferred in modern Python versions
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)

# Load your certificate chain and private key
# Ensure key.pem and cert.pem are in the same directory
# $ openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes
context.load_cert_chain(certfile="cert.pem", keyfile="key.pem")

try:
    # Start the server
    with socketserver.TCPServer(SERVER_ADDRESS, Handler) as httpd:
        # Wrap the server socket with SSL
        httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
        print(f"Serving HTTPS on 0.0.0.0 port {PORT} (Press Ctrl+C to stop)")
        httpd.serve_forever()
except KeyboardInterrupt:
    pass


# If using ufw
# $ sudo ufw allow 8443/tcp
