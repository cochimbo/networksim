import socket
import time
import os
import threading
import sys
from datetime import datetime

def log(msg):
    timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f"[{timestamp}] {msg}", flush=True)

# Configuration
# "hola desde {valor de variable de entorno de mensaje}"
MESSAGE_ID = os.getenv('MESSAGE', 'python-node')
PERIOD = float(os.getenv('PERIOD', '2.0'))
PORT = int(os.getenv('PORT', '37020'))
PEER_SERVICE_DNS = os.getenv('PEER_SERVICE_DNS', '')

def get_peer_ips():
    """Resolve the service DNS to get all peer IPs."""
    if not PEER_SERVICE_DNS:
        return ['<broadcast>']
    
    try:
        # Get own IP to filter it out
        my_ip = socket.gethostbyname(socket.gethostname())
        
        # Get address info for the service name
        # socket.getaddrinfo returns a list of tuples associated with the domain
        results = socket.getaddrinfo(PEER_SERVICE_DNS, None, socket.AF_INET)
        ips = set()
        for result in results:
            ip = result[4][0]
            if ip != my_ip:
                ips.add(ip)
                
        # Debug list
        # if not ips:
        #    print(f"DEBUG: No peers found. All resolved IPs were my IP ({my_ip})? Raw results: {results}", flush=True)
            
        return list(ips)
    except Exception as e:
        log(f"Error resolving peers from {PEER_SERVICE_DNS}: {e}")
        return []

def receiver():
    """Listens for UDP messages (unicast or broadcast) and prints them."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    
    # Allow multiple sockets to use the same port number
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    # Enable broadcasting mode just in case
    s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    
    try:
        s.bind(("0.0.0.0", PORT))
    except Exception as e:
        log(f"Error binding receiver: {e}")
        return

    log(f"Listening for UDP messages on port {PORT}...")
    while True:
        try:
            data, addr = s.recvfrom(1024)
            msg = data.decode('utf-8')
            log(f"Received from {addr[0]}:{addr[1]} -> {msg}")
        except Exception as e:
            log(f"Error receiving: {e}")
            time.sleep(1)

def sender():
    """Sends messages periodically to peers."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    
    log(f"Starting sender: '{MESSAGE_ID}' to port {PORT} every {PERIOD}s")

    while True:
        peers = get_peer_ips()
        
        if not peers:
             log("No peers found.")

        # Update message with current time for latency tracking
        current_time = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        msg_content = f"hola desde {MESSAGE_ID} sent at {current_time}"
        
        for ip in peers:
            try:
                # print(f"Sending to {ip}...", flush=True)
                s.sendto(msg_content.encode('utf-8'), (ip, PORT))
            except Exception as e:
                log(f"Error sending to {ip}: {e}")
                
        time.sleep(PERIOD)

if __name__ == "__main__":
    # Start receiver in background thread
    t = threading.Thread(target=receiver, daemon=True)
    t.start()
    
    # Run sender in main thread
    sender()
