import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  Room,
  ChatMessage,
  GameState,
  Player,
  Card,
  PropertyCard,
  ActionCard,
  PropertyColor
} from '../types/game.js';
import {
  createGameState,
  addPlayer,
  removePlayer,
  startGame,
  drawCards,
  playCard,
  discardCards,
  respondToAction,
  getPublicGameState,
  endTurnEarly,
  rearrangeProperty
} from '../game/gameLogic.js';
import {
  saveGameState,
  loadGameState,
  deleteGameState,
  saveChatMessage,
  getChatMessages
} from '../db/mongodb.js';

// Property color display names
const COLOR_NAMES: Record<PropertyColor, string> = {
  brown: 'Brown',
  lightBlue: 'Light Blue',
  pink: 'Pink',
  orange: 'Orange',
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  darkBlue: 'Dark Blue',
  railroad: 'Black',
  utility: 'Light Green'
};

// In-memory room storage for active games
const rooms: Map<string, Room> = new Map();
const playerRooms: Map<string, string> = new Map();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function sendGameLog(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: Room,
  message: string
): Promise<void> {
  const logMessage: ChatMessage = {
    id: uuidv4(),
    playerId: 'game',
    playerName: '🎮 Game',
    message,
    timestamp: new Date(),
    type: 'system'
  };
  room.chatMessages.push(logMessage);
  await saveChatMessage(room.code, logMessage);
  io.to(room.code).emit('chatMessage', logMessage);
}

async function getOrCreateRoom(roomCode: string): Promise<Room | null> {
  let room = rooms.get(roomCode);
  if (room) return room;

  const savedState = await loadGameState(roomCode);
  if (savedState) {
    room = {
      code: roomCode,
      gameState: savedState,
      chatMessages: await getChatMessages(roomCode)
    };
    rooms.set(roomCode, room);
    return room;
  }
  return null;
}

function getCardDescription(card: Card, target?: { propertySetColor?: PropertyColor; playerId?: string; asBank?: boolean }, players?: Player[]): string {
  if (target?.asBank) {
    return `$${card.value}M to bank`;
  }
  
  if (card.type === 'property') {
    const prop = card as PropertyCard;
    if (prop.isWildcard) {
      return `Wild Property (${COLOR_NAMES[target?.propertySetColor || prop.color]})`;
    }
    return `${prop.name} (${COLOR_NAMES[prop.color]})`;
  }
  
  if (card.type === 'money') {
    return `$${card.value}M`;
  }
  
  if (card.type === 'action') {
    const action = card as ActionCard;
    const targetPlayer = players?.find(p => p.id === target?.playerId);
    const colorName = target?.propertySetColor ? COLOR_NAMES[target.propertySetColor] : '';
    
    switch (action.action) {
      case 'passGo': return 'Pass Go (drew 2 cards)';
      case 'birthday': return "It's My Birthday! ($2M from everyone)";
      case 'debtCollector': return `Debt Collector ($5M from ${targetPlayer?.name || 'opponent'})`;
      case 'slyDeal': return `Sly Deal (stole ${colorName} property from ${targetPlayer?.name || 'opponent'})`;
      case 'forcedDeal': return `Forced Deal (traded with ${targetPlayer?.name || 'opponent'})`;
      case 'dealBreaker': return `Deal Breaker (stole ${colorName} set from ${targetPlayer?.name || 'opponent'})`;
      case 'house': return `House (on ${colorName} set)`;
      case 'hotel': return `Hotel (on ${colorName} set)`;
      default: return action.name;
    }
  }
  
  if (card.type === 'rent') {
    const targetPlayer = players?.find(p => p.id === target?.playerId);
    if (targetPlayer) {
      return `Rent (charged ${targetPlayer.name})`;
    }
    return 'Rent (charged all players)';
  }
  
  return card.name;
}

export function setupSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>
): void {
  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('createRoom', async (playerName, callback) => {
      try {
        let roomCode = generateRoomCode();
        while (rooms.has(roomCode) || await loadGameState(roomCode)) {
          roomCode = generateRoomCode();
        }

        const gameState = createGameState(roomCode);
        const player = addPlayer(gameState, playerName, socket.id);

        const room: Room = {
          code: roomCode,
          gameState,
          chatMessages: []
        };

        rooms.set(roomCode, room);
        playerRooms.set(socket.id, roomCode);
        socket.join(roomCode);

        await saveGameState(gameState);

        const systemMessage: ChatMessage = {
          id: uuidv4(),
          playerId: 'system',
          playerName: 'System',
          message: `${playerName} created the room`,
          timestamp: new Date(),
          type: 'system'
        };
        room.chatMessages.push(systemMessage);
        await saveChatMessage(roomCode, systemMessage);

        callback({ roomCode });
        socket.emit('gameState', getPublicGameState(gameState, player.id));
      } catch (error) {
        console.error('Error creating room:', error);
        callback({ error: 'Failed to create room' });
      }
    });

    socket.on('joinRoom', async (roomCode, playerName, callback) => {
      try {
        const room = await getOrCreateRoom(roomCode.toUpperCase());
        if (!room) {
          callback({ success: false, error: 'Room not found' });
          return;
        }

        if (room.gameState.phase !== 'waiting') {
          const existingPlayer = room.gameState.players.find(
            p => p.name === playerName && !p.isConnected
          );
          if (existingPlayer) {
            existingPlayer.isConnected = true;
            existingPlayer.socketId = socket.id;
            playerRooms.set(socket.id, roomCode);
            socket.join(roomCode);
            
            await saveGameState(room.gameState);
            await sendGameLog(io, room, `${playerName} reconnected`);
            
            callback({ success: true });
            socket.emit('gameState', getPublicGameState(room.gameState, existingPlayer.id));
            io.to(roomCode).emit('playerJoined', existingPlayer);
            return;
          }
          callback({ success: false, error: 'Game already in progress' });
          return;
        }

        if (room.gameState.players.length >= 5) {
          callback({ success: false, error: 'Room is full' });
          return;
        }

        const player = addPlayer(room.gameState, playerName, socket.id);
        playerRooms.set(socket.id, roomCode);
        socket.join(roomCode);

        await saveGameState(room.gameState);

        const systemMessage: ChatMessage = {
          id: uuidv4(),
          playerId: 'system',
          playerName: 'System',
          message: `${playerName} joined the room`,
          timestamp: new Date(),
          type: 'system'
        };
        room.chatMessages.push(systemMessage);
        await saveChatMessage(roomCode, systemMessage);

        callback({ success: true });
        
        io.to(roomCode).emit('playerJoined', player);
        io.to(roomCode).emit('chatMessage', systemMessage);
        
        room.gameState.players.forEach(p => {
          if (p.socketId) {
            io.to(p.socketId).emit('gameState', getPublicGameState(room.gameState, p.id));
          }
        });
      } catch (error) {
        console.error('Error joining room:', error);
        callback({ success: false, error: 'Failed to join room' });
      }
    });

    socket.on('startGame', async () => {
      try {
        const roomCode = playerRooms.get(socket.id);
        if (!roomCode) return;

        const room = rooms.get(roomCode);
        if (!room) return;

        const player = room.gameState.players.find(p => p.socketId === socket.id);
        if (!player || room.gameState.players[0].id !== player.id) {
          socket.emit('error', 'Only the host can start the game');
          return;
        }

        startGame(room.gameState);
        await saveGameState(room.gameState);

        await sendGameLog(io, room, `🎮 Game started! ${room.gameState.players[0].name}'s turn`);

        room.gameState.players.forEach(p => {
          if (p.socketId) {
            io.to(p.socketId).emit('gameState', getPublicGameState(room.gameState, p.id));
          }
        });
      } catch (error: any) {
        socket.emit('error', error.message);
      }
    });

    socket.on('drawCards', async () => {
      try {
        const roomCode = playerRooms.get(socket.id);
        if (!roomCode) return;

        const room = rooms.get(roomCode);
        if (!room) return;

        const player = room.gameState.players.find(p => p.socketId === socket.id);
        if (!player) return;

        const drawnCount = player.hand.length === 0 ? 5 : 2;
        drawCards(room.gameState, player.id);
        await saveGameState(room.gameState);

        await sendGameLog(io, room, `${player.name} drew ${drawnCount} cards`);

        room.gameState.players.forEach(p => {
          if (p.socketId) {
            io.to(p.socketId).emit('gameState', getPublicGameState(room.gameState, p.id));
          }
        });
      } catch (error: any) {
        socket.emit('error', error.message);
      }
    });

    socket.on('playCard', async (cardId, target) => {
      try {
        const roomCode = playerRooms.get(socket.id);
        if (!roomCode) return;

        const room = rooms.get(roomCode);
        if (!room) return;

        const player = room.gameState.players.find(p => p.socketId === socket.id);
        if (!player) return;

        // Get card info before playing
        const card = player.hand.find(c => c.id === cardId);
        if (!card) return;

        const cardDesc = getCardDescription(card, target, room.gameState.players);

        playCard(room.gameState, player.id, cardId, target);
        await saveGameState(room.gameState);

        // Log the action
        if (target?.asBank) {
          await sendGameLog(io, room, `💰 ${player.name} banked ${cardDesc}`);
        } else if (card.type === 'property') {
          await sendGameLog(io, room, `🏠 ${player.name} played ${cardDesc}`);
        } else if (card.type === 'action') {
          await sendGameLog(io, room, `⚡ ${player.name} played ${cardDesc}`);
        } else if (card.type === 'rent') {
          await sendGameLog(io, room, `💵 ${player.name} played ${cardDesc}`);
        } else {
          await sendGameLog(io, room, `${player.name} played ${cardDesc}`);
        }

        if (room.gameState.winner) {
          const winner = room.gameState.players.find(p => p.id === room.gameState.winner);
          if (winner) {
            await sendGameLog(io, room, `🏆 ${winner.name} WINS THE GAME! 🎉`);
            io.to(roomCode).emit('gameOver', winner.id, winner.name);
          }
        }

        room.gameState.players.forEach(p => {
          if (p.socketId) {
            io.to(p.socketId).emit('gameState', getPublicGameState(room.gameState, p.id));
          }
        });

        if (room.gameState.pendingAction) {
          io.to(roomCode).emit('actionRequired', room.gameState.pendingAction);
        }
      } catch (error: any) {
        socket.emit('error', error.message);
      }
    });

    socket.on('endTurn', async () => {
      try {
        const roomCode = playerRooms.get(socket.id);
        if (!roomCode) return;

        const room = rooms.get(roomCode);
        if (!room) return;

        const player = room.gameState.players.find(p => p.socketId === socket.id);
        if (!player) return;

        endTurnEarly(room.gameState, player.id);
        await saveGameState(room.gameState);

        const nextPlayer = room.gameState.players[room.gameState.currentPlayerIndex];
        
        if (room.gameState.turnPhase === 'discard') {
          await sendGameLog(io, room, `${player.name} must discard to 7 cards`);
        } else {
          await sendGameLog(io, room, `${player.name} ended turn. ${nextPlayer.name}'s turn`);
        }

        room.gameState.players.forEach(p => {
          if (p.socketId) {
            io.to(p.socketId).emit('gameState', getPublicGameState(room.gameState, p.id));
          }
        });
      } catch (error: any) {
        socket.emit('error', error.message);
      }
    });

    socket.on('discardCards', async (cardIds) => {
      try {
        const roomCode = playerRooms.get(socket.id);
        if (!roomCode) return;

        const room = rooms.get(roomCode);
        if (!room) return;

        const player = room.gameState.players.find(p => p.socketId === socket.id);
        if (!player) return;

        discardCards(room.gameState, player.id, cardIds);
        await saveGameState(room.gameState);

        const nextPlayer = room.gameState.players[room.gameState.currentPlayerIndex];
        await sendGameLog(io, room, `${player.name} discarded ${cardIds.length} card(s). ${nextPlayer.name}'s turn`);

        room.gameState.players.forEach(p => {
          if (p.socketId) {
            io.to(p.socketId).emit('gameState', getPublicGameState(room.gameState, p.id));
          }
        });
      } catch (error: any) {
        socket.emit('error', error.message);
      }
    });

    socket.on('respondToAction', async (response) => {
      try {
        const roomCode = playerRooms.get(socket.id);
        if (!roomCode) return;

        const room = rooms.get(roomCode);
        if (!room) return;

        const player = room.gameState.players.find(p => p.socketId === socket.id);
        if (!player) return;

        const pendingAction = room.gameState.pendingAction;
        
        respondToAction(room.gameState, player.id, response);
        await saveGameState(room.gameState);

        // Log the response
        if (response.useJustSayNo) {
          await sendGameLog(io, room, `🚫 ${player.name} played Just Say No!`);
        } else if (response.paymentCardIds && response.paymentCardIds.length > 0) {
          const totalPaid = response.paymentCardIds.length;
          await sendGameLog(io, room, `💸 ${player.name} paid with ${totalPaid} card(s)`);
        } else if (pendingAction) {
          await sendGameLog(io, room, `${player.name} accepted the action`);
        }

        room.gameState.players.forEach(p => {
          if (p.socketId) {
            io.to(p.socketId).emit('gameState', getPublicGameState(room.gameState, p.id));
          }
        });
      } catch (error: any) {
        socket.emit('error', error.message);
      }
    });

    socket.on('rearrangeProperty', async (cardId, fromColor, toColor) => {
      try {
        const roomCode = playerRooms.get(socket.id);
        if (!roomCode) return;

        const room = rooms.get(roomCode);
        if (!room) return;

        const player = room.gameState.players.find(p => p.socketId === socket.id);
        if (!player) return;

        rearrangeProperty(room.gameState, player.id, cardId, fromColor, toColor);
        await saveGameState(room.gameState);

        await sendGameLog(io, room, `🔄 ${player.name} moved a wildcard from ${COLOR_NAMES[fromColor]} to ${COLOR_NAMES[toColor]}`);

        // Check for winner after rearranging
        if (room.gameState.winner) {
          const winner = room.gameState.players.find(p => p.id === room.gameState.winner);
          if (winner) {
            await sendGameLog(io, room, `🏆 ${winner.name} WINS THE GAME! 🎉`);
            io.to(roomCode).emit('gameOver', winner.id, winner.name);
          }
        }

        room.gameState.players.forEach(p => {
          if (p.socketId) {
            io.to(p.socketId).emit('gameState', getPublicGameState(room.gameState, p.id));
          }
        });
      } catch (error: any) {
        socket.emit('error', error.message);
      }
    });

    socket.on('sendChat', async (message) => {
      try {
        const roomCode = playerRooms.get(socket.id);
        if (!roomCode) return;

        const room = rooms.get(roomCode);
        if (!room) return;

        const player = room.gameState.players.find(p => p.socketId === socket.id);
        if (!player) return;

        const chatMessage: ChatMessage = {
          id: uuidv4(),
          playerId: player.id,
          playerName: player.name,
          message: message.slice(0, 500),
          timestamp: new Date(),
          type: 'chat'
        };

        room.chatMessages.push(chatMessage);
        await saveChatMessage(roomCode, chatMessage);

        io.to(roomCode).emit('chatMessage', chatMessage);
      } catch (error) {
        console.error('Error sending chat:', error);
      }
    });

    socket.on('leaveRoom', async () => {
      await handleDisconnect(socket, io);
    });

    socket.on('disconnect', async () => {
      await handleDisconnect(socket, io);
    });
  });
}

async function handleDisconnect(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  io: Server<ClientToServerEvents, ServerToClientEvents>
): Promise<void> {
  const roomCode = playerRooms.get(socket.id);
  if (!roomCode) return;

  const room = rooms.get(roomCode);
  if (!room) return;

  const player = room.gameState.players.find(p => p.socketId === socket.id);
  if (!player) return;

  console.log(`Player ${player.name} disconnected from room ${roomCode}`);

  if (room.gameState.phase === 'waiting') {
    removePlayer(room.gameState, player.id);
    
    if (room.gameState.players.length === 0) {
      rooms.delete(roomCode);
      await deleteGameState(roomCode);
    } else {
      await saveGameState(room.gameState);
      io.to(roomCode).emit('playerLeft', player.id);
      
      await sendGameLog(io, room, `${player.name} left the room`);
      
      room.gameState.players.forEach(p => {
        if (p.socketId) {
          io.to(p.socketId).emit('gameState', getPublicGameState(room.gameState, p.id));
        }
      });
    }
  } else {
    player.isConnected = false;
    player.socketId = undefined;
    await saveGameState(room.gameState);
    
    io.to(roomCode).emit('playerLeft', player.id);
    await sendGameLog(io, room, `${player.name} disconnected`);
  }

  playerRooms.delete(socket.id);
  socket.leave(roomCode);
}
