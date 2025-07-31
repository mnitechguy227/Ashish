const http = require('http');
const fs = require('fs');
const url = require('url');
const path = require('path');

const PORT = process.env.PORT || 3001;

function readData(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', file)));
}

function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url, true);
  if (parsedUrl.pathname === '/api/abs') {
    const data = readData('abs.json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } else if (parsedUrl.pathname === '/api/abdc') {
    const data = readData('abdc.json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
}

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
