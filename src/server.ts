import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectToDatabase } from './db/mongodb.js';
import { setupSocketHandlers } from './socket/gameSocket.js';
import { ServerToClientEvents, ClientToServerEvents } from './types/game.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
const corsOrigins = corsOrigin.split(',').map(o => o.trim());

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(cors({
  origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
  credentials: true
}));

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Monopoly Deal API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      websocket: 'ws://localhost:' + (process.env.PORT || 3001)
    }
  });
});

async function startServer() {
  try {
    await connectToDatabase();
    
    setupSocketHandlers(io);

    const PORT = process.env.PORT || 3001;
    const HOST = '0.0.0.0';
    httpServer.listen(Number(PORT), HOST, () => {
      console.log(`🎮 Monopoly Deal server running on port ${PORT}`);
      console.log(`📡 WebSocket ready for connections`);
      console.log(`🔗 CORS origins: ${corsOrigins.join(', ')}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
