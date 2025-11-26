const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = https.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.get('/', (req, res) => res.send('Ephemeral Chat Backend - Running'));

const PORT = process.env.PORT || 3000;

// chatCode → { users: Set<socket.id>, names: Map<socket.id, name>, messages: [] }
const chats = new Map();

io.on('connection', (socket) => {
  let userRoom = null;
  let username = 'guest';

  // ---------- JOIN ----------
  socket.on('join', ({ code, username: name }) => {
    if (!code) return;
    userRoom = code;
    username = name?.trim() || 'guest';

    if (!chats.has(code)) {
      chats.set(code, { users: new Set(), names: new Map(), messages: [] });
    }
    const chat = chats.get(code);
    chat.users.add(socket.id);
    chat.names.set(socket.id, username);

    socket.join(code);
    socket.to(code).emit('system message', `${username} joined`);
    socket.emit('system message', `Connected to ${code}. Type 'help'.`);
  });

  // ---------- MESSAGE ----------
  socket.on('chat message', (msg) => {
    if (!userRoom || !msg?.trim()) return;
    const chat = chats.get(userRoom);
    if (!chat) return;

    const data = { username, msg: msg.trim(), time: new Date() };
    chat.messages.push(data);

    io.to(userRoom).emit('chat message', data);
  });

  // ---------- TYPING ----------
  socket.on('typing', (isTyping) => {
    if (!userRoom) return;
    if (isTyping) {
      socket.to(userRoom).emit('user typing', username);
    }
  });

  // ---------- REQUEST USERS (who command) ----------
  socket.on('request users', () => {
    if (!userRoom) return;
    const chat = chats.get(userRoom);
    if (!chat) return;
    const list = Array.from(chat.names.values()).join(', ') || 'nobody';
    socket.emit('system message', `Online: ${list}`);
  });

  // ---------- DISCONNECT ----------
  socket.on('disconnect', () => {
    if (!userRoom) return;
    const chat = chats.get(userRoom);
    if (!chat) return;

    chat.users.delete(socket.id);
    chat.names.delete(socket.id);
    socket.to(userRoom).emit('system message', `${username} left`);

    // AUTO-DELETE WHEN EMPTY
    if (chat.users.size === 0) {
      chats.delete(userRoom);
      io.to(userRoom).emit('chat closed');
      console.log(`Chat ${userRoom} deleted.`);
    }
  });
});

// CLEANUP STALE CHATS
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