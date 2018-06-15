const express = require('express');
const WebSocket = require('ws');
const http = require('http');

const app = express();

const server = http.createServer(app);

const wsServer = new WebSocket.Server({ server });

wsServer.on('connection', (ws) => {
  ws.on('message', (message) => {
    console.log('the message is: ', message);
    ws.send(`Hello, you sent -> ${message}`);
  });

  ws.send('Hi there, I am a WebSocket1337 server');
});

server.listen(process.env.PORT || 8999, () => {
  console.log(`Server started on port ${server.address().port} :)`);
});
