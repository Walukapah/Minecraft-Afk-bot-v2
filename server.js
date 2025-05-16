require('dotenv').config();
const express = require('express');
const socketio = require('socket.io');
const http = require('http');
const mineflayer = require('mineflayer');
const { ChatMessage } = require('prismarine-chat');
const { mineflayer: viewer } = require('prismarine-viewer');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

let bots = {};

// UI Themes
const themes = {
  default: {
    primary: '#4a6fa5',
    secondary: '#166088',
    background: '#0e1a2a',
    text: '#ffffff'
  },
  dark: {
    primary: '#2d3748',
    secondary: '#4a5568',
    background: '#1a202c',
    text: '#e2e8f0'
  },
  light: {
    primary: '#4299e1',
    secondary: '#90cdf4',
    background: '#f7fafc',
    text: '#2d3748'
  }
};

io.on('connection', (socket) => {
  console.log('New client connected');
  
  socket.on('createBot', (config) => {
    const botId = Date.now().toString();
    
    const bot = mineflayer.createBot({
      username: config.username,
      version: config.version,
      host: config.serverIp,
      port: config.serverPort || 25565,
      auth: config.accountType === 'premium' ? 'microsoft' : 'offline'
    });
    
    bots[botId] = bot;
    socket.botId = botId;
    
    // Viewer setup
    bot.once('spawn', () => {
      viewer(bot, { port: 3000 + parseInt(botId) });
      
      // Auto-teleport if configured
      if (config.autoTeleport) {
        bot.chat(`/tp ${config.autoTeleport}`);
      }
      
      // Send join message if configured
      if (config.joinMessage) {
        bot.chat(config.joinMessage);
      }
      
      // Start recurrent messages if configured
      if (config.recurrentMessages && config.recurrentMessages.length > 0) {
        const sendRecurrent = () => {
          config.recurrentMessages.forEach(msg => {
            setTimeout(() => bot.chat(msg.message), msg.delay * 1000);
          });
          setTimeout(sendRecurrent, config.recurrentDelay * 1000);
        };
        sendRecurrent();
      }
      
      // Auto-movement if configured
      if (config.autoMove) {
        setInterval(() => {
          bot.setControlState('forward', true);
          setTimeout(() => bot.setControlState('forward', false), 1000);
        }, 120000);
      }
    });
    
    // Handle chat messages
    bot.on('message', (message) => {
      const jsonMessage = new ChatMessage(bot.registry, message).toJSON();
      socket.emit('chatMessage', {
        botId,
        message: jsonMessage
      });
    });
    
    // Handle player updates
    bot.on('playerJoined', (player) => {
      socket.emit('playerUpdate', {
        botId,
        type: 'join',
        player: player.username
      });
    });
    
    bot.on('playerLeft', (player) => {
      socket.emit('playerUpdate', {
        botId,
        type: 'leave',
        player: player.username
      });
    });
    
    // Send initial response
    socket.emit('botCreated', { botId });
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
    if (socket.botId && bots[socket.botId]) {
      bots[socket.botId].end();
      delete bots[socket.botId];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
