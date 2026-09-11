// index.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const Redis = require('ioredis');

const tripRoutes = require('./routes/trip');

// ------------------------------------------------------------
// APP SETUP
// ------------------------------------------------------------

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*', // tighten this before launch
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// ------------------------------------------------------------
// SUPABASE
// ------------------------------------------------------------

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ------------------------------------------------------------
// UPSTASH REDIS
// ------------------------------------------------------------

const redis = new Redis(process.env.UPSTASH_REDIS_URL);

redis.on('connect', () => {
  console.log('Connected to Upstash Redis');
});

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

// ------------------------------------------------------------
// ROUTES
// ------------------------------------------------------------

app.get('/', (req, res) => {
  res.json({ status: 'JourneyKnot backend is running' });
});

// Quick Supabase connectivity test
app.get('/test-supabase', async (req, res) => {
  const { data, error } = await supabase.from('trips').select('*').limit(1);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, data });
});

// Quick Redis connectivity test
app.get('/test-redis', async (req, res) => {
  await redis.set('test_key', 'hello');
  const value = await redis.get('test_key');
  res.json({ ok: true, value });
});

// Trip routes (create, join, members)
app.use('/trip', tripRoutes);

// ------------------------------------------------------------
// SOCKET.IO
// ------------------------------------------------------------

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User joins a trip room
  socket.on('join_trip', ({ tripCode, userId, nickname }) => {
    socket.join(tripCode);
    socket.data.userId = userId;
    socket.data.nickname = nickname;
    socket.data.tripCode = tripCode;

    console.log(`${nickname} joined trip ${tripCode}`);

    // Let others in the room know someone joined
    socket.to(tripCode).emit('member_joined', {
      userId,
      nickname,
    });
  });

  // Location update from a member, broadcast to everyone else in the trip
  socket.on('location_update', ({ tripCode, userId, nickname, lat, lng }) => {
    socket.to(tripCode).emit('member_location', {
      userId,
      nickname,
      lat,
      lng,
      timestamp: Date.now(),
    });
  });

  // User leaves a trip explicitly
  socket.on('leave_trip', ({ tripCode, userId }) => {
    socket.leave(tripCode);
    socket.to(tripCode).emit('member_left', { userId });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    if (socket.data.tripCode && socket.data.userId) {
      socket.to(socket.data.tripCode).emit('member_left', {
        userId: socket.data.userId,
      });
    }
  });
});

// ------------------------------------------------------------
// START SERVER
// ------------------------------------------------------------

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`JourneyKnot backend running on port ${PORT}`);
});