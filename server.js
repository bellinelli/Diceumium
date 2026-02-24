const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const parties = new Map();

function getOrCreateParty(partyCode) {
  if (!parties.has(partyCode)) {
    parties.set(partyCode, {
      members: new Map(),
      masterSocketId: null,
      createdAt: Date.now()
    });
  }
  return parties.get(partyCode);
}

function getMemberList(party) {
  return Array.from(party.members.values()).map((m) => ({
    id: m.id,
    name: m.name,
    isMaster: m.isMaster
  }));
}

function cleanupParty(partyCode) {
  const party = parties.get(partyCode);
  if (!party) return;
  if (party.members.size === 0) {
    parties.delete(partyCode);
  }
}

io.on('connection', (socket) => {
  socket.data.partyCode = null;

  socket.on('party:create', ({ partyCode, name }) => {
    if (!partyCode || !name) return;

    const party = getOrCreateParty(partyCode);

    if (party.members.size > 0) {
      socket.emit('party:error', 'Essa party já existe. Use "Entrar".');
      return;
    }

    party.masterSocketId = socket.id;
    party.members.set(socket.id, { id: socket.id, name, isMaster: true });
    socket.join(partyCode);
    socket.data.partyCode = partyCode;

    socket.emit('party:joined', {
      partyCode,
      youAreMaster: true,
      members: getMemberList(party)
    });

    io.to(partyCode).emit('party:members', getMemberList(party));
  });

  socket.on('party:join', ({ partyCode, name }) => {
    const party = parties.get(partyCode);
    if (!party) {
      socket.emit('party:error', 'Party não encontrada.');
      return;
    }
    if (!name) {
      socket.emit('party:error', 'Nome inválido.');
      return;
    }

    party.members.set(socket.id, { id: socket.id, name, isMaster: false });
    socket.join(partyCode);
    socket.data.partyCode = partyCode;

    socket.emit('party:joined', {
      partyCode,
      youAreMaster: false,
      members: getMemberList(party)
    });

    io.to(partyCode).emit('party:members', getMemberList(party));
  });

  socket.on('roll:send', (payload) => {
    const partyCode = socket.data.partyCode;
    if (!partyCode) return;
    const party = parties.get(partyCode);
    if (!party) return;

    const sender = party.members.get(socket.id);
    if (!sender) return;

    const message = {
      from: sender.name,
      isMaster: sender.isMaster,
      dice: payload.dice,
      value: payload.value,
      max: payload.max,
      visibility: payload.visibility,
      critical: payload.critical,
      timestamp: Date.now(),
      note: payload.note || ''
    };

    if (payload.visibility === 'hidden') {
      socket.emit('roll:new', { ...message, privateReason: 'hidden' });
      return;
    }

    if (payload.visibility === 'master') {
      socket.emit('roll:new', { ...message, privateReason: 'master-self' });
      if (party.masterSocketId && party.masterSocketId !== socket.id) {
        io.to(party.masterSocketId).emit('roll:new', {
          ...message,
          privateReason: 'master-only'
        });
      }
      return;
    }

    io.to(partyCode).emit('roll:new', message);
  });

  socket.on('disconnect', () => {
    const partyCode = socket.data.partyCode;
    if (!partyCode) return;
    const party = parties.get(partyCode);
    if (!party) return;

    party.members.delete(socket.id);

    if (party.masterSocketId === socket.id) {
      const nextMaster = party.members.values().next().value;
      if (nextMaster) {
        party.masterSocketId = nextMaster.id;
        nextMaster.isMaster = true;
      } else {
        party.masterSocketId = null;
      }
    }

    io.to(partyCode).emit('party:members', getMemberList(party));
    cleanupParty(partyCode);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Diceumium rodando em http://localhost:${PORT}`);
});
