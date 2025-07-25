// server.js
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const socketIO = require('socket.io');
const User = require('./models/User');
const Message = require('./models/Message');

require('dotenv').config();

const env = process.env.PORT ;
console.log('Server running on port', env);

const app = express();
const server = http.createServer(app);
const io = socketIO(server, { cors: { origin: '*' } });


app.use(cors());
app.use(express.json());

mongoose.connect('mongodb://127.0.0.1:27017/chat-app');

const groupSchema = new mongoose.Schema({
  name: String,
  members: [String],
});
const Group = mongoose.model('Group', groupSchema);

const userSockets = {};

io.on('connection', socket => {
  socket.on('login', async username => {
    socket.username = username;
    userSockets[username] = userSockets[username] || [];
    userSockets[username].push(socket.id);

    const groups = await Group.find({ members: username });
    groups.forEach(g => socket.join(g._id.toString()));
  });

  socket.on('send-message', async ({ to, content, isGroup }) => {
    const from = socket.username;
    const msgObj = { sender: from, receiver: to, content };
    if (isGroup) msgObj.isGroup = true;

    const msg = await Message.create(msgObj);

    if (isGroup) {
      io.to(to).emit('receive-message', {
        sender: msg.sender,
        receiver: msg.receiver,
        content: msg.content,
        isGroup: true,
        timestamp: msg.timestamp,
      });
    } else {
      [from, to].forEach(u =>
        (userSockets[u] || []).forEach(sid =>
          io.to(sid).emit('receive-message', {
            sender: msg.sender,
            receiver: msg.receiver,
            content: msg.content,
            isGroup: false,
            timestamp: msg.timestamp,
          })
        )
      );
    }
  });

  socket.on('call-user', ({ to, offer }) => {
    (userSockets[to] || []).forEach(sid => {
      io.to(sid).emit('incoming-call', {
        from: socket.username,
        offer,
        type: 'offer'
      });
    });
  });

  socket.on('answer-call', ({ to, answer }) => {
    (userSockets[to] || []).forEach(sid => {
      io.to(sid).emit('call-answer', {
        from: socket.username,
        answer,
        type: 'answer'
      });
    });
  });

  socket.on('call-candidate', ({ to, candidate }) => {
    (userSockets[to] || []).forEach(sid => {
      io.to(sid).emit('call-candidate', {
        from: socket.username,
        candidate
      });
    });
  });
});

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (await User.findOne({ username })) return res.status(400).json({ error: 'Username already taken' });
  const u = await User.create({ username, password });
  res.json({ username: u.username });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const u = await User.findOne({ username, password });
  if (!u) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ username: u.username });
});

app.get('/api/users/:me', async (req, res) => {
  const users = await User.find({ username: { $ne: req.params.me } });
  res.json(users);
});

app.get('/api/users/:me/groups', async (req, res) => {
  const groups = await Group.find({ members: req.params.me });
  res.json(groups);
});

app.post('/api/groups', async (req, res) => {
  const { name, members } = req.body;
  const g = await Group.create({ name, members });
  res.json(g);
});

app.get('/api/messages/:me/:peer', async (req, res) => {
  const { me, peer } = req.params;
  const msgs = await Message.find({
    $or: [
      { sender: me, receiver: peer },
      { sender: peer, receiver: me }
    ]
  }).sort('timestamp');
  res.json(msgs);
});

server.listen(env, () => console.log('Server running on port 5000'));
