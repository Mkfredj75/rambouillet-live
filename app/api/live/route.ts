import { NextRequest, NextResponse } from "next/server";

const PRIM_BASE = "https://prim.iledefrance-mobilites.fr/marketplace";
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

type EstimatedCall = {
  StopPointRef?: SiriValue;
  StopPointName?: SiriValue[];
  DestinationDisplay?: SiriValue[];
  AimedArrivalTime?: string;
  ExpectedArrivalTime?: string;
  AimedDepartureTime?: string;
  ExpectedDepartureTime?: string;
  DepartureStatus?: string;
  DeparturePlatformName?: SiriValue;
};

type EstimatedJourney = {
  LineRef?: SiriValue;
  DestinationName?: SiriValue[];
  VehicleJourneyName?: SiriValue[];
  JourneyNote?: SiriValue[];
  TrainNumbers?: { TrainNumberRef?: SiriValue[] };
  EstimatedCalls?: { EstimatedCall?: EstimatedCall[] };
};

async function prim(path: string, params: Record<string, string>) {
  const apiKey = process.env.PRIM_API_KEY;
  if (!apiKey) throw new Error("PRIM_API_KEY manquant");

  const qs = new URLSearchParams(params);
  const response = await fetch(`${PRIM_BASE}/${path}?${qs.toString()}`, {
    headers: { apiKey, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Erreur PRIM ${response.status}`);
  return response.json();
}

async function getStopMonitoring(monitoringRef: string, lineRef: string): Promise<StopVisit[]> {
  const data = await prim("stop-monitoring", { MonitoringRef: monitoringRef, LineRef: lineRef });
  return data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit ?? [];
}

async function getEstimatedTimetable(lineRef: string): Promise<EstimatedJourney[]> {
  const data = await prim("estimated-timetable", { LineRef: lineRef });
  const frames = data?.Siri?.ServiceDelivery?.EstimatedTimetableDelivery?.[0]?.EstimatedJourneyVersionFrame ?? [];
  return frames.flatMap((frame: { EstimatedVehicleJourney?: EstimatedJourney[] }) =>
    frame.EstimatedVehicleJourney ?? []
  );
}

function value(first?: SiriValue[]) {
  return first?.[0]?.value ?? null;
}

function callName(call?: EstimatedCall) {
  return value(call?.StopPointName)?.toLowerCase() ?? "";
}

function callTime(call?: EstimatedCall) {
  return call?.ExpectedDepartureTime ??
    call?.AimedDepartureTime ??
    call?.ExpectedArrivalTime ??
    call?.AimedArrivalTime ??
    null;
}

function future(time: string | null) {
  return !!time && new Date(time).getTime() >= Date.now() - 60_000;
}

function findCall(journey: EstimatedJourney, names: string[]) {
  const calls = journey.EstimatedCalls?.EstimatedCall ?? [];
  return calls.find((call) => names.some((name) => callName(call).includes(name)));
}

function timetableTrains(journeys: EstimatedJourney[], isReturn: boolean) {
  return journeys
    .map((journey) => {
      const rambouillet = findCall(journey, ["rambouillet"]);
      const montparnasse = findCall(journey, ["montparnasse"]);
      if (!rambouillet || !montparnasse) return null;

      const originCall = isReturn ? montparnasse : rambouillet;
      const originTime = callTime(originCall);
      if (!future(originTime)) return null;

      const rTime = new Date(callTime(rambouillet) ?? 0).getTime();
      const pTime = new Date(callTime(montparnasse) ?? 0).getTime();
      if (isReturn ? pTime >= rTime : rTime >= pTime) return null;

      return {
        type: "TER",
        lineRef: journey.LineRef?.value ?? TER_LINE,
        stop: isReturn ? "Paris Montparnasse" : "Rambouillet",
        destination: value(journey.DestinationName) ?? (isReturn ? "Rambouillet" : "Paris Montparnasse"),
        trainNumber: value(journey.TrainNumbers?.TrainNumberRef) ?? value(journey.VehicleJourneyName),
        mission: value(journey.JourneyNote),
        expectedDepartureTime: originCall.ExpectedDepartureTime ?? originCall.AimedDepartureTime ?? originTime,
        aimedDepartureTime: originCall.AimedDepartureTime ?? originTime,
        platform: originCall.DeparturePlatformName?.value ?? null,
        status: originCall.DepartureStatus ?? "scheduled",
        source: "timetable",
      };
    })
    .filter(Boolean)
    .sort((a, b) =>
      new Date(a!.expectedDepartureTime!).getTime() - new Date(b!.expectedDepartureTime!).getTime()
    )
    .slice(0, 8);
}

function timetableBus(journeys: EstimatedJourney[], isReturn: boolean) {
  return journeys
    .map((journey) => {
      const calls = journey.EstimatedCalls?.EstimatedCall ?? [];
      const origin = calls.find((call) =>
        isReturn
          ? callName(call).includes("gare de rambouillet")
          : callName(call).includes("prunelliers")
      );
      const destination = value(journey.DestinationName)?.toLowerCase() ?? "";
      const wanted = isReturn ? "clairbois" : "marcel dassault";
      const time = callTime(origin);
      if (!origin || !destination.includes(wanted) || !future(time)) return null;

      return {
        line: "5302",
        stop: isReturn ? "Gare de Rambouillet" : "Prunelliers",
        destination: value(journey.DestinationName),
        expectedDepartureTime: origin.ExpectedDepartureTime ?? origin.AimedDepartureTime ?? time,
        aimedDepartureTime: origin.AimedDepartureTime ?? time,
        status: origin.DepartureStatus ?? "scheduled",
        source: "timetable",
      };
    })
    .filter(Boolean)
    .sort((a, b) =>
      new Date(a!.expectedDepartureTime!).getTime() - new Date(b!.expectedDepartureTime!).getTime()
    )
    .slice(0, 8);
}

export async function GET(request: NextRequest) {
  try {
    const direction = request.nextUrl.searchParams.get("direction") === "paris-rambouillet"
      ? "paris-rambouillet"
      : "rambouillet-paris";
    const isReturn = direction === "paris-rambouillet";

    const [busVisits, trainVisits] = await Promise.all([
      getStopMonitoring(isReturn ? "STIF:StopPoint:Q:31265:" : "STIF:StopPoint:Q:31258:", BUS_LINE),
      getStopMonitoring(isReturn ? "STIF:StopArea:SP:43238:" : "STIF:StopArea:SP:427870:", TER_LINE),
    ]);

    let bus = busVisits
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
          source: "realtime",
        };
      })
      .filter((item) =>
        future(item.expectedDepartureTime) &&
        item.destination?.toLowerCase().includes(isReturn ? "clairbois" : "marcel dassault")
      )
      .sort((a, b) =>
        new Date(a.expectedDepartureTime!).getTime() - new Date(b.expectedDepartureTime!).getTime()
      );

    let trains = trainVisits
      .map((visit) => {
        const journey = visit.MonitoredVehicleJourney;
        const call = journey?.MonitoredCall;
        return {
          type: "TER",
          lineRef: journey?.LineRef?.value ?? null,
          stop: value(call?.StopPointName),
          destination: value(call?.DestinationDisplay) ?? value(journey?.DestinationName),
          trainNumber: value(journey?.TrainNumbers?.TrainNumberRef) ?? value(journey?.VehicleJourneyName),
          mission: value(journey?.JourneyNote),
          expectedDepartureTime: call?.ExpectedDepartureTime ?? null,
          aimedDepartureTime: call?.AimedDepartureTime ?? null,
          platform: call?.DeparturePlatformName?.value ?? null,
          status: call?.DepartureStatus ?? null,
          source: "realtime",
        };
      })
      .filter((train) =>
        train.lineRef === TER_LINE &&
        future(train.expectedDepartureTime) &&
        (isReturn || train.destination?.toLowerCase().includes("paris montparnasse"))
      )
      .sort((a, b) =>
        new Date(a.expectedDepartureTime!).getTime() - new Date(b.expectedDepartureTime!).getTime()
      );

    // Hors plage de StopMonitoring, ET permet de retrouver les prochaines courses
    // et leurs appels. Il ne remplace jamais le temps réel lorsqu'il est disponible.
    if (trains.length === 0) {
      try {
        trains = timetableTrains(await getEstimatedTimetable(TER_LINE), isReturn) as typeof trains;
      } catch (error) {
        console.error("Fallback TER EstimatedTimetable:", error);
      }
    }

    if (bus.length === 0) {
      try {
        bus = timetableBus(await getEstimatedTimetable(BUS_LINE), isReturn) as typeof bus;
      } catch (error) {
        console.error("Fallback bus EstimatedTimetable:", error);
      }
    }

    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        direction,
        bus,
        trains,
        serviceResumption: {
          trains: trains[0]?.source === "timetable",
          bus: bus[0]?.source === "timetable",
        },
      },
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
