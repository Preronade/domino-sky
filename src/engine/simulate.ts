import type { Connection, Disruption, Flight, FlightNetwork, FlightResult, RecoveryAction, RecoveryCandidate, SimulationResult } from '../types';
import { fromMinutes, toMinutes } from './time';

export type SimulationOverrides = { cancelledFlightIds?: string[]; swaps?: Record<string, string> };

export function simulate(network: FlightNetwork, disruption: Disruption, overrides: SimulationOverrides = {}): SimulationResult {
  const cancelled = new Set(overrides.cancelledFlightIds ?? []);
  const flightsByTail = new Map<string, Flight[]>();
  const effectiveFlights = network.flights.map(flight => overrides.swaps?.[flight.flight_id] ? { ...flight, tail_id: overrides.swaps[flight.flight_id] } : flight);
  for (const flight of effectiveFlights) {
    const list = flightsByTail.get(flight.tail_id) ?? [];
    list.push(flight); flightsByTail.set(flight.tail_id, list);
  }
  const results = new Map<string, FlightResult>();
  const closureEnd = disruption.start + disruption.duration;
  const closureStart = disruption.start;

  for (const [tail, rotation] of flightsByTail) {
    rotation.sort((a,b) => a.leg_order - b.leg_order);
    let previousArrival = Number.NEGATIVE_INFINITY;
    let previousFlight: FlightResult | undefined;
    for (const flight of rotation) {
      const schedDep = toMinutes(flight.dep);
      const schedArr = schedDep + flight.block_minutes;
      const swappedTail = overrides.swaps?.[flight.flight_id];
      const operatingTail = swappedTail ?? tail;
      if (cancelled.has(flight.flight_id)) {
        const cancelledResult: FlightResult = { ...flight, schedDep, schedArr, actualDep: schedDep, actualArr: schedArr, newDep: '—', delayMin: 0, status: 'cancelled', cause: 'Cancelled as a recovery action', causeChain: [`${flight.flight_id} cancelled to protect downstream passengers`] };
        results.set(flight.flight_id, cancelledResult);
        continue;
      }
      const priorArrival = previousArrival;
      const rotationReady = priorArrival + flight.turnaround_before_min;
      let closureHold = Number.NEGATIVE_INFINITY;
      const scheduledTouchesClosure = (flight.origin === disruption.airportId && schedDep >= closureStart && schedDep < closureEnd)
        || (flight.destination === disruption.airportId && schedArr >= closureStart && schedArr < closureEnd);
      if (scheduledTouchesClosure) closureHold = closureEnd;
      const actualDep = Math.max(schedDep, rotationReady, closureHold);
      const actualArr = actualDep + flight.block_minutes;
      const delayMin = Math.max(0, actualDep - schedDep);
      const causeChain: string[] = [];
      let cause = 'Scheduled departure';
      if (closureHold > Number.NEGATIVE_INFINITY && actualDep === closureHold) {
        cause = `${disruption.airportId} closure`;
        causeChain.push(`${flight.flight_id} held until ${fromMinutes(closureEnd)} because ${disruption.airportId} is closed`);
      }
      if (previousFlight && actualDep === rotationReady && rotationReady > schedDep) {
        cause = `${operatingTail} previous flight`;
        causeChain.unshift(`${flight.flight_id} delayed because ${operatingTail}'s previous flight ${previousFlight.flight_id} arrived at ${fromMinutes(previousFlight.actualArr)}`);
        if (previousFlight.causeChain.length) causeChain.unshift(...previousFlight.causeChain);
      }
      if (!delayMin) { cause = 'On schedule'; causeChain.push(`${flight.flight_id} operates on its scheduled departure`); }
      const result: FlightResult = { ...flight, tail_id: operatingTail, schedDep, schedArr, actualDep, actualArr, newDep: fromMinutes(actualDep), delayMin, status: delayMin > 0 ? 'delayed' : 'on-time', cause, causeChain };
      results.set(flight.flight_id, result);
      previousArrival = actualArr;
      previousFlight = result;
    }
  }

  const flights = network.flights.map(f => results.get(f.flight_id)!).sort((a,b) => a.schedDep - b.schedDep);
  const missedConnections = network.connections.flatMap((connection: Connection) => {
    const from = results.get(connection.from_flight), to = results.get(connection.to_flight);
    if (!from || !to) return [];
    if (from.status === 'cancelled' || to.status === 'cancelled') return [{ connection, shortfall: connection.min_connect_minutes }];
    const shortfall = connection.min_connect_minutes - (to.actualDep - from.actualArr);
    return shortfall > 0 ? [{ connection, shortfall }] : [];
  });
  const crewViolations = network.crews.flatMap(crew => {
    const crewFlights = crew.flight_ids.map(id => results.get(id)).filter((f): f is FlightResult => !!f && f.status !== 'cancelled');
    if (!crewFlights.length) return [];
    const lastArrival = Math.max(...crewFlights.map(f => f.actualArr));
    const duty = lastArrival - toMinutes(crew.duty_start);
    return duty > crew.max_duty_mins ? [`${crew.tail_id}: duty ${duty} min exceeds ${crew.max_duty_mins} min by ${duty - crew.max_duty_mins} min`] : [];
  });
  const strandedPassengers = missedConnections.reduce((sum, item) => sum + item.connection.passengers, 0);
  return { flights, missedConnections, crewViolations, metrics: {
    delayedFlights: flights.filter(f => f.status === 'delayed').length,
    totalDelayMinutes: flights.reduce((sum,f) => sum + f.delayMin, 0),
    strandedPassengers, crewViolations: crewViolations.length
  }};
}

export function recoveryOptions(network: FlightNetwork, disruption: Disruption, baseline: SimulationResult): RecoveryCandidate[] {
  const candidates: RecoveryCandidate[] = [];
  for (const flight of network.flights) {
    if (baseline.flights.find(f => f.flight_id === flight.flight_id)?.status === 'cancelled') continue;
    const actions: RecoveryAction[] = [{ id: `cancel-${flight.flight_id}`, type: 'cancel', flightId: flight.flight_id, label: `Cancel ${flight.flight_id}` }];
    for (const spare of network.spare_aircraft) {
      if (spare.base !== flight.origin) continue;
      if (toMinutes(spare.available_from) > toMinutes(flight.dep)) continue;
      actions.push({ id: `swap-${flight.flight_id}-${spare.tail_id}`, type: 'swap', flightId: flight.flight_id, spareTail: spare.tail_id, label: `Swap ${flight.flight_id} to ${spare.tail_id}` });
    }
    for (const action of actions) {
      const overrides: SimulationOverrides = action.type === 'cancel' ? { cancelledFlightIds: [flight.flight_id] } : { swaps: { [flight.flight_id]: action.spareTail! } };
      const result = simulate(network, disruption, overrides);
      const passengersSaved = Math.max(0, baseline.metrics.strandedPassengers - result.metrics.strandedPassengers);
      const delayMinutesSaved = Math.max(0, baseline.metrics.totalDelayMinutes - result.metrics.totalDelayMinutes);
      candidates.push({ action, result, passengersSaved, delayMinutesSaved, explanation: explanation(action, baseline, result, passengersSaved, delayMinutesSaved) });
    }
  }
  return candidates.sort((a,b) => b.passengersSaved - a.passengersSaved || b.delayMinutesSaved - a.delayMinutesSaved || a.action.id.localeCompare(b.action.id)).slice(0,3);
}

function explanation(action: RecoveryAction, before: SimulationResult, after: SimulationResult, saved: number, delaySaved: number): string {
  const operation = action.type === 'cancel' ? `Cancelling ${action.flightId}` : `Using spare aircraft ${action.spareTail} for ${action.flightId}`;
  if (saved === 0 && delaySaved === 0) return `${operation} does not improve the measured passenger or delay outcomes in this scenario.`;
  return `${operation} reduces stranded passengers from ${before.metrics.strandedPassengers} to ${after.metrics.strandedPassengers} (${saved} saved) and total delay from ${before.metrics.totalDelayMinutes} to ${after.metrics.totalDelayMinutes} minutes (${delaySaved} minutes recovered).`;
}
