require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const Redis = require('ioredis');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Database & Cache Initialization
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const redis = new Redis(process.env.UPSTASH_REDIS_URL);

// 1. Base Health Endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// 2. Supabase Connection Test (Insert & Select)
app.get('/test-db', async (req, res) => {
  try {
    const testCode = 'TEST' + Math.floor(1000 + Math.random() * 9000);
    const { data: insertData, error: insertError } = await supabase
      .from('trips')
      .insert([{ trip_code: testCode }])
      .select();

    if (insertError) throw insertError;

    res.json({ success: true, inserted: insertData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Upstash Redis Connection Test (Set, Get, Expire)
app.get('/test-redis', async (req, res) => {
  try {
    await redis.set('active_test', 'Redis Working!', 'EX', 60);
    const cachedVal = await redis.get('active_test');
    res.json({ success: true, value: cachedVal });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/', (req, res) => {
    res.json({ message: 'Welcome to JourneyKnot API server is running successfully!' });
  });

// 4. Socket.io Connection Handler
io.on('connection', (socket) => {
  console.log(`[Socket] Device connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[Socket] Device disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

