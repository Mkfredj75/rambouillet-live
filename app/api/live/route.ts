import { NextResponse } from "next/server";

const PRIM_URL =
  "https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring";

type SiriValue = {
  value?: string;
};

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
    TrainNumbers?: {
      TrainNumberRef?: SiriValue[];
    };
  };
};

async function getPrim(
  monitoringRef: string,
  lineRef?: string
): Promise<StopVisit[]> {
  const apiKey = process.env.PRIM_API_KEY;

  if (!apiKey) {
    throw new Error("PRIM_API_KEY manquant");
  }

  const params = new URLSearchParams({
    MonitoringRef: monitoringRef,
  });

  if (lineRef) {
    params.set("LineRef", lineRef);
  }

  const response = await fetch(`${PRIM_URL}?${params.toString()}`, {
    headers: {
      apiKey,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Erreur PRIM ${response.status}`);
  }

  const data = await response.json();

  return (
    data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]
      ?.MonitoredStopVisit ?? []
  );
}

function value(first?: SiriValue[]) {
  return first?.[0]?.value ?? null;
}

export async function GET() {
  try {
    /*
     * BUS 5302
     * Prunelliers -> Marcel Dassault
     * Passe par Gare de Rambouillet
     */
    const busVisits = await getPrim(
      "STIF:StopPoint:Q:31258:",
      "STIF:Line::C00183:"
    );

    const bus = busVisits
      .map((visit) => {
        const journey = visit.MonitoredVehicleJourney;
        const call = journey?.MonitoredCall;

        return {
          line: "5302",
          stop: value(call?.StopPointName),
          destination:
            value(call?.DestinationDisplay) ??
            value(journey?.DestinationName),
          expectedDepartureTime: call?.ExpectedDepartureTime ?? null,
          aimedDepartureTime: call?.AimedDepartureTime ?? null,
          status: call?.DepartureStatus ?? null,
        };
      })
      .filter((item) => item.expectedDepartureTime)
      .sort(
        (a, b) =>
          new Date(a.expectedDepartureTime!).getTime() -
          new Date(b.expectedDepartureTime!).getTime()
      );

    /*
     * GARE DE RAMBOUILLET
     * Ligne N + TER vers Paris-Montparnasse
     */
    const trainVisits = await getPrim(
      "STIF:StopArea:SP:427870:"
    );

    const trains = trainVisits
      .map((visit) => {
        const journey = visit.MonitoredVehicleJourney;
        const call = journey?.MonitoredCall;
        const lineRef = journey?.LineRef?.value ?? null;

        return {
          type:
            lineRef === "STIF:Line::C01736:"
              ? "N"
              : lineRef === "STIF:Line::C01744:"
              ? "TER"
              : "TRAIN",
          lineRef,
          stop: value(call?.StopPointName),
          destination:
            value(call?.DestinationDisplay) ??
            value(journey?.DestinationName),
          trainNumber:
            value(journey?.TrainNumbers?.TrainNumberRef) ??
            value(journey?.VehicleJourneyName),
          mission: value(journey?.JourneyNote),
          expectedDepartureTime: call?.ExpectedDepartureTime ?? null,
          aimedDepartureTime: call?.AimedDepartureTime ?? null,
          platform: call?.DeparturePlatformName?.value ?? null,
          status: call?.DepartureStatus ?? null,
        };
      })
      .filter(
        (train) =>
          (
            train.lineRef === "STIF:Line::C01736:" ||
            train.lineRef === "STIF:Line::C01744:"
          ) &&
          train.destination
            ?.toLowerCase()
            .includes("paris montparnasse") &&
          train.expectedDepartureTime
      )
      .sort(
        (a, b) =>
          new Date(a.expectedDepartureTime!).getTime() -
          new Date(b.expectedDepartureTime!).getTime()
      );

    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        bus,
        trains,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue",
      },
      { status: 500 }
    );
  }
}
