const express = require('express');
const WebSocket = require('ws');
const http = require('http');

const app = express();

const server = http.createServer(app);

const wsServer = new WebSocket.Server({ server });

const admins = {};
const players = {};
const lobbies = {};

wsServer.on('connection', (ws) => {
  console.log('Someone`s connected!');
  ws.on('message', (message) => {
    console.log('the message is: ', String(message));
    const {
      payload: {
        user, lobby, stateData, speedTest, onlineVid,
      }, command, target,
    } = JSON.parse(String(message));

    if (user.userType === 'Admin') {
      if (!admins[user.userName]) {
        admins[user.userName] = { ws, name: user.userName };
      } else {
        admins[user.userName].ws = ws;
      }

      if (command.command === 'createLobby') {
        if (!lobbies[user.userName]) {
          lobbies[user.userName] = { admin: admins[user.userName], players: {} };
          admins[user.userName].lobby = lobbies[user.userName];

          console.log(`Lobby ${user.userName} is created`);
        }
      }

      if (command.command === 'startDemo') {
        const onStartDemoReq = {
          payload: {},
          command: {
            setType: 'playerCommands',
            command: 'startDemo',
          },
        };

        console.log('admins[user.userName].lobby.players', admins[user.userName].lobby.players);
        admins[user.userName].lobby.players[target].ws.send(JSON.stringify(onStartDemoReq));
        console.log(`Demo started on user ${user.userName}`);
      }

      if (command.command === 'broadCastSpeedTest' && admins[user.userName].lobby.players) {
        const onBroadcastSpeedTestReq = JSON.stringify({
          payload: { speedTest },
          command: {
            setType: 'playerCommands',
            command: 'onSpeedTest',
          },
        });

        Object.values(admins[user.userName].lobby.players)
          .forEach((player) => {
            console.log(`speed test ${speedTest} sent to player ${player.name}`);
            player.ws.send(onBroadcastSpeedTestReq);
          });
      }
    }

    if (command.command === 'toggleOnlineVideo') {
      const onToggleOnlineVideoReq = JSON.stringify({
        payload: { onlineVid },
        command: {
          setType: 'playerCommands',
          command: 'toggleOnlineVid',
        },
      });


      // admins[user.userName].lobby.players[target].ws.send(JSON.stringify(onStartDemoReq));
      admins[user.userName].lobby.players[target].ws.send(onToggleOnlineVideoReq);
    }

    if (user.userType === 'Player') {
      if (!players[user.userName]) {
        players[user.userName] = { ws, name: user.userName };
      } else {
        players[user.userName].ws = ws;
      }

      if (command.command === 'joinLobby' && lobbies[lobby]) {
        lobbies[lobby].players[user.userName] = players[user.userName];

        const onConnectReq = {
          payload: { user },
          command: {
            setType: 'adminCommands',
            command: 'playerConnected',
          },
        };

        console.log('lobbies[lobby]', lobbies[lobby]);
        lobbies[lobby].admin.ws.send(JSON.stringify(onConnectReq));
        console.log(`User ${user.userName} joined lobby ${lobby}`);
      }

      if (command.command === 'refreshData' && lobbies[lobby] && lobbies[lobby].players[user.userName]) {
        const onRefreshReq = {
          payload: { stateData, user },
          command: {
            setType: 'playerCommands',
            command: 'refreshData',
          },
        };

        console.log(JSON.stringify(onRefreshReq));
        lobbies[lobby].admin.ws.send(JSON.stringify(onRefreshReq));
      }
    }

    ws.send(`Hello, you sent -> ${String(message)}`);
  });
  ws.send('Hi there, I am a WebSocket1337 server');
});
server.listen(process.env.PORT || 8999, () => {
  console.log(`Server started on port ${server.address().port} :)`);
});
