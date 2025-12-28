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
    game.players.push({
      odI: telegramUser?.id || socket.id,
      odIN: telegramUser?.username || `Player ${symbol}`,
      socketId: socket.id,
      symbol
    });

    socket.join(gameId);

    // Start game if 2 players joined
    if (game.players.length === 2) {
      game.status = 'playing';
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
    }

    // Broadcast the move to all players
    io.to(gameId).emit('moveMade', {
      row,
      col,
      player: player.symbol,
      currentPlayer: game.currentPlayer,
      board: game.board,
      status: game.status,
      winner: game.winner
    });

    console.log(`Move made in game ${gameId}: ${player.symbol} at (${row}, ${col})`);
  });

  socket.on('restartGame', ({ gameId }) => {
    const game = games.get(gameId);

    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    // Reset the game
    game.board = createEmptyBoard();
    game.currentPlayer = 'X';
    game.status = game.players.length === 2 ? 'playing' : 'waiting';
    game.winner = null;

    // Notify all players
    io.to(gameId).emit('gameRestarted', {
      board: game.board,
      currentPlayer: game.currentPlayer,
      status: game.status
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
