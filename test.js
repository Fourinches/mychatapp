// simple_test.js
const http = require('http');
const PORT = 3000;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hello from IPv6 test server!\n');
});

server.listen(PORT, '::', () => {
    console.log(`Simple server listening on port ${PORT} for ALL IPv4/IPv6 addresses`);
    const address = server.address();
    if(address) {
        console.log(`Check netstat for [::]:${address.port}`);
    } else {
        console.error("Failed to get server address info.");
    }
});

server.on('error', (err) => {
    console.error("Server error:", err);
});