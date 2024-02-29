from flask import Flask, render_template
import socket

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

# Function to find an available port starting from a given port
def find_available_port(start_port):
    port = start_port
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('0.0.0.0', port))
                return port
            except socket.error as e:
                print(f"Port {port} is in use, trying the next one...")
                port += 1

if __name__ == '__main__':
    available_port = find_available_port(80)
    print(f"Starting server on port {available_port}")
    app.run(host='0.0.0.0', port=available_port, debug=False)