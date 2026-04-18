// routes/flights.js — Flight search & reference data
const express = require('express');
const pool    = require('./db');
const router  = express.Router();

// ─── GET /api/flights/airports ────────────────────────────────
// Returns all active airports for the From/To dropdowns in the frontend
router.get('/airports', async (req, res) => {
  try {
    const [airports] = await pool.execute(
      `SELECT airport_id, airport_name, iata_code, city, state, terminal_code
       FROM airports
       WHERE is_active = TRUE
       ORDER BY city`
    );
    return res.json({ success: true, airports });
  } catch (err) {
    console.error('Airports error:', err);
    return res.status(500).json({ success: false, message: 'Could not fetch airports.' });
  }
});

// ─── GET /api/flights/categories ─────────────────────────────
// Returns passenger categories (General, Student, Senior, etc.)
// Used to populate the Register form and booking form
router.get('/categories', async (req, res) => {
  try {
    const [categories] = await pool.execute(
      `SELECT category_id, category_name, discount_pct, required_doc
       FROM passenger_categories
       WHERE is_active = TRUE
       ORDER BY category_id`
    );
    return res.json({ success: true, categories });
  } catch (err) {
    console.error('Categories error:', err);
    return res.status(500).json({ success: false, message: 'Could not fetch categories.' });
  }
});

// ─── GET /api/flights/fare-classes ────────────────────────────
// Returns Economy / Business fare classes with multipliers
router.get('/fare-classes', async (req, res) => {
  try {
    const [classes] = await pool.execute(
      `SELECT class_id, class_name, free_baggage_kg, seat_selection, price_multiplier
       FROM fare_classes WHERE is_active = TRUE ORDER BY class_id`
    );
    return res.json({ success: true, fareClasses: classes });
  } catch (err) {
    console.error('Fare classes error:', err);
    return res.status(500).json({ success: false, message: 'Could not fetch fare classes.' });
  }
});

// ─── GET /api/flights/search ──────────────────────────────────
// Query params: from (IATA), to (IATA), date (YYYY-MM-DD), class_id
// Matches the frontend searchFlights() behaviour
router.get('/search', async (req, res) => {
  const { from, to, date, class_id } = req.query;

  if (!from || !to || !date) {
    return res.status(400).json({ success: false, message: 'from, to, and date are required.' });
  }
  if (from.toUpperCase() === to.toUpperCase()) {
    return res.status(400).json({ success: false, message: 'Origin and destination cannot be the same.' });
  }

  try {
    // Search flights by IATA codes on the given date, joining all related tables
    const [flights] = await pool.execute(
      `SELECT
          f.flight_id,
          f.flight_number,
          f.departure_time,
          f.arrival_time,
          f.base_fare,
          f.status,
          f.delay_minutes,
          al.airline_name,
          al.iata_code  AS airline_iata,
          orig.city     AS from_city,
          orig.iata_code AS from_iata,
          orig.airport_name AS from_airport,
          dest.city     AS to_city,
          dest.iata_code AS to_iata,
          dest.airport_name AS to_airport,
          ac.model      AS aircraft_model,
          ac.registration_no,
          TIMESTAMPDIFF(MINUTE, f.departure_time, f.arrival_time) AS duration_min,
          (SELECT COUNT(*) FROM seat_inventory si
           WHERE si.flight_id = f.flight_id
             AND si.is_available = TRUE
             AND si.is_blocked   = FALSE
             AND si.class_id     = COALESCE(?, si.class_id)) AS available_seats
       FROM flights    f
       JOIN routes     r    ON f.route_id    = r.route_id
       JOIN airports   orig ON r.origin_airport_id      = orig.airport_id
       JOIN airports   dest ON r.destination_airport_id = dest.airport_id
       JOIN aircrafts  ac   ON f.aircraft_id  = ac.aircraft_id
       JOIN airlines   al   ON ac.airline_id  = al.airline_id
       WHERE orig.iata_code = ?
         AND dest.iata_code = ?
         AND DATE(f.departure_time) = ?
         AND f.status IN ('Scheduled','Boarding')
         AND f.is_active = TRUE
       ORDER BY f.departure_time`,
      [class_id || null, from.toUpperCase(), to.toUpperCase(), date]
    );

    return res.json({ success: true, flights });
  } catch (err) {
    console.error('Flight search error:', err);
    return res.status(500).json({ success: false, message: 'Flight search failed.' });
  }
});

// ─── GET /api/flights/:flightId/seats ─────────────────────────
// Returns available seats for a flight, optionally filtered by class_id
// Used to populate the seat picker in the booking form
router.get('/:flightId/seats', async (req, res) => {
  const { flightId } = req.params;
  const { class_id }  = req.query;

  try {
    let query = `
      SELECT
          si.seat_id,
          si.seat_number,
          si.is_available,
          fc.class_id,
          fc.class_name,
          st.type_id,
          st.type_name   AS seat_type,
          st.surcharge
      FROM seat_inventory si
      JOIN fare_classes   fc ON si.class_id = fc.class_id
      JOIN seat_types     st ON si.type_id  = st.type_id
      WHERE si.flight_id   = ?
        AND si.is_blocked  = FALSE`;

    const params = [flightId];
    if (class_id) {
      query += ' AND si.class_id = ?';
      params.push(class_id);
    }
    query += ' ORDER BY si.seat_number';

    const [seats] = await pool.execute(query, params);
    return res.json({ success: true, seats });
  } catch (err) {
    console.error('Seats error:', err);
    return res.status(500).json({ success: false, message: 'Could not fetch seat data.' });
  }
});

module.exports = router;
