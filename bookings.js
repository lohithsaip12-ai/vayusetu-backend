// routes/bookings.js — /api/bookings/*
// All routes that modify data require a valid JWT (requireAuth middleware)
const express     = require('express');
const pool        = require('./db');
const { requireAuth } = require('./auth');
const router      = express.Router();

// ─── POST /api/bookings ───────────────────────────────────────
// Create a new booking by calling sp_create_booking stored procedure.
// Body: { flight_id, class_id, seat_id, passenger_name, age,
//         passenger_type, category_id }
// Matches the frontend confirmBooking() call.
router.post('/', requireAuth, async (req, res) => {
  const {
    flight_id,
    class_id,
    seat_id,
    passenger_name,
    age,
    passenger_type = 'ADULT',
    category_id    = 1
  } = req.body;

  const user_id = req.user.userId;

  if (!flight_id || !class_id || !seat_id || !passenger_name || !age) {
    return res.status(400).json({ success: false, message: 'Missing required booking fields.' });
  }

  try {
    // sp_create_booking uses OUT parameters; we call it and read them back
    await pool.execute(
      `CALL sp_create_booking(?, ?, ?, ?, ?, ?, ?, ?, @booking_id, @pnr, @total_fare, @message)`,
      [user_id, flight_id, class_id, seat_id, passenger_name, age, passenger_type, category_id]
    );

    const [[result]] = await pool.execute(
      'SELECT @booking_id AS booking_id, @pnr AS pnr, @total_fare AS total_fare, @message AS message'
    );

    if (!result.booking_id) {
      return res.status(400).json({ success: false, message: result.message || 'Booking failed.' });
    }

    return res.status(201).json({
      success:    true,
      message:    result.message,
      booking_id: result.booking_id,
      pnr:        result.pnr,
      total_fare: result.total_fare
    });

  } catch (err) {
    // Surface DB trigger / procedure error messages clearly
    if (err.code === 'ER_SIGNAL_EXCEPTION') {
      return res.status(400).json({ success: false, message: err.sqlMessage });
    }
    console.error('Create booking error:', err);
    return res.status(500).json({ success: false, message: 'Booking failed. Please try again.' });
  }
});

// ─── GET /api/bookings/my ─────────────────────────────────────
// Returns all bookings for the currently logged-in user.
// Matches the frontend renderMyBookings() which filters by email.
router.get('/my', requireAuth, async (req, res) => {
  try {
    const [bookings] = await pool.execute(
      `SELECT
          b.booking_id,
          b.pnr_number,
          b.booking_status,
          b.base_fare,
          b.special_fare_discount,
          b.seat_surcharge,
          b.gst_amount,
          b.total_fare,
          b.refund_amount,
          b.created_at        AS booked_on,
          b.cancelled_at,
          f.flight_number,
          f.departure_time,
          f.arrival_time,
          al.airline_name,
          orig.city           AS from_city,
          orig.iata_code      AS from_iata,
          dest.city           AS to_city,
          dest.iata_code      AS to_iata,
          fc.class_name,
          bp.passenger_name,
          bp.age,
          bp.passenger_type,
          bp.extra_baggage_kg,
          si.seat_number,
          st.type_name        AS seat_type
       FROM bookings b
       JOIN flights      f    ON b.flight_id              = f.flight_id
       JOIN routes       r    ON f.route_id               = r.route_id
       JOIN airports     orig ON r.origin_airport_id      = orig.airport_id
       JOIN airports     dest ON r.destination_airport_id = dest.airport_id
       JOIN aircrafts    ac   ON f.aircraft_id            = ac.aircraft_id
       JOIN airlines     al   ON ac.airline_id            = al.airline_id
       JOIN fare_classes fc   ON b.class_id               = fc.class_id
       JOIN booking_passengers bp ON bp.booking_id        = b.booking_id
       JOIN seat_inventory si ON bp.seat_id               = si.seat_id
       JOIN seat_types     st ON si.type_id               = st.type_id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC`,
      [req.user.userId]
    );

    return res.json({ success: true, bookings });
  } catch (err) {
    console.error('My bookings error:', err);
    return res.status(500).json({ success: false, message: 'Could not fetch bookings.' });
  }
});

// ─── GET /api/bookings/pnr/:pnr ───────────────────────────────
// PNR lookup — calls sp_get_booking_details.
// Matches the frontend lookupPnr() function.
router.get('/pnr/:pnr', async (req, res) => {
  const pnr = req.params.pnr.toUpperCase().trim();

  if (!pnr || pnr.length !== 6) {
    return res.status(400).json({ success: false, message: 'PNR must be exactly 6 characters.' });
  }

  try {
    // sp_get_booking_details returns two result sets:
    //   [0] — booking summary   [1] — passenger list
    const [resultSets] = await pool.query('CALL sp_get_booking_details(?)', [pnr]);

    const booking    = resultSets[0]?.[0];   // first result set, first row
    const passengers = resultSets[1];        // second result set

    if (!booking) {
      return res.status(404).json({ success: false, message: `No booking found for PNR ${pnr}.` });
    }

    return res.json({ success: true, booking, passengers });
  } catch (err) {
    console.error('PNR lookup error:', err);
    return res.status(500).json({ success: false, message: 'PNR lookup failed.' });
  }
});

// ─── DELETE /api/bookings/:bookingId ──────────────────────────
// Cancel a booking — calls sp_cancel_booking.
// Matches the frontend cancelBooking(pnr) function.
// Uses booking_id for a secure owner-check (the procedure verifies user_id).
router.delete('/:bookingId', requireAuth, async (req, res) => {
  const booking_id = parseInt(req.params.bookingId);
  const user_id    = req.user.userId;

  if (!booking_id || isNaN(booking_id)) {
    return res.status(400).json({ success: false, message: 'Invalid booking ID.' });
  }

  try {
    await pool.execute(
      'CALL sp_cancel_booking(?, ?, @refund, @message)',
      [booking_id, user_id]
    );

    const [[result]] = await pool.execute(
      'SELECT @refund AS refund, @message AS message'
    );

    // The procedure sets @refund = 0 and a descriptive message on failure
    if (result.message && result.message.toLowerCase().includes('not found')) {
      return res.status(404).json({ success: false, message: result.message });
    }
    if (result.message && (
      result.message.toLowerCase().includes('already') ||
      result.message.toLowerCase().includes('cannot') ||
      result.message.toLowerCase().includes('failed')
    )) {
      return res.status(400).json({ success: false, message: result.message });
    }

    return res.json({
      success: true,
      message: result.message,
      refund:  result.refund
    });

  } catch (err) {
    if (err.code === 'ER_SIGNAL_EXCEPTION') {
      return res.status(400).json({ success: false, message: err.sqlMessage });
    }
    console.error('Cancel booking error:', err);
    return res.status(500).json({ success: false, message: 'Cancellation failed. Please try again.' });
  }
});

module.exports = router;
