const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Store active games
const games = new Map();

const BOARD_SIZE = 15;
const WIN_LENGTH = 5;
const TURN_TIMEOUT = 20000; // 20 seconds per turn

// Create empty board
function createEmptyBoard() {
  return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
}

// Check for winner
function checkWinner(board, row, col, player) {
  const directions = [
    [0, 1],   // horizontal
    [1, 0],   // vertical
    [1, 1],   // diagonal \
    [1, -1]   // diagonal /
  ];

  for (const [dr, dc] of directions) {
    let count = 1;

    // Check positive direction
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === player) {
      count++;
      r += dr;
      c += dc;
    }

    // Check negative direction
    r = row - dr;
    c = col - dc;
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === player) {
      count++;
      r -= dr;
      c -= dc;
    }

    if (count >= WIN_LENGTH) {
      return true;
    }
  }

  return false;
}

// Check for draw
function checkDraw(board) {
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (board[row][col] === null) {
        return false;
      }
    }
  }
  return true;
}

// Start turn timer
function startTurnTimer(gameId) {
  const game = games.get(gameId);
  if (!game) return;

  // Clear existing timer
  if (game.turnTimer) {
    clearTimeout(game.turnTimer);
  }

  game.turnStartedAt = Date.now();

  game.turnTimer = setTimeout(() => {
    const g = games.get(gameId);
    if (!g || g.status !== 'playing') return;

    // Current player loses due to timeout
    const loser = g.currentPlayer;
    const winner = loser === 'X' ? 'O' : 'X';

    g.status = 'finished';
    g.winner = winner;

    io.to(gameId).emit('gameOver', {
      winner: winner,
      board: g.board,
      reason: 'timeout'
    });

    console.log(`Game ${gameId}: ${loser} lost due to timeout`);
  }, TURN_TIMEOUT);
}

// API endpoint to create a new game
app.post('/api/games', (req, res) => {
  const gameId = crypto.randomBytes(4).toString('hex');
  games.set(gameId, {
    id: gameId,
    board: createEmptyBoard(),
    players: [],
    currentPlayer: 'X',
    status: 'waiting', // waiting, playing, finished
    winner: null,
    createdAt: Date.now()
  });

  res.json({ gameId });
});

// API endpoint to get all waiting lobbies
app.get('/api/lobbies', (req, res) => {
  const now = Date.now();
  const oneMinute = 60 * 1000;
  const lobbies = [];

  for (const [gameId, game] of games) {
    // Only show waiting games less than 1 minute old
    if (game.status === 'waiting' && game.players.length === 1 && (now - game.createdAt) < oneMinute) {
      lobbies.push({
        id: game.id,
        createdAt: game.createdAt,
        playerName: game.players[0]?.playerName || 'Hráč'
      });
    }
  }

  // Sort by newest first
  lobbies.sort((a, b) => b.createdAt - a.createdAt);

  res.json(lobbies);
});

// API endpoint to get game state
app.get('/api/games/:gameId', (req, res) => {
  const { gameId } = req.params;
  const game = games.get(gameId);

  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }

  res.json({
    id: game.id,
    board: game.board,
    currentPlayer: game.currentPlayer,
    status: game.status,
    winner: game.winner,
    playerCount: game.players.length
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('joinGame', ({ gameId, telegramUser }) => {
    const game = games.get(gameId);

    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    // Check if player already in game
    const existingPlayer = game.players.find(p => p.odI === telegramUser?.id);
    if (existingPlayer) {
      existingPlayer.socketId = socket.id;
      socket.join(gameId);
      socket.emit('gameState', {
        ...game,
        playerSymbol: existingPlayer.symbol,
        playerCount: game.players.length
      });
      return;
    }

    // Add new player
    if (game.players.length >= 2) {
      socket.emit('error', { message: 'Game is full' });
      return;
    }

    const symbol = game.players.length === 0 ? 'X' : 'O';
    const playerName = telegramUser?.username || `Hráč ${symbol}`;
    game.players.push({
      odI: telegramUser?.id || socket.id,
      playerName: playerName,
      socketId: socket.id,
      symbol
    });

    socket.join(gameId);

    // Start game if 2 players joined
    if (game.players.length === 2) {
      game.status = 'playing';
      startTurnTimer(gameId);
    }

    // Send game state to the joining player
    socket.emit('gameState', {
      ...game,
      playerSymbol: symbol,
      playerCount: game.players.length
    });

    // Notify all players in the room
    io.to(gameId).emit('playerJoined', {
      playerCount: game.players.length,
      status: game.status
    });

    console.log(`Player ${symbol} joined game ${gameId}`);
  });

  socket.on('makeMove', ({ gameId, row, col }) => {
    const game = games.get(gameId);

    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    // Validate game state
    if (game.status !== 'playing') {
      socket.emit('error', { message: 'Game is not in progress' });
      return;
    }

    // Find player by socket
    const player = game.players.find(p => p.socketId === socket.id);
    if (!player) {
      socket.emit('error', { message: 'You are not in this game' });
      return;
    }

    // Validate turn
    if (player.symbol !== game.currentPlayer) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    // Validate move
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
      socket.emit('error', { message: 'Invalid position' });
      return;
    }

    if (game.board[row][col] !== null) {
      socket.emit('error', { message: 'Cell already occupied' });
      return;
    }

    // Make the move
    game.board[row][col] = player.symbol;

    // Check for winner
    if (checkWinner(game.board, row, col, player.symbol)) {
      game.status = 'finished';
      game.winner = player.symbol;
      io.to(gameId).emit('gameOver', {
        winner: player.symbol,
        board: game.board
      });
    } else if (checkDraw(game.board)) {
      game.status = 'finished';
      game.winner = 'draw';
      io.to(gameId).emit('gameOver', {
        winner: 'draw',
        board: game.board
      });
    } else {
      // Switch turn
      game.currentPlayer = game.currentPlayer === 'X' ? 'O' : 'X';
      startTurnTimer(gameId);
    }

    // Broadcast the move to all players
    io.to(gameId).emit('moveMade', {
      row,
      col,
      player: player.symbol,
      currentPlayer: game.currentPlayer,
      board: game.board,
      status: game.status,
      winner: game.winner,
      turnStartedAt: game.turnStartedAt
    });

    console.log(`Move made in game ${gameId}: ${player.symbol} at (${row}, ${col})`);
  });

  socket.on('restartGame', ({ gameId }) => {
    const game = games.get(gameId);

    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    // Clear existing timer
    if (game.turnTimer) {
      clearTimeout(game.turnTimer);
    }

    // Reset the game
    game.board = createEmptyBoard();
    game.currentPlayer = 'X';
    game.status = game.players.length === 2 ? 'playing' : 'waiting';
    game.winner = null;

    // Start timer if game is playing
    if (game.status === 'playing') {
      startTurnTimer(gameId);
    }

    // Notify all players
    io.to(gameId).emit('gameRestarted', {
      board: game.board,
      currentPlayer: game.currentPlayer,
      status: game.status,
      turnStartedAt: game.turnStartedAt
    });

    console.log(`Game ${gameId} restarted`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);

    // Remove player from games
    for (const [gameId, game] of games) {
      const playerIndex = game.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex !== -1) {
        const player = game.players[playerIndex];
        // Don't remove the player, just mark as disconnected
        // This allows reconnection
        io.to(gameId).emit('playerDisconnected', {
          symbol: player.symbol
        });
      }
    }
  });
});

// Cleanup old games every hour
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  for (const [gameId, game] of games) {
    if (now - game.createdAt > oneHour) {
      games.delete(gameId);
      console.log(`Cleaned up old game: ${gameId}`);
    }
  }
}, 60 * 60 * 1000);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', games: games.size });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
