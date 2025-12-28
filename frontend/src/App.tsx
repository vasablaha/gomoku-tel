import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  init,
  mainButton,
  hapticFeedback,
  themeParams,
  initData,
  postEvent
} from '@tma.js/sdk';

const BOARD_SIZE = 15;
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

type CellValue = 'X' | 'O' | null;
type GameStatus = 'waiting' | 'playing' | 'finished';

interface GameState {
  board: CellValue[][];
  currentPlayer: 'X' | 'O';
  status: GameStatus;
  winner: 'X' | 'O' | 'draw' | null;
  playerSymbol?: 'X' | 'O';
  playerCount: number;
}

interface Lobby {
  id: string;
  createdAt: number;
  playerName: string;
}

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>({
    board: Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)),
    currentPlayer: 'X',
    status: 'waiting',
    winner: null,
    playerCount: 0
  });
  const [playerSymbol, setPlayerSymbol] = useState<'X' | 'O' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [isTelegramReady, setIsTelegramReady] = useState(false);
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const boardRef = useRef<HTMLDivElement>(null);

  // Initialize Telegram Mini App
  useEffect(() => {
    try {
      init();
      setIsTelegramReady(true);

      // Apply Telegram theme
      if (themeParams.isMounted()) {
        const bgColor = themeParams.bgColor() || '#1a1a1a';
        const textColor = themeParams.textColor() || '#ffffff';
        document.documentElement.style.setProperty('--tg-theme-bg-color', bgColor);
        document.documentElement.style.setProperty('--tg-theme-text-color', textColor);
        document.body.style.backgroundColor = bgColor;
        document.body.style.color = textColor;
      }

      // Expand the app
      postEvent('web_app_expand');
    } catch (e) {
      console.log('Not running in Telegram, using default theme');
    }
  }, []);

  // Get gameId from Telegram start_param or URL
  useEffect(() => {
    let id: string | null = null;

    // Try to get from Telegram initData
    try {
      if (initData.startParam()) {
        id = initData.startParam() || null;
      }
    } catch (e) {
      console.log('Could not get start_param from Telegram');
    }

    // Fallback to URL parameter
    if (!id) {
      const urlParams = new URLSearchParams(window.location.search);
      id = urlParams.get('gameId');
    }

    if (id) {
      setGameId(id);
    }
  }, []);

  // Fetch lobbies
  const fetchLobbies = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/lobbies`);
      const data = await response.json();
      setLobbies(data);
    } catch (e) {
      console.log('Could not fetch lobbies');
    }
  };

  // Fetch lobbies on mount and every 3 seconds
  useEffect(() => {
    if (!gameId) {
      fetchLobbies();
      const interval = setInterval(fetchLobbies, 3000);
      return () => clearInterval(interval);
    }
  }, [gameId]);

  // Connect to socket
  useEffect(() => {
    const newSocket = io(BACKEND_URL, {
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setSocket(newSocket);
    });

    newSocket.on('connect_error', (err) => {
      console.error('Connection error:', err);
      setError('Nelze se připojit k serveru');
    });

    return () => {
      newSocket.close();
    };
  }, []);

  // Join game when socket and gameId are ready
  useEffect(() => {
    if (socket && gameId) {
      let telegramUser = null;
      try {
        const user = initData.user();
        if (user) {
          telegramUser = {
            id: user.id,
            username: user.username || user.first_name
          };
        }
      } catch (e) {
        console.log('Could not get Telegram user');
      }

      socket.emit('joinGame', { gameId, telegramUser });
    }
  }, [socket, gameId]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('gameState', (state: GameState & { playerSymbol: 'X' | 'O' }) => {
      setGameState(state);
      setPlayerSymbol(state.playerSymbol);
    });

    socket.on('playerJoined', ({ playerCount, status }: { playerCount: number; status: GameStatus }) => {
      setGameState(prev => ({ ...prev, playerCount, status }));
    });

    socket.on('moveMade', (data: {
      row: number;
      col: number;
      player: 'X' | 'O';
      currentPlayer: 'X' | 'O';
      board: CellValue[][];
      status: GameStatus;
      winner: 'X' | 'O' | 'draw' | null;
    }) => {
      setGameState(prev => ({
        ...prev,
        board: data.board,
        currentPlayer: data.currentPlayer,
        status: data.status,
        winner: data.winner
      }));
    });

    socket.on('gameOver', ({ winner, board }: { winner: 'X' | 'O' | 'draw'; board: CellValue[][] }) => {
      setGameState(prev => ({
        ...prev,
        board,
        status: 'finished',
        winner
      }));

      // Haptic feedback for game over
      try {
        if (winner === playerSymbol) {
          hapticFeedback.notificationOccurred('success');
        } else if (winner === 'draw') {
          hapticFeedback.notificationOccurred('warning');
        } else {
          hapticFeedback.notificationOccurred('error');
        }
      } catch (e) {
        console.log('Haptic feedback not available');
      }
    });

    socket.on('gameRestarted', ({ board, currentPlayer, status }: {
      board: CellValue[][];
      currentPlayer: 'X' | 'O';
      status: GameStatus;
    }) => {
      setGameState(prev => ({
        ...prev,
        board,
        currentPlayer,
        status,
        winner: null
      }));
    });

    socket.on('error', ({ message }: { message: string }) => {
      setError(message);
      setTimeout(() => setError(null), 3000);
    });

    socket.on('playerDisconnected', ({ symbol }: { symbol: 'X' | 'O' }) => {
      setError(`Hráč ${symbol} se odpojil`);
    });

    return () => {
      socket.off('gameState');
      socket.off('playerJoined');
      socket.off('moveMade');
      socket.off('gameOver');
      socket.off('gameRestarted');
      socket.off('error');
      socket.off('playerDisconnected');
    };
  }, [socket, playerSymbol]);

  // Setup MainButton for restart
  useEffect(() => {
    if (!isTelegramReady || gameState.status !== 'finished') {
      try {
        mainButton.setParams({ isVisible: false });
      } catch (e) {
        console.log('MainButton not available');
      }
      return;
    }

    try {
      mainButton.setParams({
        text: 'HRÁT ZNOVU',
        isVisible: true,
        bgColor: '#2481cc'
      });

      const handleClick = () => {
        if (socket && gameId) {
          socket.emit('restartGame', { gameId });
        }
      };

      mainButton.onClick(handleClick);

      return () => {
        mainButton.offClick(handleClick);
      };
    } catch (e) {
      console.log('MainButton not available');
    }
  }, [isTelegramReady, gameState.status, socket, gameId]);

  // Create new game
  const createGame = async () => {
    setIsCreatingGame(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/games`, {
        method: 'POST'
      });
      const data = await response.json();
      setGameId(data.gameId);

      // Generate share link
      const botUsername = import.meta.env.VITE_BOT_USERNAME || 'YOUR_BOT_USERNAME';
      const link = `https://t.me/${botUsername}?startapp=${data.gameId}`;
      setShareLink(link);
    } catch (e) {
      setError('Nepodařilo se vytvořit hru');
    } finally {
      setIsCreatingGame(false);
    }
  };

  // Handle cell click
  const handleCellClick = useCallback((row: number, col: number) => {
    if (!socket || !gameId) return;
    if (gameState.status !== 'playing') return;
    if (gameState.currentPlayer !== playerSymbol) return;
    if (gameState.board[row][col] !== null) return;

    // Haptic feedback for tap
    try {
      hapticFeedback.impactOccurred('light');
    } catch (e) {
      console.log('Haptic feedback not available');
    }

    socket.emit('makeMove', { gameId, row, col });
  }, [socket, gameId, gameState, playerSymbol]);

  // Copy share link
  const copyShareLink = () => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink);
      try {
        hapticFeedback.notificationOccurred('success');
      } catch (e) {
        console.log('Haptic feedback not available');
      }
      setError('Odkaz zkopírován!');
      setTimeout(() => setError(null), 2000);
    }
  };

  // Render cell
  const renderCell = (row: number, col: number) => {
    const value = gameState.board[row][col];
    const isMyTurn = gameState.status === 'playing' && gameState.currentPlayer === playerSymbol;
    const canClick = isMyTurn && value === null;

    return (
      <div
        key={`${row}-${col}`}
        onClick={() => handleCellClick(row, col)}
        className={`
          aspect-square flex items-center justify-center
          border border-gray-600/50 text-lg font-bold
          transition-all duration-150
          ${canClick ? 'cursor-pointer hover:bg-gray-700/50 active:bg-gray-600/50' : 'cursor-default'}
          ${value === 'X' ? 'text-blue-400' : value === 'O' ? 'text-red-400' : ''}
        `}
      >
        {value}
      </div>
    );
  };

  // Game status text
  const getStatusText = () => {
    if (gameState.status === 'waiting') {
      if (gameState.playerCount === 0) return 'Čekám na připojení...';
      if (gameState.playerCount === 1) return 'Čekám na soupeře...';
      return 'Připojuji...';
    }

    if (gameState.status === 'finished') {
      if (gameState.winner === 'draw') return 'Remíza!';
      if (gameState.winner === playerSymbol) return '🎉 Vyhrál jsi!';
      return '😔 Prohrál jsi';
    }

    if (gameState.currentPlayer === playerSymbol) {
      return 'Tvůj tah!';
    }
    return 'Soupeř táhne...';
  };

  // Join existing lobby
  const joinLobby = (lobbyId: string) => {
    setGameId(lobbyId);
  };

  // Format time ago
  const formatTimeAgo = (createdAt: number) => {
    const seconds = Math.floor((Date.now() - createdAt) / 1000);
    if (seconds < 10) return 'právě teď';
    if (seconds < 60) return `před ${seconds}s`;
    return 'před 1min';
  };

  // Render landing page (no game)
  if (!gameId) {
    return (
      <div className="min-h-screen flex flex-col items-center p-4 bg-[var(--tg-theme-bg-color)]">
        <h1 className="text-3xl font-bold mb-2 mt-8">🎮 Gomoku</h1>
        <p className="text-gray-400 mb-6 text-center">Piškvorky 5 v řadě</p>

        <button
          onClick={createGame}
          disabled={isCreatingGame}
          className="w-full max-w-xs py-4 px-6 rounded-xl font-semibold text-lg
            bg-blue-500 hover:bg-blue-600 active:bg-blue-700
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-150"
        >
          {isCreatingGame ? 'Vytvářím...' : 'Vytvořit novou hru'}
        </button>

        {shareLink && (
          <div className="mt-6 w-full max-w-xs">
            <p className="text-sm text-gray-400 mb-2 text-center">Pošli tento odkaz soupeři:</p>
            <div
              onClick={copyShareLink}
              className="p-3 bg-gray-800 rounded-lg text-sm break-all cursor-pointer
                hover:bg-gray-700 active:bg-gray-600 transition-colors"
            >
              {shareLink}
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">Klikni pro zkopírování</p>
          </div>
        )}

        {/* Lobbies list */}
        <div className="w-full max-w-xs mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Otevřené hry</h2>
            <button
              onClick={fetchLobbies}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Obnovit
            </button>
          </div>

          {lobbies.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">
              Žádné otevřené hry. Vytvoř novou!
            </p>
          ) : (
            <div className="space-y-2">
              {lobbies.map((lobby) => (
                <div
                  key={lobby.id}
                  onClick={() => joinLobby(lobby.id)}
                  className="p-3 bg-gray-800 rounded-lg cursor-pointer
                    hover:bg-gray-700 active:bg-gray-600 transition-colors
                    flex items-center justify-between"
                >
                  <div>
                    <span className="font-medium">{lobby.playerName}</span>
                    <span className="text-gray-500 text-sm ml-2">čeká...</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{formatTimeAgo(lobby.createdAt)}</span>
                    <span className="text-green-400 text-sm">Připojit →</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="fixed bottom-4 left-4 right-4 p-3 bg-green-600 rounded-lg text-center">
            {error}
          </div>
        )}
      </div>
    );
  }

  // Render game
  return (
    <div className="min-h-screen flex flex-col items-center p-2 bg-[var(--tg-theme-bg-color)]">
      {/* Header */}
      <div className="w-full max-w-md mb-2">
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-gray-400">
            Jsi: <span className={`font-bold ${playerSymbol === 'X' ? 'text-blue-400' : 'text-red-400'}`}>
              {playerSymbol || '?'}
            </span>
          </div>
          <div className="text-sm text-gray-400">
            Hra: <span className="font-mono">{gameId}</span>
          </div>
        </div>
      </div>

      {/* Status */}
      <div className={`
        text-xl font-bold mb-3 px-4 py-2 rounded-lg
        ${gameState.status === 'finished'
          ? gameState.winner === playerSymbol
            ? 'bg-green-600/20 text-green-400'
            : gameState.winner === 'draw'
              ? 'bg-yellow-600/20 text-yellow-400'
              : 'bg-red-600/20 text-red-400'
          : gameState.currentPlayer === playerSymbol
            ? 'bg-blue-600/20 text-blue-400'
            : 'bg-gray-600/20 text-gray-400'
        }
      `}>
        {getStatusText()}
      </div>

      {/* Board */}
      <div
        ref={boardRef}
        className="bg-gray-800/50 rounded-lg p-1 overflow-hidden"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
          width: Math.min(window.innerWidth - 16, 400),
          height: Math.min(window.innerWidth - 16, 400)
        }}
      >
        {gameState.board.map((row, rowIndex) =>
          row.map((_, colIndex) => renderCell(rowIndex, colIndex))
        )}
      </div>

      {/* Current player indicator */}
      <div className="mt-4 flex items-center gap-4">
        <div className={`
          flex items-center gap-2 px-3 py-1 rounded-full
          ${gameState.currentPlayer === 'X' ? 'bg-blue-600/30' : 'bg-gray-700/30'}
        `}>
          <span className="text-blue-400 font-bold">X</span>
          {playerSymbol === 'X' && <span className="text-xs text-gray-400">(Ty)</span>}
        </div>
        <div className={`
          flex items-center gap-2 px-3 py-1 rounded-full
          ${gameState.currentPlayer === 'O' ? 'bg-red-600/30' : 'bg-gray-700/30'}
        `}>
          <span className="text-red-400 font-bold">O</span>
          {playerSymbol === 'O' && <span className="text-xs text-gray-400">(Ty)</span>}
        </div>
      </div>

      {/* Waiting overlay */}
      {gameState.status === 'waiting' && (
        <div className="mt-8 text-center">
          <div className="animate-pulse text-gray-400">
            {gameState.playerCount === 1 && shareLink && (
              <div className="mt-4">
                <p className="text-sm mb-2">Pošli odkaz soupeři:</p>
                <div
                  onClick={copyShareLink}
                  className="p-2 bg-gray-800 rounded text-xs break-all cursor-pointer
                    hover:bg-gray-700 transition-colors"
                >
                  {shareLink}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Restart button for non-Telegram */}
      {gameState.status === 'finished' && !isTelegramReady && (
        <button
          onClick={() => socket?.emit('restartGame', { gameId })}
          className="mt-6 py-3 px-8 rounded-xl font-semibold
            bg-blue-500 hover:bg-blue-600 active:bg-blue-700
            transition-all duration-150"
        >
          Hrát znovu
        </button>
      )}

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-4 left-4 right-4 p-3 bg-red-600/90 rounded-lg text-center text-sm">
          {error}
        </div>
      )}
    </div>
  );
}

export default App;
