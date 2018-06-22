const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const _ = require('lodash');

const Response = require('./Response');
const Request = require('./Request');

const app = express();

const server = http.createServer(app);

const wsServer = new WebSocket.Server({ server });


const admins = {};
const players = {};
const lobbies = {};

function pingEveryone() {
  // console.log('PING');
  Object.values(admins).forEach((admin) => {
    if (admin.ws.readyState === WebSocket.OPEN) {
      admin.ws.ping();
    }

    if (admin.lobby) {
      Object.values(admin.lobby.players).forEach((player) => {
        if (player.ws.readyState === WebSocket.OPEN) {
          player.ws.ping();
        }
      });
    }
  });

  setTimeout(pingEveryone, 2000);
}

function initAdminOnClose(ws, adminName) {
  ws.on('close', () => {
    console.log(`Admin ${adminName} disconnected from lobby`);
    if (!_.isEmpty(players)) {
      console.log('Closing connection for all players');
      Object.values(players).forEach((player) => {
        if (player.ws && player.ws.readyState === WebSocket.OPEN) {
          console.log(`Closing connection for player ${player.name}`);
          player.ws.close();
          delete players[players.name];
        }
      });
    }

    console.log(`Deleting lobby ${adminName} and admin ${adminName}`);
    delete lobbies[adminName];
    delete admins[adminName];
  });
}

function initPlayerOnClose(ws, player) {
  ws.on('close', () => {
    console.log(`Player ${player.name} disconnected`);
    if (player.lobby && player.lobby.admin && player.lobby.admin.ws.readyState === WebSocket.OPEN) {
      player.lobby.admin.ws.send(JSON.stringify(new Request({
        payload: { user: { userName: player.name } },
        command: 'userDisconnect',
      })));
    }
    delete players[player.name];
  });
}

function sendError(ws, error, command) {
  const errorResponse = new Response({
    command,
    error,
  });
  console.log(errorResponse);
  ws.send(JSON.stringify(errorResponse));
}

function sendCb(ws, message, command) {
  const callBackResponse = new Response({
    command,
    message,
  });
  console.log(callBackResponse);
  ws.send(JSON.stringify(callBackResponse));
}

wsServer.on('connection', (ws) => {
  console.log('Someone`s connected!');

  const response = new Response({
    command: 'connect',
    message: 'connected',
  });

  ws.send(JSON.stringify(response));

  ws.on('message', (message) => {
    console.log('the message is: ', String(message));
    const {
      payload: {
        user, lobbyName, stateData, speedTest, onlineVideo, target,
      }, command,
    } = JSON.parse(String(message));

    if (user.userType === 'Admin') {
      if (!admins[user.userName]) {
        admins[user.userName] = { ws, name: user.userName };
        initAdminOnClose(ws, user.userName);
      }

      const admin = admins[user.userName];
      const { ws: adminWs, name: adminName } = admin;

      if (command === 'createLobby') {
        if (!lobbies[adminName]) {
          lobbies[adminName] = { admin, players: {} };
          admin.lobby = lobbies[adminName];

          sendCb(
            adminWs,
            `Lobby ${adminName} is created`,
            command,
          );
        } else {
          lobbies[adminName].admin = admin;
          admin.lobby = lobbies[adminName];

          Object.values(admin.lobby.players).forEach((player) => {
            const request = new Request({
              payload: { user: { userName: player.name } },
              command: 'joinLobby',
            });

            admin.ws.send(JSON.stringify(request));
          });

          sendCb(
            adminWs,
            `Lobby ${adminName} reassigned to new admin`,
            command,
          );
        }
      }

      if (command === 'startDemo') {
        const request = new Request({
          payload: {},
          command,
        });

        const player = admin.lobby.players[target];
        const playerWs = player ? player.ws : undefined;

        if (player && playerWs.readyState === WebSocket.OPEN) {
          playerWs.send(JSON.stringify(request));

          sendCb(
            adminWs,
            `Demo started on user ${player.name}`,
            command,
          );
        } else {
          sendError(
            adminWs,
            `client: ${target}, ws status: ${playerWs ? playerWs.readyState : null}`,
            command,
          );
        }
      }

      if (command === 'broadCastSpeedTest') {
        const request = new Request({
          payload: { speedTest },
          command: 'onSpeedTest',
        });

        if (!_.isEmpty(admin.lobby.players)) {
          Object.values(admin.lobby.players)
            .forEach((player) => {
              if (player.ws.readyState === WebSocket.OPEN) {
                console.log(`speed test ${speedTest} sent to player ${player.name}`);
                player.ws.send(JSON.stringify(request));
              } else {
                sendError(
                  adminWs,
                  `error: client ${player.name}, ws status: ${player.ws.readyState}`,
                  command,
                );
              }
            });
        } else {
          sendError(adminWs, `Ошибка сервер ${admin.name} пустой, подключите клиентов перед замером скорости`, command);
        }
      }

      if (command === 'toggleOnlineVideo') {
        const request = new Request({
          payload: { onlineVideo },
          command,
        });

        const player = admin.lobby.players[target] ? admin.lobby.players[target] : undefined;
        const playerWs = player ? player.ws : undefined;

        if (playerWs && playerWs.readyState === WebSocket.OPEN) {
          console.log(`Setting video status to ${onlineVideo} on client ${player.name}`);
          playerWs.send(JSON.stringify(request));
        } else {
          sendError(
            adminWs,
            `error: can't set video status on client ${player ? player.name : null}, client ws status: ${playerWs ? playerWs.readyState : null}`,
            command,
          );
        }
      }
    }

    if (user.userType === 'Player') {
      if (!players[user.userName]) {
        players[user.userName] = { ws, name: user.userName };
        initPlayerOnClose(ws, players[user.userName]);
      }

      const player = players[user.userName];
      const { ws: playerWs, name: playerName } = player;

      if (command === 'toggleOnlineVideoConfirm') {
        const request = new Request({
          payload: { user },
          command,
        });

        if (lobbies[lobbyName]) {
          const { admin } = lobbies[lobbyName];
          admin.ws.send(JSON.stringify(request));
        }
      }

      if (command === 'joinLobby') {
        if (!lobbies[lobbyName]) {
          sendError(
            playerWs,
            `Не найден сервер с номером ${lobbyName}`,
            command,
          );

          return;
        }
        if (!lobbies[lobbyName].players[playerName]) {
          lobbies[lobbyName].players[playerName] = player;
          player.lobby = lobbies[lobbyName];
        } else {
          sendError(
            playerWs,
            `Клиент с таким именем ${playerName} уже существует, смените имя`,
            command,
          );

          return;
        }
        const { admin } = lobbies[lobbyName];

        const request = new Request({
          payload: { user },
          command: 'joinLobby',
        });

        console.log('request', request);

        if (playerWs && playerWs.readyState === WebSocket.OPEN) {
          console.log(`User ${user.userName} joins lobby ${lobbyName}`);
          console.log('request', request);
          admin.ws.send(JSON.stringify(request));
          playerWs.send(JSON.stringify(new Response({
            command,
          })));
        } else {
          sendError(
            admin.ws,
            'lobbyName is empty!',
            command,
          );
        }
      }

      if (command === 'refreshData' && lobbies[lobbyName] && lobbies[lobbyName].players[user.userName]) {
        const request = new Request({
          payload: { stateData, user },
          command: 'refreshData',
        });

        console.log(JSON.stringify(request));
        lobbies[lobbyName].admin.ws.send(JSON.stringify(request));
      }
    }

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(`Hello, you sent -> ${String(message)}`);
    }
  });
});

server.listen(process.env.PORT || 8999, () => {
  console.log(`Server started on port ${server.address().port} :)`);
});

pingEveryone();
