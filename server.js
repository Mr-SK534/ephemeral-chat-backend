const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow Vercel frontend
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.get('/', (req, res) => {
  res.send('Ephemeral Chat Backend - Running');
});

const PORT = process.env.PORT || 3000;

// In-memory storage: chatCode → { users: Set, messages: [] }
const chats = new Map();

io.on('connection', (socket) => {
  let userRoom = null;
  let username = 'Anonymous';

  socket.on('join', ({ code, username: name }) => {
    if (!code) return;
    userRoom = code;
    username = name?.trim() || 'Anonymous';

    if (!chats.has(code)) {
      chats.set(code, { users: new Set(), messages: [] });
    }

    const chat = chats.get(code);
    chat.users.add(socket.id);

    socket.join(code);
    socket.to(code).emit('system message', `${username} joined`);
    socket.emit('system message', `Welcome to chat: ${code}`);
  });

  socket.on('chat message', (msg) => {
    if (!userRoom || !msg?.trim()) return;
    const chat = chats.get(userRoom);
    if (!chat) return;

    const messageData = { username, msg: msg.trim(), time: new Date() };
    chat.messages.push(messageData);

    io.to(userRoom).emit('chat message', messageData);
  });

  socket.on('disconnect', () => {
    if (!userRoom) return;
    const chat = chats.get(userRoom);
    if (!chat) return;

    chat.users.delete(socket.id);
    socket.to(userRoom).emit('system message', `${username} left`);

    // Auto-delete when empty
    if (chat.users.size === 0) {
      chats.delete(userRoom);
      io.to(userRoom).emit('chat closed');
      console.log(`Chat ${userRoom} deleted.`);
    }
  });
});

// Clean up stale chats every hour
setInterval(() => {
  for (const [code, chat] of chats.entries()) {
    if (chat.users.size === 0) {
      chats.delete(code);
      console.log(`Cleaned inactive chat: ${code}`);
    }
  }
}, 3600000);

server.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
