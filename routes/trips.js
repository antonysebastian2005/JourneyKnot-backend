const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // service role key, backend only
);

function generateTripCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Create a trip
router.post('/create', async (req, res) => {
  const { hostId, nickname } = req.body;

  if (!hostId || !nickname) {
    return res.status(400).json({ error: 'hostId and nickname required' });
  }

  const tripCode = generateTripCode();

  const { data: trip, error } = await supabase
    .from('trips')
    .insert({ trip_code: tripCode, host_id: hostId })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('trip_members').insert({
    trip_id: trip.id,
    user_id: hostId,
    nickname,
  });

  res.json({ tripId: trip.id, tripCode: trip.trip_code });
});

// Join a trip
router.post('/join', async (req, res) => {
  const { tripCode, userId, nickname } = req.body;

  if (!tripCode || !userId || !nickname) {
    return res.status(400).json({ error: 'tripCode, userId, nickname required' });
  }

  const { data: trip, error } = await supabase
    .from('trips')
    .select('*')
    .eq('trip_code', tripCode.toUpperCase())
    .eq('status', 'active')
    .single();

  if (error || !trip) {
    return res.status(404).json({ error: 'Trip not found' });
  }

  await supabase.from('trip_members').insert({
    trip_id: trip.id,
    user_id: userId,
    nickname,
  });

  res.json({ tripId: trip.id, tripCode: trip.trip_code });
});

// Get trip members
router.get('/:tripCode/members', async (req, res) => {
  const { data: trip } = await supabase
    .from('trips')
    .select('id')
    .eq('trip_code', req.params.tripCode.toUpperCase())
    .single();

  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  const { data: members } = await supabase
    .from('trip_members')
    .select('user_id, nickname')
    .eq('trip_id', trip.id);

  res.json(members);
});

module.exports = router;