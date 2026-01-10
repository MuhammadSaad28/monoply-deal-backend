import { v4 as uuidv4 } from 'uuid';
import {
  GameState, Player, Card, PropertyCard, ActionCard, RentCard,
  PropertySet, PropertyColor, PendingAction, ActionResponse,
  PlayCardTarget, TurnPhase
} from '../types/game.js';
import { createDeck, shuffleDeck, PROPERTY_SET_REQUIREMENTS, RENT_VALUES } from './cards.js';

export function createGameState(roomCode: string): GameState {
  return {
    id: uuidv4(),
    roomCode,
    players: [],
    currentPlayerIndex: 0,
    deck: shuffleDeck(createDeck()),
    discardPile: [],
    phase: 'waiting',
    turnPhase: 'draw',
    actionsRemaining: 3,
    pendingAction: null,
    winner: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

export function addPlayer(state: GameState, name: string, socketId: string): Player {
  const player: Player = {
    id: uuidv4(),
    name,
    hand: [],
    properties: [],
    bank: [],
    isConnected: true,
    socketId
  };
  state.players.push(player);
  state.updatedAt = new Date();
  return player;
}

export function removePlayer(state: GameState, playerId: string): void {
  const index = state.players.findIndex(p => p.id === playerId);
  if (index !== -1) {
    state.players.splice(index, 1);
    if (state.currentPlayerIndex >= state.players.length) {
      state.currentPlayerIndex = 0;
    }
    state.updatedAt = new Date();
  }
}

export function startGame(state: GameState): void {
  if (state.players.length < 2) {
    throw new Error('Need at least 2 players to start');
  }
  if (state.players.length > 5) {
    throw new Error('Maximum 5 players allowed');
  }

  state.deck = shuffleDeck(createDeck());
  state.discardPile = [];
  state.phase = 'playing';
  state.turnPhase = 'draw';
  state.currentPlayerIndex = 0;
  state.actionsRemaining = 3;

  // Deal 5 cards to each player
  for (const player of state.players) {
    player.hand = [];
    player.properties = [];
    player.bank = [];
    for (let i = 0; i < 5; i++) {
      const card = state.deck.pop();
      if (card) player.hand.push(card);
    }
  }

  state.updatedAt = new Date();
}

export function drawCards(state: GameState, playerId: string): Card[] {
  const player = state.players.find(p => p.id === playerId);
  if (!player) throw new Error('Player not found');
  
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer.id !== playerId) throw new Error('Not your turn');
  if (state.turnPhase !== 'draw') throw new Error('Cannot draw cards now');

  const drawnCards: Card[] = [];
  const cardsToDraw = player.hand.length === 0 ? 5 : 2;

  for (let i = 0; i < cardsToDraw; i++) {
    if (state.deck.length === 0) {
      // Reshuffle discard pile
      state.deck = shuffleDeck([...state.discardPile]);
      state.discardPile = [];
    }
    const card = state.deck.pop();
    if (card) {
      player.hand.push(card);
      drawnCards.push(card);
    }
  }

  state.turnPhase = 'action';
  state.updatedAt = new Date();
  return drawnCards;
}

export function playCard(
  state: GameState, 
  playerId: string, 
  cardId: string, 
  target?: PlayCardTarget
): void {
  const player = state.players.find(p => p.id === playerId);
  if (!player) throw new Error('Player not found');
  
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer.id !== playerId) throw new Error('Not your turn');
  if (state.turnPhase !== 'action') throw new Error('Cannot play cards now');
  if (state.actionsRemaining <= 0) throw new Error('No actions remaining');

  const cardIndex = player.hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) throw new Error('Card not in hand');

  const card = player.hand[cardIndex];
  player.hand.splice(cardIndex, 1);

  // Handle different card types
  if (target?.asBank || card.type === 'money') {
    player.bank.push(card);
  } else if (card.type === 'property') {
    playPropertyCard(state, player, card as PropertyCard, target?.propertySetColor);
  } else if (card.type === 'action') {
    playActionCard(state, player, card as ActionCard, target);
  } else if (card.type === 'rent') {
    playRentCard(state, player, card as RentCard, target);
  }

  state.actionsRemaining--;
  
  // Check for winner
  checkWinner(state);
  
  // Check if turn should end - go to finishing phase to allow rearranging
  if (state.actionsRemaining <= 0 && !state.pendingAction) {
    if (player.hand.length > 7) {
      state.turnPhase = 'discard';
    } else {
      state.turnPhase = 'finishing'; // Allow player to rearrange before ending
    }
  }

  state.updatedAt = new Date();
}

function playPropertyCard(
  state: GameState, 
  player: Player, 
  card: PropertyCard, 
  targetColor?: PropertyColor
): void {
  const color = targetColor || card.color;
  
  // Validate wildcard placement
  if (card.isWildcard && card.wildcardColors && !card.wildcardColors.includes(color)) {
    throw new Error('Invalid color for wildcard');
  }

  let propertySet = player.properties.find(s => s.color === color);
  
  if (!propertySet) {
    propertySet = {
      color,
      cards: [],
      hasHouse: false,
      hasHotel: false,
      isComplete: false
    };
    player.properties.push(propertySet);
  }

  propertySet.cards.push(card);
  updatePropertySetCompletion(propertySet);
}

function playActionCard(
  state: GameState, 
  player: Player, 
  card: ActionCard, 
  target?: PlayCardTarget
): void {
  switch (card.action) {
    case 'passGo':
      // Draw 2 cards
      for (let i = 0; i < 2; i++) {
        if (state.deck.length === 0) {
          state.deck = shuffleDeck([...state.discardPile]);
          state.discardPile = [];
        }
        const drawnCard = state.deck.pop();
        if (drawnCard) player.hand.push(drawnCard);
      }
      state.discardPile.push(card);
      break;

    case 'birthday':
      // All players pay $2M
      state.pendingAction = {
        type: 'birthday',
        fromPlayerId: player.id,
        amount: 2,
        card,
        canSayNo: true,
        respondedPlayers: [] // Track who has responded
      };
      state.turnPhase = 'responding';
      break;

    case 'debtCollector':
      if (!target?.playerId) throw new Error('Must select a player');
      state.pendingAction = {
        type: 'debtCollector',
        fromPlayerId: player.id,
        toPlayerId: target.playerId,
        amount: 5,
        card,
        canSayNo: true
      };
      state.turnPhase = 'responding';
      break;

    case 'slyDeal':
      if (!target?.playerId || !target?.propertySetColor) {
        throw new Error('Must select a player and property');
      }
      state.pendingAction = {
        type: 'slyDeal',
        fromPlayerId: player.id,
        toPlayerId: target.playerId,
        targetSet: target.propertySetColor,
        card,
        canSayNo: true
      };
      state.turnPhase = 'responding';
      break;

    case 'forcedDeal':
      if (!target?.playerId || !target?.propertySetColor) {
        throw new Error('Must select a player and property');
      }
      state.pendingAction = {
        type: 'forcedDeal',
        fromPlayerId: player.id,
        toPlayerId: target.playerId,
        targetSet: target.propertySetColor,
        card,
        canSayNo: true
      };
      state.turnPhase = 'responding';
      break;

    case 'dealBreaker':
      if (!target?.playerId || !target?.propertySetColor) {
        throw new Error('Must select a player and complete set');
      }
      const targetPlayer = state.players.find(p => p.id === target.playerId);
      const targetSet = targetPlayer?.properties.find(s => s.color === target.propertySetColor);
      if (!targetSet?.isComplete) {
        throw new Error('Can only steal complete sets');
      }
      state.pendingAction = {
        type: 'dealBreaker',
        fromPlayerId: player.id,
        toPlayerId: target.playerId,
        targetSet: target.propertySetColor,
        card,
        canSayNo: true
      };
      state.turnPhase = 'responding';
      break;

    case 'house':
      if (!target?.propertySetColor) throw new Error('Must select a property set');
      const houseSet = player.properties.find(s => s.color === target.propertySetColor);
      if (!houseSet?.isComplete) throw new Error('Set must be complete');
      if (houseSet.hasHouse) throw new Error('Set already has a house');
      houseSet.hasHouse = true;
      houseSet.cards.push(card);
      break;

    case 'hotel':
      if (!target?.propertySetColor) throw new Error('Must select a property set');
      const hotelSet = player.properties.find(s => s.color === target.propertySetColor);
      if (!hotelSet?.isComplete) throw new Error('Set must be complete');
      if (!hotelSet.hasHouse) throw new Error('Must have a house first');
      if (hotelSet.hasHotel) throw new Error('Set already has a hotel');
      hotelSet.hasHotel = true;
      hotelSet.cards.push(card);
      break;

    case 'doubleRent':
      // This should be played with a rent card - store for next rent
      player.hand.push(card); // Put back in hand
      state.actionsRemaining++; // Refund action
      throw new Error('Double Rent must be played with a Rent card');

    case 'justSayNo':
      // Can only be played in response
      player.hand.push(card);
      state.actionsRemaining++;
      throw new Error('Just Say No can only be played in response');
  }
}

function playRentCard(
  state: GameState, 
  player: Player, 
  card: RentCard, 
  target?: PlayCardTarget
): void {
  // Find a matching property set
  const matchingSet = player.properties.find(s => card.colors.includes(s.color));
  if (!matchingSet) {
    throw new Error('You need a matching property to charge rent');
  }

  const rentAmount = calculateRent(matchingSet);

  if (card.isWildRent) {
    // Wild rent targets one player
    if (!target?.playerId) throw new Error('Must select a player for wild rent');
    state.pendingAction = {
      type: 'rent',
      fromPlayerId: player.id,
      toPlayerId: target.playerId,
      amount: rentAmount,
      card,
      canSayNo: true
    };
  } else {
    // Regular rent targets all players
    state.pendingAction = {
      type: 'rent',
      fromPlayerId: player.id,
      amount: rentAmount,
      card,
      canSayNo: true,
      respondedPlayers: [] // Track who has responded for multi-player rent
    };
  }
  
  state.turnPhase = 'responding';
  state.discardPile.push(card);
}

function calculateRent(propertySet: PropertySet): number {
  const baseRent = RENT_VALUES[propertySet.color];
  const propertyCount = propertySet.cards.filter(c => 
    c.type === 'property' || (c as PropertyCard).isWildcard
  ).length;
  
  let rent = baseRent[Math.min(propertyCount - 1, baseRent.length - 1)] || 0;
  
  if (propertySet.hasHouse) rent += 3;
  if (propertySet.hasHotel) rent += 4;
  
  return rent;
}

export function respondToAction(
  state: GameState, 
  playerId: string, 
  response: ActionResponse
): void {
  if (!state.pendingAction) throw new Error('No pending action');
  
  const player = state.players.find(p => p.id === playerId);
  if (!player) throw new Error('Player not found');

  const fromPlayer = state.players.find(p => p.id === state.pendingAction!.fromPlayerId);
  if (!fromPlayer) throw new Error('Action initiator not found');

  // Check if this is a multi-player action (birthday or rent without specific target)
  const isMultiPlayerAction = state.pendingAction.respondedPlayers !== undefined;
  
  // Check if player already responded
  if (isMultiPlayerAction && state.pendingAction.respondedPlayers!.includes(playerId)) {
    throw new Error('You have already responded to this action');
  }

  // Handle Just Say No
  if (response.useJustSayNo) {
    const justSayNoIndex = player.hand.findIndex(
      c => c.type === 'action' && (c as ActionCard).action === 'justSayNo'
    );
    if (justSayNoIndex === -1) throw new Error('No Just Say No card');
    
    const justSayNo = player.hand.splice(justSayNoIndex, 1)[0];
    state.discardPile.push(justSayNo);
    
    // For multi-player actions, Just Say No only cancels for this player
    if (isMultiPlayerAction) {
      state.pendingAction.respondedPlayers!.push(playerId);
      
      // Check if all other players have responded
      const otherPlayers = state.players.filter(p => p.id !== state.pendingAction!.fromPlayerId);
      const allResponded = otherPlayers.every(p => state.pendingAction!.respondedPlayers!.includes(p.id));
      
      if (allResponded) {
        state.pendingAction = null;
        
        const currentPlayer = state.players[state.currentPlayerIndex];
        if (state.actionsRemaining <= 0) {
          if (currentPlayer.hand.length > 7) {
            state.turnPhase = 'discard';
          } else {
            state.turnPhase = 'finishing'; // Allow rearranging before ending turn
          }
        } else {
          state.turnPhase = 'action';
        }
      }
      state.updatedAt = new Date();
      return;
    }
    
    // For single-target actions, check if initiator wants to counter
    const initiatorJustSayNo = fromPlayer.hand.find(
      c => c.type === 'action' && (c as ActionCard).action === 'justSayNo'
    );
    
    if (initiatorJustSayNo) {
      // Swap pending action to allow counter
      state.pendingAction = {
        ...state.pendingAction,
        fromPlayerId: playerId,
        toPlayerId: state.pendingAction.fromPlayerId,
        canSayNo: true
      };
      return;
    }
    
    // Action cancelled
    state.pendingAction = null;
    
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (state.actionsRemaining <= 0) {
      if (currentPlayer.hand.length > 7) {
        state.turnPhase = 'discard';
      } else {
        state.turnPhase = 'finishing'; // Allow rearranging before ending turn
      }
    } else {
      state.turnPhase = 'action';
    }
    state.updatedAt = new Date();
    return;
  }

  // Handle payment
  if (response.accept && response.paymentCardIds && state.pendingAction.amount) {
    const totalValue = response.paymentCardIds.reduce((sum, cardId) => {
      const bankCard = player.bank.find(c => c.id === cardId);
      const propCard = player.properties.flatMap(s => s.cards).find(c => c.id === cardId);
      return sum + (bankCard?.value || propCard?.value || 0);
    }, 0);

    // Remove cards from player
    for (const cardId of response.paymentCardIds) {
      const bankIndex = player.bank.findIndex(c => c.id === cardId);
      if (bankIndex !== -1) {
        const card = player.bank.splice(bankIndex, 1)[0];
        fromPlayer.bank.push(card);
      } else {
        // Remove from properties
        for (const set of player.properties) {
          const propIndex = set.cards.findIndex(c => c.id === cardId);
          if (propIndex !== -1) {
            const card = set.cards.splice(propIndex, 1)[0];
            if (card.type === 'property') {
              playPropertyCard(state, fromPlayer, card as PropertyCard);
            } else {
              fromPlayer.bank.push(card);
            }
            updatePropertySetCompletion(set);
            break;
          }
        }
      }
    }

    // Clean up empty property sets
    player.properties = player.properties.filter(s => s.cards.length > 0);
  }

  // Handle specific action completions (only for single-target actions)
  if (response.accept && !isMultiPlayerAction) {
    switch (state.pendingAction.type) {
      case 'slyDeal':
        executeSlyDeal(state, fromPlayer, player, state.pendingAction.targetSet!);
        break;
      case 'forcedDeal':
        executeForcedDeal(state, fromPlayer, player, state.pendingAction.targetSet!);
        break;
      case 'dealBreaker':
        executeDealBreaker(state, fromPlayer, player, state.pendingAction.targetSet!);
        break;
    }
  }

  // For multi-player actions, track response and check if all have responded
  if (isMultiPlayerAction) {
    state.pendingAction.respondedPlayers!.push(playerId);
    
    // Check if all other players have responded
    const otherPlayers = state.players.filter(p => p.id !== state.pendingAction!.fromPlayerId);
    const allResponded = otherPlayers.every(p => state.pendingAction!.respondedPlayers!.includes(p.id));
    
    if (!allResponded) {
      // Still waiting for more responses
      state.updatedAt = new Date();
      return;
    }
  }

  state.pendingAction = null;
  
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (state.actionsRemaining <= 0) {
    if (currentPlayer.hand.length > 7) {
      state.turnPhase = 'discard';
    } else {
      state.turnPhase = 'finishing'; // Allow rearranging before ending turn
    }
  } else {
    state.turnPhase = 'action';
  }

  state.updatedAt = new Date();
}

function executeSlyDeal(
  state: GameState, 
  fromPlayer: Player, 
  toPlayer: Player, 
  targetColor: PropertyColor
): void {
  const targetSet = toPlayer.properties.find(s => s.color === targetColor);
  if (!targetSet || targetSet.isComplete) return;

  const card = targetSet.cards.pop();
  if (card && card.type === 'property') {
    playPropertyCard(state, fromPlayer, card as PropertyCard, targetColor);
  }
  updatePropertySetCompletion(targetSet);
  toPlayer.properties = toPlayer.properties.filter(s => s.cards.length > 0);
}

function executeForcedDeal(
  state: GameState, 
  fromPlayer: Player, 
  toPlayer: Player, 
  targetColor: PropertyColor
): void {
  // Similar to sly deal but requires giving a property back
  // Simplified: just steal one property
  executeSlyDeal(state, fromPlayer, toPlayer, targetColor);
}

function executeDealBreaker(
  state: GameState, 
  fromPlayer: Player, 
  toPlayer: Player, 
  targetColor: PropertyColor
): void {
  const targetSetIndex = toPlayer.properties.findIndex(s => s.color === targetColor);
  if (targetSetIndex === -1) return;

  const targetSet = toPlayer.properties.splice(targetSetIndex, 1)[0];
  fromPlayer.properties.push(targetSet);
}

function updatePropertySetCompletion(set: PropertySet): void {
  const propertyCount = set.cards.filter(c => 
    c.type === 'property'
  ).length;
  set.isComplete = propertyCount >= PROPERTY_SET_REQUIREMENTS[set.color];
}

export function discardCards(state: GameState, playerId: string, cardIds: string[]): void {
  const player = state.players.find(p => p.id === playerId);
  if (!player) throw new Error('Player not found');
  
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer.id !== playerId) throw new Error('Not your turn');
  if (state.turnPhase !== 'discard') throw new Error('Not in discard phase');

  const cardsToDiscard = player.hand.length - 7;
  if (cardIds.length !== cardsToDiscard) {
    throw new Error(`Must discard exactly ${cardsToDiscard} cards`);
  }

  for (const cardId of cardIds) {
    const index = player.hand.findIndex(c => c.id === cardId);
    if (index === -1) throw new Error('Card not in hand');
    const card = player.hand.splice(index, 1)[0];
    state.discardPile.push(card);
  }

  endTurn(state);
  state.updatedAt = new Date();
}

function endTurn(state: GameState): void {
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  state.turnPhase = 'draw';
  state.actionsRemaining = 3;
  state.pendingAction = null;
}

// Player chooses to end their turn early (0, 1, or 2 actions used) or confirm end after all actions
export function endTurnEarly(state: GameState, playerId: string): void {
  const player = state.players.find(p => p.id === playerId);
  if (!player) throw new Error('Player not found');
  
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer.id !== playerId) throw new Error('Not your turn');
  if (state.turnPhase !== 'action' && state.turnPhase !== 'finishing') throw new Error('Cannot end turn now');
  if (state.pendingAction) throw new Error('Must resolve pending action first');

  // Check if player needs to discard
  if (player.hand.length > 7) {
    state.turnPhase = 'discard';
  } else {
    endTurn(state);
  }
  
  state.updatedAt = new Date();
}

function checkWinner(state: GameState): void {
  for (const player of state.players) {
    const completeSets = player.properties.filter(s => s.isComplete).length;
    if (completeSets >= 3) {
      state.winner = player.id;
      state.phase = 'finished';
      return;
    }
  }
}

// Rearrange a wildcard property from one set to another (free action during your turn)
export function rearrangeProperty(
  state: GameState,
  playerId: string,
  cardId: string,
  fromColor: PropertyColor,
  toColor: PropertyColor
): void {
  const player = state.players.find(p => p.id === playerId);
  if (!player) throw new Error('Player not found');

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer.id !== playerId) throw new Error('Not your turn');
  if (state.turnPhase !== 'action' && state.turnPhase !== 'finishing') throw new Error('Cannot rearrange now');

  // Find the card in the source set
  const fromSet = player.properties.find(s => s.color === fromColor);
  if (!fromSet) throw new Error('Source property set not found');

  const cardIndex = fromSet.cards.findIndex(c => c.id === cardId);
  if (cardIndex === -1) throw new Error('Card not found in source set');

  const card = fromSet.cards[cardIndex] as PropertyCard;
  
  // Only wildcards can be rearranged
  if (!card.isWildcard) throw new Error('Only wildcard properties can be rearranged');
  
  // Check if the wildcard can go to the target color
  if (card.wildcardColors && !card.wildcardColors.includes(toColor)) {
    throw new Error('This wildcard cannot be placed on that color');
  }

  // Remove from source set
  fromSet.cards.splice(cardIndex, 1);
  updatePropertySetCompletion(fromSet);

  // Add to target set (create if doesn't exist)
  let toSet = player.properties.find(s => s.color === toColor);
  if (!toSet) {
    toSet = {
      color: toColor,
      cards: [],
      hasHouse: false,
      hasHotel: false,
      isComplete: false
    };
    player.properties.push(toSet);
  }

  toSet.cards.push(card);
  updatePropertySetCompletion(toSet);

  // Clean up empty sets
  player.properties = player.properties.filter(s => s.cards.length > 0);

  state.updatedAt = new Date();
}

export function getPublicGameState(state: GameState, forPlayerId?: string): GameState {
  // Hide other players' hands
  return {
    ...state,
    players: state.players.map(p => ({
      ...p,
      hand: p.id === forPlayerId ? p.hand : p.hand.map(() => ({ 
        id: 'hidden', 
        type: 'money' as const, 
        name: 'Hidden', 
        value: 0, 
        image: 'card-back' 
      }))
    }))
  };
}
