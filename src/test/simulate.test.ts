import { describe, expect, it } from 'vitest';
import { simulate } from '../engine/simulate';
import type { FlightNetwork } from '../types';

const base: FlightNetwork = {
  airports:[{id:'AAA',city:'Alpha',lat:0,lng:0},{id:'BBB',city:'Beta',lat:1,lng:1},{id:'CCC',city:'Gamma',lat:2,lng:2}],
  flights:[
    {flight_id:'F1',tail_id:'T1',leg_order:1,origin:'AAA',destination:'BBB',dep:'08:00',arr:'09:00',block_minutes:60,pax:100,turnaround_before_min:0},
    {flight_id:'F2',tail_id:'T1',leg_order:2,origin:'BBB',destination:'CCC',dep:'10:00',arr:'11:00',block_minutes:60,pax:90,turnaround_before_min:30}
  ],connections:[],crews:[],spare_aircraft:[]
};
describe('simulate',()=>{
  it('has zero delay when there is no disruption',()=>{
    const result=simulate(base,{airportId:'AAA',start:0,duration:0});
    expect(result.metrics.delayedFlights).toBe(0);
    expect(result.metrics.totalDelayMinutes).toBe(0);
  });
  it('propagates delay along a tail rotation',()=>{
    const result=simulate(base,{airportId:'AAA',start:8*60,duration:60});
    expect(result.flights.find(f=>f.flight_id==='F1')?.delayMin).toBe(60);
    expect(result.flights.find(f=>f.flight_id==='F2')?.delayMin).toBe(30);
  });
  it('marks a connection missed when remaining time is below minimum connect time',()=>{
    const data:FlightNetwork={...base,connections:[{from_flight:'F1',to_flight:'F2',passengers:24,min_connect_minutes:45}]};
    const result=simulate(data,{airportId:'AAA',start:8*60,duration:60});
    expect(result.missedConnections).toHaveLength(1);
    expect(result.missedConnections[0].shortfall).toBe(15);
    expect(result.metrics.strandedPassengers).toBe(24);
  });
});
