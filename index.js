require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const Redis = require('ioredis');

const app = express();

// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.use(cors());
app.use(express.json());

// --------------------------------------------------
// HTTP Server
// --------------------------------------------------

const server = http.createServer(app);

// --------------------------------------------------
// Socket.IO
// --------------------------------------------------

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// --------------------------------------------------
// Environment Variables
// --------------------------------------------------

console.log('Checking environment variables...');

console.log(
  'SUPABASE_URL:',
  process.env.SUPABASE_URL ? 'OK' : 'MISSING'
);

console.log(
  'SUPABASE_KEY:',
  process.env.SUPABASE_KEY ? 'OK' : 'MISSING'
);

console.log(
  'UPSTASH_REDIS_URL:',
  process.env.UPSTASH_REDIS_URL ? 'OK' : 'MISSING'
);

// --------------------------------------------------
// Database & Cache
// --------------------------------------------------

let supabase = null;
let redis = null;

try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );

    console.log('✅ Supabase initialized');
  } else {
    console.error('❌ Supabase environment variables are missing');
  }
} catch (err) {
  console.error('❌ Supabase initialization failed:', err.message);
}

try {
  if (process.env.UPSTASH_REDIS_URL) {
    redis = new Redis(process.env.UPSTASH_REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) {
          console.error('❌ Redis connection failed after 3 attempts');
          return null;
        }

        return Math.min(times * 500, 2000);
      },
    });

    redis.on('connect', () => {
      console.log('✅ Redis connected');
    });

    redis.on('error', (err) => {
      console.error('❌ Redis error:', err.message);
    });
  } else {
    console.error('❌ UPSTASH_REDIS_URL is missing');
  }
} catch (err) {
  console.error('❌ Redis initialization failed:', err.message);
}

// --------------------------------------------------
// Base Health Endpoint
// --------------------------------------------------

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'JourneyKnot backend is healthy',
    timestamp: new Date().toISOString(),
  });
});

// --------------------------------------------------
// Root Endpoint
// --------------------------------------------------

app.get('/', (req, res) => {
  res.status(200).json({
    message:
      'Welcome to JourneyKnot API. Server is running successfully!',
  });
});

// --------------------------------------------------
// Supabase Connection Test
// --------------------------------------------------

app.get('/test-db', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Supabase is not initialized',
      });
    }

    const testCode =
      'TEST' + Math.floor(1000 + Math.random() * 9000);

    const { data: insertData, error: insertError } =
      await supabase
        .from('trips')
        .insert([
          {
            trip_code: testCode,
          },
        ])
        .select();

    if (insertError) {
      throw insertError;
    }

    res.status(200).json({
      success: true,
      inserted: insertData,
    });
  } catch (err) {
    console.error('❌ Supabase test failed:', err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// --------------------------------------------------
// Upstash Redis Connection Test
// --------------------------------------------------

app.get('/test-redis', async (req, res) => {
  try {
    if (!redis) {
      return res.status(500).json({
        success: false,
        error: 'Redis is not initialized',
      });
    }

    await redis.set(
      'active_test',
      'Redis Working!',
      'EX',
      60
    );

    const cachedVal = await redis.get('active_test');

    res.status(200).json({
      success: true,
      value: cachedVal,
    });
  } catch (err) {
    console.error('❌ Redis test failed:', err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// --------------------------------------------------
// Trip Routes
// --------------------------------------------------

const tripRoutes = require('./routes/trip');

app.use('/api/trips', tripRoutes);

// --------------------------------------------------
// 404 Handler
// --------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl,
  });
});

// --------------------------------------------------
// Socket.IO Connection Handler
// --------------------------------------------------

io.on('connection', (socket) => {
  console.log('👤 User connected:', socket.id);

  socket.on(
    'join_trip',
    ({ tripCode, userId, nickname }) => {
      if (!tripCode) {
        return;
      }

      socket.join(tripCode);

      socket.data.userId = userId;
      socket.data.nickname = nickname;
      socket.data.tripCode = tripCode;

      console.log(
        `${nickname} joined trip ${tripCode}`
      );
    }
  );

  socket.on(
    'location_update',
    ({
      tripCode,
      userId,
      nickname,
      lat,
      lng,
    }) => {
      if (!tripCode) {
        return;
      }

      socket.to(tripCode).emit('member_location', {
        userId,
        nickname,
        lat,
        lng,
        timestamp: Date.now(),
      });
    }
  );

  socket.on('disconnect', () => {
    console.log(
      '👋 User disconnected:',
      socket.id
    );
  });
});

// --------------------------------------------------
// Railway Server
// --------------------------------------------------

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('========================================');
  console.log('🚀 JourneyKnot Backend Started');
  console.log(`🌐 Port: ${PORT}`);
  console.log('📡 Host: 0.0.0.0');
  console.log('❤️  Health: /health');
  console.log('🗺️  Trips: /api/trips');
  console.log('========================================');
  console.log('');
});

// --------------------------------------------------
// Handle Unexpected Errors
// --------------------------------------------------

process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('❌ UNHANDLED REJECTION:', err);
});

