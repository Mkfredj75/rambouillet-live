import { NextRequest, NextResponse } from "next/server";

const PRIM_URL = "https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring";
const TER_LINE = "STIF:Line::C01744:";
const BUS_LINE = "STIF:Line::C00183:";

type SiriValue = { value?: string };
type StopVisit = {
  MonitoredVehicleJourney?: {
    LineRef?: SiriValue;
    DestinationName?: SiriValue[];
    VehicleJourneyName?: SiriValue[];
    JourneyNote?: SiriValue[];
    MonitoredCall?: {
      StopPointName?: SiriValue[];
      DestinationDisplay?: SiriValue[];
      ExpectedDepartureTime?: string;
      AimedDepartureTime?: string;
      DepartureStatus?: string;
      DeparturePlatformName?: SiriValue;
    };
    TrainNumbers?: { TrainNumberRef?: SiriValue[] };
  };
};

async function getPrim(monitoringRef: string, lineRef?: string): Promise<StopVisit[]> {
  const apiKey = process.env.PRIM_API_KEY;
  if (!apiKey) throw new Error("PRIM_API_KEY manquant");

  const params = new URLSearchParams({ MonitoringRef: monitoringRef });
  if (lineRef) params.set("LineRef", lineRef);

  const response = await fetch(`${PRIM_URL}?${params.toString()}`, {
    headers: { apiKey, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Erreur PRIM ${response.status}`);

  const data = await response.json();
  return data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit ?? [];
}

function value(first?: SiriValue[]) {
  return first?.[0]?.value ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const direction = request.nextUrl.searchParams.get("direction") === "paris-rambouillet"
      ? "paris-rambouillet"
      : "rambouillet-paris";

    const isReturn = direction === "paris-rambouillet";

    // 5302 : Prunelliers -> Marcel Dassault (aller)
    // 5302 : Gare de Rambouillet - Prud'homme -> Clairbois, via Prunelliers (retour)
    const busVisits = await getPrim(
      isReturn ? "STIF:StopPoint:Q:31265:" : "STIF:StopPoint:Q:31258:",
      BUS_LINE
    );

    const wantedBusDestination = isReturn ? "clairbois" : "marcel dassault";
    const bus = busVisits
      .map((visit) => {
        const journey = visit.MonitoredVehicleJourney;
        const call = journey?.MonitoredCall;
        return {
          line: "5302",
          stop: value(call?.StopPointName),
          destination: value(call?.DestinationDisplay) ?? value(journey?.DestinationName),
          expectedDepartureTime: call?.ExpectedDepartureTime ?? null,
          aimedDepartureTime: call?.AimedDepartureTime ?? null,
          status: call?.DepartureStatus ?? null,
        };
      })
      .filter((item) =>
        item.expectedDepartureTime &&
        item.destination?.toLowerCase().includes(wantedBusDestination)
      )
      .sort((a, b) =>
        new Date(a.expectedDepartureTime!).getTime() -
        new Date(b.expectedDepartureTime!).getTime()
      );

    // TER/Rémi uniquement. La ligne N est volontairement exclue partout.
    const trainVisits = await getPrim(
      isReturn ? "STIF:StopArea:SP:43238:" : "STIF:StopArea:SP:427870:",
      TER_LINE
    );

    const trains = trainVisits
      .map((visit) => {
        const journey = visit.MonitoredVehicleJourney;
        const call = journey?.MonitoredCall;
        const lineRef = journey?.LineRef?.value ?? null;
        return {
          type: "TER",
          lineRef,
          stop: value(call?.StopPointName),
          destination: value(call?.DestinationDisplay) ?? value(journey?.DestinationName),
          trainNumber: value(journey?.TrainNumbers?.TrainNumberRef) ?? value(journey?.VehicleJourneyName),
          mission: value(journey?.JourneyNote),
          expectedDepartureTime: call?.ExpectedDepartureTime ?? null,
          aimedDepartureTime: call?.AimedDepartureTime ?? null,
          platform: call?.DeparturePlatformName?.value ?? null,
          status: call?.DepartureStatus ?? null,
        };
      })
      .filter((train) =>
        train.lineRef === TER_LINE &&
        train.expectedDepartureTime &&
        (isReturn || train.destination?.toLowerCase().includes("paris montparnasse"))
      )
      .sort((a, b) =>
        new Date(a.expectedDepartureTime!).getTime() -
        new Date(b.expectedDepartureTime!).getTime()
      );

    return NextResponse.json(
      { updatedAt: new Date().toISOString(), direction, bus, trains },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
