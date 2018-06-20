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

  ws.on('message', (message) => {
    console.log('the message is: ', String(message));
    const {
      payload: {
        user, lobbyName, stateData, speedTest, onlineVid, target,
      }, command,
    } = JSON.parse(String(message));

    if (user.userType === 'Admin') {
      if (!admins[user.userName]) {
        admins[user.userName] = { ws, name: user.userName };
      } else {
        admins[user.userName].ws = ws;
      }

      const admin = admins[user.userName];
      const { ws: adminWs, name: adminName } = admin;


      ws.on('close', () => {
        console.log(`Admin ${adminName} disconnected from lobby`);
        const lobbyPlayers = admins[adminName].lobby.players;
        if (!_.isEmpty(players)) {
          console.log('Closing connection for all players');
          Object.values(players).forEach((player) => {
            if (lobbyPlayers.ws && lobbyPlayers.ws.readyState === WebSocket.OPEN) {
              console.log(`Closing connection for player ${player.name}`);
              player.ws.close();
              delete players[players.name];
            }
          });
        }

        console.log(`Deleting lobby ${adminName} and admin ${adminName}`);
        delete lobbies[adminName];
        delete adminName[adminName];
      });

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

          sendCb(
            adminWs,
            `Lobby ${adminName} reassigned to new admin`,
            command,
          );
        }
      }

      if (command === 'startDemo') {
        const request = {
          payload: {},
          command: {
            setType: 'playerCommands',
            command,
          },
        };

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
        const request = JSON.stringify({
          payload: { speedTest },
          command: {
            setType: 'playerCommands',
            command: 'onSpeedTest',
          },
        });

        if (!_.isEmpty(admin.lobby.players)) {
          Object.values(admin.lobby.players)
            .forEach((player) => {
              if (player.ws.readyState === WebSocket.OPEN) {
                console.log(`speed test ${speedTest} sent to player ${player.name}`);
                player.ws.send(request);
              } else {
                sendError(
                  adminWs,
                  `error: client ${player.name}, ws status: ${player.ws.readyState}`,
                  command,
                );
              }
            });
        } else {
          sendError(adminWs, 'error: lobbyName is empty!', command);
        }
      }

      if (command === 'toggleOnlineVideo') {
        const requset = JSON.stringify({
          payload: { onlineVid },
          command: {
            setType: 'playerCommands',
            command: 'toggleOnlineVideo',
          },
        });

        const player = admin.lobby.players[target];
        const playerWs = player ? player.ws : undefined;

        if (playerWs && playerWs.readyState === WebSocket.OPEN) {
          console.log(`Setting video status to ${onlineVid} on client ${player.name}`);
          playerWs.send(requset);
        } else {
          sendError(
            adminWs,
            `error: can't set video status on client ${player.name}, client ws status: ${playerWs ? playerWs.readyState : null}`,
            command,
          );
        }
      }
    }

    if (user.userType === 'Player') {
      if (!players[user.userName]) {
        players[user.userName] = { ws, name: user.userName };
      } else {
        players[user.userName].ws = ws;
      }

      const player = players[user.userName];
      const { ws: playerWs, name: playerName } = player;

      ws.on('close', () => {
        console.log(`Player ${playerName} disconnected`);
        delete players[playerName];

        if (player.lobby) {
          const request = {
            payload: { user },
            command: {
              setType: 'playerCommands',
              command: 'playerDisconnected',
            },
          };

          console.log(`Disconnecting player ${playerName} from server lobby`);
          player.lobby.admin.ws.send(JSON.stringify(request));
        }
      });

      if (command === 'joinLobby') {
        if (!lobbies[lobbyName]) {
          sendError(
            playerWs,
            `Не найдено лобби с именем ${lobbyName}`,
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
            `Client with name ${playerName} already in lobby, change name to join lobby`,
            command,
          );

          return;
        }
        const { admin } = lobbies[lobbyName];
        console.log('lobbies[lobbyName]', lobbies[lobbyName], lobbies);

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
        const onRefreshReq = {
          payload: { stateData, user },
          command: {
            setType: 'playerCommands',
            command: 'refreshData',
          },
        };

        console.log(JSON.stringify(onRefreshReq));
        lobbies[lobbyName].admin.ws.send(JSON.stringify(onRefreshReq));
      }
    }

    ws.send(`Hello, you sent -> ${String(message)}`);
  });
  ws.send('Hi there, I am a WebSocket1337 server');
});

server.listen(process.env.PORT || 8999, () => {
  console.log(`Server started on port ${server.address().port} :)`);
});
