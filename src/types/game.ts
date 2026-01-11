// Card Types
export type CardType = 'property' | 'money' | 'action' | 'rent' | 'wildcard';

export type PropertyColor = 
  | 'brown' | 'lightBlue' | 'pink' | 'orange' 
  | 'red' | 'yellow' | 'green' | 'darkBlue' 
  | 'railroad' | 'utility';

export interface Card {
  id: string;
  type: CardType;
  name: string;
  value: number;
  image: string;
}

export interface PropertyCard extends Card {
  type: 'property';
  color: PropertyColor;
  isWildcard: boolean;
  wildcardColors?: PropertyColor[];
  rentValues: number[];
}

export interface MoneyCard extends Card {
  type: 'money';
}

export interface ActionCard extends Card {
  type: 'action';
  action: ActionType;
}

export interface RentCard extends Card {
  type: 'rent';
  colors: PropertyColor[];
  isWildRent: boolean;
}

export type ActionType = 
  | 'dealBreaker' 
  | 'justSayNo' 
  | 'slyDeal' 
  | 'forcedDeal' 
  | 'debtCollector' 
  | 'birthday' 
  | 'passGo' 
  | 'house' 
  | 'hotel' 
  | 'doubleRent';

// Player Types
export interface Player {
  id: string;
  name: string;
  hand: Card[];
  properties: PropertySet[];
  bank: Card[];
  isConnected: boolean;
  socketId?: string;
}

export interface PropertySet {
  color: PropertyColor;
  cards: (PropertyCard | Card)[];
  hasHouse: boolean;
  hasHotel: boolean;
  isComplete: boolean;
}

// Game State
export type GamePhase = 'waiting' | 'playing' | 'finished';
export type TurnPhase = 'draw' | 'action' | 'discard' | 'responding' | 'finishing';

export interface PendingAction {
  type: ActionType | 'rent';
  fromPlayerId: string;
  toPlayerId?: string;
  amount?: number;
  card?: Card;
  targetProperty?: PropertyCard;
  targetSet?: PropertyColor;
  targetCardId?: string; // Specific card to steal (for sly deal)
  giveCardId?: string; // Card to give in exchange (for forced deal)
  giveFromSet?: PropertyColor; // Set to give from (for forced deal)
  canSayNo: boolean;
  respondedPlayers?: string[]; // Track who has responded for multi-player actions (birthday, rent all)
  isDoubleRent?: boolean; // Whether double rent is applied
}

export interface GameState {
  id: string;
  roomCode: string;
  players: Player[];
  currentPlayerIndex: number;
  deck: Card[];
  discardPile: Card[];
  phase: GamePhase;
  turnPhase: TurnPhase;
  actionsRemaining: number;
  pendingAction: PendingAction | null;
  winner: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Chat
export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  message: string;
  timestamp: Date;
  type: 'chat' | 'system';
}

// Socket Events
export interface ServerToClientEvents {
  gameState: (state: GameState) => void;
  playerJoined: (player: Player) => void;
  playerLeft: (playerId: string) => void;
  chatMessage: (message: ChatMessage) => void;
  error: (message: string) => void;
  actionRequired: (action: PendingAction) => void;
  gameOver: (winnerId: string, winnerName: string) => void;
}

export interface ClientToServerEvents {
  createRoom: (playerName: string, callback: (response: { roomCode?: string; error?: string }) => void) => void;
  joinRoom: (roomCode: string, playerName: string, callback: (response: { success: boolean; error?: string }) => void) => void;
  startGame: () => void;
  drawCards: () => void;
  playCard: (cardId: string, target?: PlayCardTarget) => void;
  discardCards: (cardIds: string[]) => void;
  endTurn: () => void;
  respondToAction: (response: ActionResponse) => void;
  rearrangeProperty: (cardId: string, fromColor: PropertyColor, toColor: PropertyColor) => void;
  sendChat: (message: string) => void;
  leaveRoom: () => void;
}

export interface PlayCardTarget {
  playerId?: string;
  propertySetColor?: PropertyColor;
  asBank?: boolean;
  targetCardId?: string; // Specific card to steal
  giveCardId?: string; // Card to give in exchange (forced deal)
  giveFromSet?: PropertyColor; // Set to give from (forced deal)
  useDoubleRent?: boolean; // Whether to use double rent
}

export interface ActionResponse {
  accept: boolean;
  useJustSayNo?: boolean;
  paymentCardIds?: string[];
  selectedCardId?: string; // Card selected by target player (for sly deal - they choose which to give)
}

// Room
export interface Room {
  code: string;
  gameState: GameState;
  chatMessages: ChatMessage[];
}
