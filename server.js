const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = new Map();

app.use(express.static(path.join(__dirname)));

function code() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';
  do value = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  while (rooms.has(value));
  return value;
}
function emitRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit('room:update', {
    roomId,
    players: { white: !!room.white, black: !!room.black },
    ready: !!room.white && !!room.black
  });
}
function leaveRoom(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (room) {
    if (room.white === socket.id) room.white = null;
    if (room.black === socket.id) room.black = null;
    socket.to(roomId).emit('opponent:left');
    if (!room.white && !room.black) rooms.delete(roomId);
    else emitRoom(roomId);
  }
  socket.leave(roomId);
  socket.data.roomId = null;
  socket.data.color = null;
}

io.on('connection', socket => {
  socket.on('room:create', (_, respond) => {
    leaveRoom(socket);
    const roomId = code();
    rooms.set(roomId, { white: socket.id, black: null });
    socket.join(roomId); socket.data.roomId = roomId; socket.data.color = 'w';
    emitRoom(roomId); respond?.({ ok: true, roomId, color: 'w', ready: false });
  });
  socket.on('room:join', (rawCode, respond) => {
    leaveRoom(socket);
    const roomId = String(rawCode || '').trim().toUpperCase();
    const room = rooms.get(roomId);
    if (!room) return respond?.({ ok: false, error: 'Room not found.' });
    if (room.black) return respond?.({ ok: false, error: 'This room already has two players.' });
    room.black = socket.id; socket.join(roomId); socket.data.roomId = roomId; socket.data.color = 'b';
    emitRoom(roomId); respond?.({ ok: true, roomId, color: 'b', ready: true });
  });
  socket.on('game:move', payload => {
    if (!socket.data.roomId || !payload || socket.data.color !== payload.color) return;
    socket.to(socket.data.roomId).emit('game:move', payload);
  });
  socket.on('game:reset', () => {
    if (socket.data.roomId) io.to(socket.data.roomId).emit('game:reset');
  });
  socket.on('disconnect', () => leaveRoom(socket));
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Manju Chess is running at http://localhost:${port}`));
