# Domino Sky

A client-side airline disruption cascade simulator built with Vite, React, TypeScript, Tailwind CSS and Vitest. All simulation and recovery calculations run in the browser; no server or API key is required.

## 1. Add the supplied network data

Place the exact supplied `flight_network.json` at:

```text
src/data/flight_network.json
```

The repository includes an **empty schema placeholder** at that path so the app can compile before the dataset is supplied. Replace it with your original data file. No airport, flight, connection, crew, or spare-aircraft records have been fabricated.

Expected top-level shape:

```json
{
  "airports": [{ "id": "...", "city": "...", "lat": 0, "lng": 0 }],
  "flights": [{ "flight_id": "...", "tail_id": "...", "leg_order": 1, "origin": "...", "destination": "...", "dep": "HH:MM", "arr": "HH:MM", "block_minutes": 0, "pax": 0, "turnaround_before_min": 0 }],
  "connections": [{ "from_flight": "...", "to_flight": "...", "passengers": 0, "min_connect_minutes": 0 }],
  "crews": [{ "tail_id": "...", "duty_start": "HH:MM", "max_duty_mins": 0, "flight_ids": ["..."] }],
  "spare_aircraft": [{ "tail_id": "...", "base": "...", "available_from": "HH:MM" }]
}
```

The property names and value types should match the supplied file. Keep the original records intact.

## 2. Run locally

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## 3. Test and build

```bash
npm test
npm run build
```

Three deterministic engine tests cover no-disruption baseline, tail-rotation delay propagation, and missed-connection arithmetic.

## Simulation model

- `HH:MM` values are converted to minutes since midnight by `src/engine/time.ts`.
- A closure affects flights scheduled to depart from or arrive at the closed airport during the half-open interval `[start, end)`. Such a flight's departure is held until closure end.
- Each tail is processed by `leg_order`. A flight departs at the maximum of schedule, previous actual arrival plus its turnaround requirement, and closure hold.
- Arrival is actual departure plus `block_minutes`; departure delay is actual minus scheduled departure.
- A connection is missed when `actualDep(to) - actualArr(from) < min_connect_minutes`; the connection's passenger count is added to stranded passengers.
- Crew duty is measured from `duty_start` to the latest actual arrival among the crew's listed flights.
- Recovery enumerates cancellations and spare-aircraft swaps where the spare base equals the flight origin and it is available by scheduled departure. Each candidate is re-simulated and ranked by passengers saved, then delay minutes saved.

## Recovery and Gemini extension

The recovery explanation is generated deterministically from before/after engine metrics. The UI marks Gemini as an optional future integration. **Never put a Gemini key in a `VITE_*` variable**: Vite exposes those variables to browser code. If Gemini is added later, create a small server-side endpoint that reads a non-`VITE_` secret such as `GEMINI_API_KEY`; the frontend can call that endpoint. The app does not call Gemini today.

## Project structure

```text
src/
  data/flight_network.json
  engine/time.ts
  engine/simulate.ts
  test/simulate.test.ts
  App.tsx
  main.tsx
  styles.css
  types.ts
```
