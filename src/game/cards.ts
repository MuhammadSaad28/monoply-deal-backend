import { v4 as uuidv4 } from 'uuid';
import { 
  Card, PropertyCard, MoneyCard, ActionCard, RentCard, 
  PropertyColor, ActionType 
} from '../types/game.js';

// Property set requirements
export const PROPERTY_SET_REQUIREMENTS: Record<PropertyColor, number> = {
  brown: 2,
  lightBlue: 3,
  pink: 3,
  orange: 3,
  red: 3,
  yellow: 3,
  green: 3,
  darkBlue: 2,
  railroad: 4,
  utility: 2
};

// Rent values for each property color
export const RENT_VALUES: Record<PropertyColor, number[]> = {
  brown: [1, 2],
  lightBlue: [1, 2, 3],
  pink: [1, 2, 4],
  orange: [1, 3, 5],
  red: [2, 3, 6],
  yellow: [2, 4, 6],
  green: [2, 4, 7],
  darkBlue: [3, 8],
  railroad: [1, 2, 3, 4],
  utility: [1, 2]
};

function createPropertyCard(
  name: string, 
  color: PropertyColor, 
  value: number,
  isWildcard: boolean = false,
  wildcardColors?: PropertyColor[]
): PropertyCard {
  return {
    id: uuidv4(),
    type: 'property',
    name,
    value,
    color,
    isWildcard,
    wildcardColors,
    rentValues: RENT_VALUES[color],
    image: `property-${color}`
  };
}

function createMoneyCard(value: number): MoneyCard {
  return {
    id: uuidv4(),
    type: 'money',
    name: `$${value}M`,
    value,
    image: `money-${value}`
  };
}

function createActionCard(action: ActionType, name: string, value: number): ActionCard {
  return {
    id: uuidv4(),
    type: 'action',
    name,
    value,
    action,
    image: `action-${action}`
  };
}

function createRentCard(colors: PropertyColor[], value: number, isWildRent: boolean = false): RentCard {
  return {
    id: uuidv4(),
    type: 'rent',
    name: isWildRent ? 'Wild Rent' : `Rent (${colors.join('/')})`,
    value,
    colors,
    isWildRent,
    image: isWildRent ? 'rent-wild' : `rent-${colors.join('-')}`
  };
}

export function createDeck(): Card[] {
  const deck: Card[] = [];

  // Property Cards (28 total)
  // Brown (2)
  deck.push(createPropertyCard('Mediterranean Avenue', 'brown', 1));
  deck.push(createPropertyCard('Baltic Avenue', 'brown', 1));
  
  // Light Blue (3)
  deck.push(createPropertyCard('Oriental Avenue', 'lightBlue', 1));
  deck.push(createPropertyCard('Vermont Avenue', 'lightBlue', 1));
  deck.push(createPropertyCard('Connecticut Avenue', 'lightBlue', 1));
  
  // Pink (3)
  deck.push(createPropertyCard('St. Charles Place', 'pink', 2));
  deck.push(createPropertyCard('States Avenue', 'pink', 2));
  deck.push(createPropertyCard('Virginia Avenue', 'pink', 2));
  
  // Orange (3)
  deck.push(createPropertyCard('St. James Place', 'orange', 2));
  deck.push(createPropertyCard('Tennessee Avenue', 'orange', 2));
  deck.push(createPropertyCard('New York Avenue', 'orange', 2));
  
  // Red (3)
  deck.push(createPropertyCard('Kentucky Avenue', 'red', 3));
  deck.push(createPropertyCard('Indiana Avenue', 'red', 3));
  deck.push(createPropertyCard('Illinois Avenue', 'red', 3));
  
  // Yellow (3)
  deck.push(createPropertyCard('Atlantic Avenue', 'yellow', 3));
  deck.push(createPropertyCard('Ventnor Avenue', 'yellow', 3));
  deck.push(createPropertyCard('Marvin Gardens', 'yellow', 3));
  
  // Green (3)
  deck.push(createPropertyCard('Pacific Avenue', 'green', 4));
  deck.push(createPropertyCard('North Carolina Avenue', 'green', 4));
  deck.push(createPropertyCard('Pennsylvania Avenue', 'green', 4));
  
  // Dark Blue (2)
  deck.push(createPropertyCard('Park Place', 'darkBlue', 4));
  deck.push(createPropertyCard('Boardwalk', 'darkBlue', 4));
  
  // Railroad (4)
  deck.push(createPropertyCard('Reading Railroad', 'railroad', 2));
  deck.push(createPropertyCard('Pennsylvania Railroad', 'railroad', 2));
  deck.push(createPropertyCard('B&O Railroad', 'railroad', 2));
  deck.push(createPropertyCard('Short Line', 'railroad', 2));
  
  // Utility (2)
  deck.push(createPropertyCard('Electric Company', 'utility', 2));
  deck.push(createPropertyCard('Water Works', 'utility', 2));

  // Wildcard Properties (11 total)
  deck.push(createPropertyCard('Wild Property', 'brown', 1, true, ['brown', 'lightBlue']));
  deck.push(createPropertyCard('Wild Property', 'pink', 2, true, ['pink', 'orange']));
  deck.push(createPropertyCard('Wild Property', 'red', 3, true, ['red', 'yellow']));
  deck.push(createPropertyCard('Wild Property', 'green', 4, true, ['green', 'darkBlue']));
  deck.push(createPropertyCard('Wild Property', 'green', 4, true, ['green', 'railroad']));
  deck.push(createPropertyCard('Wild Property', 'lightBlue', 4, true, ['lightBlue', 'railroad']));
  deck.push(createPropertyCard('Wild Property', 'utility', 2, true, ['utility', 'railroad']));
  deck.push(createPropertyCard('Wild Property', 'railroad', 0, true, ['brown', 'lightBlue', 'pink', 'orange', 'red', 'yellow', 'green', 'darkBlue', 'railroad', 'utility']));
  deck.push(createPropertyCard('Wild Property', 'railroad', 0, true, ['brown', 'lightBlue', 'pink', 'orange', 'red', 'yellow', 'green', 'darkBlue', 'railroad', 'utility']));

  // Money Cards (20 total)
  for (let i = 0; i < 6; i++) deck.push(createMoneyCard(1));
  for (let i = 0; i < 5; i++) deck.push(createMoneyCard(2));
  for (let i = 0; i < 3; i++) deck.push(createMoneyCard(3));
  for (let i = 0; i < 3; i++) deck.push(createMoneyCard(4));
  for (let i = 0; i < 2; i++) deck.push(createMoneyCard(5));
  deck.push(createMoneyCard(10));

  // Action Cards (34 total)
  // Deal Breaker (2)
  for (let i = 0; i < 2; i++) deck.push(createActionCard('dealBreaker', 'Deal Breaker', 5));
  
  // Just Say No (3)
  for (let i = 0; i < 3; i++) deck.push(createActionCard('justSayNo', 'Just Say No', 4));
  
  // Sly Deal (3)
  for (let i = 0; i < 3; i++) deck.push(createActionCard('slyDeal', 'Sly Deal', 3));
  
  // Forced Deal (4)
  for (let i = 0; i < 4; i++) deck.push(createActionCard('forcedDeal', 'Forced Deal', 3));
  
  // Debt Collector (3)
  for (let i = 0; i < 3; i++) deck.push(createActionCard('debtCollector', 'Debt Collector', 3));
  
  // It's My Birthday (3)
  for (let i = 0; i < 3; i++) deck.push(createActionCard('birthday', "It's My Birthday", 2));
  
  // Pass Go (10)
  for (let i = 0; i < 10; i++) deck.push(createActionCard('passGo', 'Pass Go', 1));
  
  // House (3)
  for (let i = 0; i < 3; i++) deck.push(createActionCard('house', 'House', 3));
  
  // Hotel (2)
  for (let i = 0; i < 2; i++) deck.push(createActionCard('hotel', 'Hotel', 4));
  
  // Double The Rent (2)
  for (let i = 0; i < 2; i++) deck.push(createActionCard('doubleRent', 'Double The Rent', 1));

  // Rent Cards (13 total)
  for (let i = 0; i < 2; i++) deck.push(createRentCard(['brown', 'lightBlue'], 1));
  for (let i = 0; i < 2; i++) deck.push(createRentCard(['pink', 'orange'], 1));
  for (let i = 0; i < 2; i++) deck.push(createRentCard(['red', 'yellow'], 1));
  for (let i = 0; i < 2; i++) deck.push(createRentCard(['green', 'darkBlue'], 1));
  for (let i = 0; i < 2; i++) deck.push(createRentCard(['railroad', 'utility'], 1));
  for (let i = 0; i < 3; i++) deck.push(createRentCard(['brown', 'lightBlue', 'pink', 'orange', 'red', 'yellow', 'green', 'darkBlue', 'railroad', 'utility'], 3, true));

  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
