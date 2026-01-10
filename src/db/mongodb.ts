import { MongoClient, Db, Collection } from 'mongodb';
import { GameState, ChatMessage } from '../types/game.js';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectToDatabase(): Promise<Db> {
  if (db) return db;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  client = new MongoClient(uri, {
    ssl: true,
    tls: true,
    tlsInsecure: false,
    directConnection: false,
    retryWrites: true,
    w: 'majority',
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000
  });
  await client.connect();
  db = client.db('monopoly-deal');

  console.log('Connected to MongoDB');
  return db;
}

export async function getGamesCollection(): Promise<Collection<GameState>> {
  const database = await connectToDatabase();
  return database.collection<GameState>('games');
}

export async function getChatCollection(): Promise<Collection<ChatMessage & { roomCode: string }>> {
  const database = await connectToDatabase();
  return database.collection<ChatMessage & { roomCode: string }>('chats');
}

export async function saveGameState(state: GameState): Promise<void> {
  const collection = await getGamesCollection();
  await collection.updateOne(
    { roomCode: state.roomCode },
    { $set: state },
    { upsert: true }
  );
}

export async function loadGameState(roomCode: string): Promise<GameState | null> {
  const collection = await getGamesCollection();
  return collection.findOne({ roomCode });
}

export async function deleteGameState(roomCode: string): Promise<void> {
  const collection = await getGamesCollection();
  await collection.deleteOne({ roomCode });
}

export async function saveChatMessage(roomCode: string, message: ChatMessage): Promise<void> {
  const collection = await getChatCollection();
  await collection.insertOne({ ...message, roomCode });
}

export async function getChatMessages(roomCode: string, limit: number = 50): Promise<ChatMessage[]> {
  const collection = await getChatCollection();
  const messages = await collection
    .find({ roomCode })
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
  return messages.reverse();
}

export async function closeConnection(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
