"use client";

import { useEffect, useState } from "react";

type Bus = {
  line: string;
  stop: string | null;
  destination: string | null;
  expectedDepartureTime: string | null;
  aimedDepartureTime: string | null;
  status: string | null;
};

type Train = {
  type: string;
  lineRef: string | null;
  stop: string | null;
  destination: string | null;
  trainNumber: string | null;
  mission: string | null;
  expectedDepartureTime: string | null;
  aimedDepartureTime: string | null;
  platform: string | null;
  status: string | null;
};

type LiveData = {
  updatedAt: string;
  bus: Bus[];
  trains: Train[];
};

function formatTime(value: string | null) {
  if (!value) return "--:--";

  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function delay(expected: string | null, aimed: string | null) {
  if (!expected || !aimed) return 0;

  return Math.max(
    0,
    Math.round(
      (new Date(expected).getTime() - new Date(aimed).getTime()) / 60000
    )
  );
}

function minutesUntil(value: string | null, now: Date | null) {
  if (!value || !now) return null;

  return Math.max(
    0,
    Math.ceil((new Date(value).getTime() - now.getTime()) / 60000)
  );
}

export default function Home() {
  const [data, setData] = useState<LiveData | null>(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  async function load() {
    try {
      const response = await fetch("/api/live", { cache: "no-store" });

      if (!response.ok) throw new Error();

      const json: LiveData = await response.json();

      setData(json);
      setError(false);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    setNow(new Date());
    load();

    const clockTimer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    const apiTimer = window.setInterval(load, 180000);

    return () => {
      window.clearInterval(clockTimer);
      window.clearInterval(apiTimer);
    };
  }, []);

  const visibleTrains =
    data?.trains.filter((train) => {
      if (!train.expectedDepartureTime || !now) return true;

      return (
        new Date(train.expectedDepartureTime).getTime() >=
        now.getTime() - 60000
      );
    }) ?? [];

  const visibleBuses =
    data?.bus.filter((bus) => {
      if (!bus.expectedDepartureTime || !now) return false;

      return (
        new Date(bus.expectedDepartureTime).getTime() >=
        now.getTime() - 60000
      );
    }) ?? [];

  const firstTrain = visibleTrains[0];
  const nextTrains = visibleTrains.slice(1, 5);

  const firstTrainDelay = firstTrain
    ? delay(
        firstTrain.expectedDepartureTime,
        firstTrain.aimedDepartureTime
      )
    : 0;

  return (
    <main className="screen">
      <section className="rail">
        <header className="railHeader">
          <div>
            <div className="stationLabel">GARE DE</div>
            <h1>Rambouillet</h1>
          </div>

          <div className="clock">
            {now
              ? now.toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "--:--"}
          </div>
        </header>

        <div className="railTitle">
          <div>
            <span>Prochains départs</span>
            <strong>Paris Montparnasse</strong>
          </div>

          <div className="directionArrow">→</div>
        </div>

        {!data && !error && (
          <div className="message">Chargement des départs…</div>
        )}

        {error && (
          <div className="message">
            Information momentanément indisponible
          </div>
        )}

        {data && !firstTrain && (
          <div className="message">
            Aucun prochain départ disponible
          </div>
        )}

        {firstTrain && (
          <article className="heroTrain">
            <div className="heroTop">
              <span className="nextDeparture">PROCHAIN DÉPART</span>

              <span
                className={`status ${
                  firstTrainDelay > 0 ? "statusLate" : ""
                }`}
              >
                {firstTrainDelay > 0
                  ? `+${firstTrainDelay} min`
                  : "À L'HEURE"}
              </span>
            </div>

            <div className="heroMain">
              <div className="heroTime">
                {formatTime(firstTrain.expectedDepartureTime)}
              </div>

              <div className="heroIdentity">
                <div className="transportLine">
                  <span
                    className={
                      firstTrain.type === "N"
                        ? "badge badgeN"
                        : "badge badgeTer"
                    }
                  >
                    {firstTrain.type}
                  </span>

                  {firstTrain.mission && (
                    <span className="mission">
                      {firstTrain.mission}
                    </span>
                  )}
                </div>

                <div className="heroDestination">
                  {firstTrain.destination}
                </div>

                <div className="trainNumber">
                  Train {firstTrain.trainNumber ?? "—"}
                </div>
              </div>

              <div className="platformBlock">
                <span>VOIE</span>
                <strong>{firstTrain.platform ?? "—"}</strong>
              </div>
            </div>
          </article>
        )}

        {nextTrains.length > 0 && (
          <div className="following">
            <div className="followingHeader">
              <span>HEURE</span>
              <span>LIGNE</span>
              <span>DESTINATION</span>
              <span>ÉTAT</span>
              <span>VOIE</span>
            </div>

            {nextTrains.map((train, index) => {
              const late = delay(
                train.expectedDepartureTime,
                train.aimedDepartureTime
              );

              return (
                <div
                  className="followingRow"
                  key={`${train.trainNumber}-${index}`}
                >
                  <strong className="followingTime">
                    {formatTime(train.expectedDepartureTime)}
                  </strong>

                  <div className="followingLine">
                    <span
                      className={
                        train.type === "N"
                          ? "badge smallBadge badgeN"
                          : "badge smallBadge badgeTer"
                      }
                    >
                      {train.type}
                    </span>

                    {train.mission && (
                      <small>{train.mission}</small>
                    )}
                  </div>

                  <div className="followingDestination">
                    <strong>{train.destination}</strong>
                    <small>{train.trainNumber}</small>
                  </div>

                  <div
                    className={
                      late > 0 ? "rowStatus late" : "rowStatus"
                    }
                  >
                    {late > 0 ? `+${late} min` : "À l'heure"}
                  </div>

                  <div className="smallPlatform">
                    {train.platform ?? "—"}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <footer className="railFooter">
          <span>Information voyageurs</span>
          <span>
            Temps réel · mise à jour{" "}
            {data ? formatTime(data.updatedAt) : "--:--"}
          </span>
        </footer>
      </section>

      <section className="bus">
        <header className="busHeader">
          <div className="busLine">5302</div>

          <div>
            <span className="stopLabel">ARRÊT</span>
            <h2>Prunelliers</h2>
          </div>
        </header>

        <div className="busDirection">
          <span>DIRECTION</span>
          <strong>Marcel Dassault</strong>
          <small>via Gare de Rambouillet</small>
        </div>

        <div className="busContent">
          {!data && !error && (
            <div className="busMessage">Chargement…</div>
          )}

          {error && (
            <div className="busMessage">
              Information indisponible
            </div>
          )}

          {data && visibleBuses.length === 0 && (
            <div className="busMessage">
              Aucun prochain passage disponible
            </div>
          )}

          {visibleBuses.slice(0, 3).map((bus, index) => {
            const mins = minutesUntil(
              bus.expectedDepartureTime,
              now
            );

            const late = delay(
              bus.expectedDepartureTime,
              bus.aimedDepartureTime
            );

            return (
              <article
                className={`busPassage ${
                  index === 0 ? "firstBus" : ""
                }`}
                key={`${bus.expectedDepartureTime}-${index}`}
              >
                <div className="busPassageInfo">
                  <span className="passageLabel">
                    {index === 0
                      ? "PROCHAIN PASSAGE"
                      : "PUIS"}
                  </span>

                  <strong>{bus.destination}</strong>

                  <small>
                    Passage prévu à{" "}
                    {formatTime(bus.expectedDepartureTime)}
                  </small>

                  {late > 0 && (
                    <small className="busDelay">
                      Retard estimé : {late} min
                    </small>
                  )}
                </div>

                <div className="busCountdown">
                  {mins === 0 ? (
                    <strong className="approaching">
                      À l'approche
                    </strong>
                  ) : (
                    <>
                      <strong>{mins ?? "—"}</strong>
                      <span>min</span>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <footer className="busFooter">
          <span>Temps réel</span>
          <strong>Île-de-France Mobilités</strong>
        </footer>
      </section>

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .screen {
          min-height: 100vh;
          padding: 20px;
          display: grid;
          grid-template-columns:
            minmax(650px, 1.7fr)
            minmax(330px, 0.72fr);
          gap: 18px;
          background: #111820;
          font-family: Arial, Helvetica, sans-serif;
        }

        .rail,
        .bus {
          min-height: calc(100vh - 40px);
          overflow: hidden;
        }

        .rail {
          display: flex;
          flex-direction: column;
          background: #071f3a;
          color: #fff;
          border-radius: 4px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
        }

        .railHeader {
          min-height: 116px;
          padding: 23px 30px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #061a30;
          border-bottom: 1px solid rgba(255, 255, 255, 0.16);
        }

        .stationLabel {
          margin-bottom: 3px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.16em;
          opacity: 0.65;
        }

        .railHeader h1 {
          margin: 0;
          font-size: clamp(34px, 4vw, 58px);
          line-height: 1;
          font-weight: 700;
        }

        .clock {
          font-size: clamp(34px, 4vw, 55px);
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }

        .railTitle {
          min-height: 100px;
          padding: 20px 30px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #fff;
          color: #071f3a;
        }

        .railTitle div:first-child {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .railTitle span {
          font-size: 15px;
        }

        .railTitle strong {
          font-size: clamp(26px, 3vw, 41px);
          line-height: 1.05;
        }

        .directionArrow {
          font-size: 50px;
          line-height: 1;
          font-weight: 300;
        }

        .message {
          padding: 40px 30px;
          font-size: 20px;
        }

        .heroTrain {
          padding: 22px 30px 26px;
          background: #0a315b;
          border-bottom: 5px solid #fff;
        }

        .heroTop {
          margin-bottom: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .nextDeparture {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.14em;
          opacity: 0.75;
        }

        .status {
          padding: 6px 10px;
          background: #16835d;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.04em;
        }

        .statusLate {
          background: #e3a500;
          color: #171717;
        }

        .heroMain {
          display: grid;
          grid-template-columns:
            minmax(150px, 0.8fr)
            minmax(300px, 2fr)
            120px;
          align-items: center;
          gap: 25px;
        }

        .heroTime {
          font-size: clamp(52px, 6vw, 86px);
          line-height: 1;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }

        .heroIdentity {
          min-width: 0;
        }

        .transportLine {
          margin-bottom: 9px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .badge {
          min-width: 53px;
          padding: 7px 10px;
          display: inline-grid;
          place-items: center;
          font-size: 19px;
          line-height: 1;
          font-weight: 900;
        }

        .badgeN {
          background: #00a88f;
          color: #fff;
        }

        .badgeTer {
          background: #5967a9;
          color: #fff;
        }

        .mission {
          font-size: 17px;
          font-weight: 800;
          letter-spacing: 0.08em;
        }

        .heroDestination {
          overflow: hidden;
          font-size: clamp(25px, 3vw, 42px);
          line-height: 1.05;
          font-weight: 700;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .trainNumber {
          margin-top: 8px;
          font-size: 13px;
          opacity: 0.7;
        }

        .platformBlock {
          width: 108px;
          height: 108px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          justify-self: end;
          background: #fff;
          color: #071f3a;
          border-radius: 50%;
        }

        .platformBlock span {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.1em;
        }

        .platformBlock strong {
          margin-top: 1px;
          font-size: 43px;
          line-height: 1;
        }

        .following {
          background: #071f3a;
        }

        .followingHeader,
        .followingRow {
          display: grid;
          grid-template-columns:
            0.75fr
            0.7fr
            1.8fr
            0.9fr
            0.5fr;
          align-items: center;
          column-gap: 12px;
        }

        .followingHeader {
          padding: 10px 30px;
          background: #dbe2e8;
          color: #33485d;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.06em;
        }

        .followingRow {
          min-height: 88px;
          padding: 12px 30px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.15);
        }

        .followingTime {
          font-size: 30px;
          font-variant-numeric: tabular-nums;
        }

        .followingLine {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .followingLine small {
          font-size: 11px;
          font-weight: 800;
        }

        .smallBadge {
          min-width: 42px;
          padding: 6px 7px;
          font-size: 15px;
        }

        .followingDestination {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .followingDestination strong {
          overflow: hidden;
          font-size: 17px;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .followingDestination small {
          font-size: 11px;
          opacity: 0.65;
        }

        .rowStatus {
          font-size: 13px;
        }

        .rowStatus.late {
          color: #ffd54a;
          font-weight: 700;
        }

        .smallPlatform {
          width: 46px;
          height: 46px;
          display: grid;
          place-items: center;
          justify-self: end;
          background: #fff;
          color: #071f3a;
          border-radius: 50%;
          font-size: 20px;
          font-weight: 800;
        }

        .railFooter {
          margin-top: auto;
          min-height: 45px;
          padding: 12px 30px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          background: #041426;
          font-size: 11px;
          opacity: 0.9;
        }

        .bus {
          display: flex;
          flex-direction: column;
          background: #f1f3f3;
          color: #171717;
          border-radius: 4px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
        }

        .busHeader {
          min-height: 116px;
          padding: 24px;
          display: flex;
          align-items: center;
          gap: 17px;
          background: #fff;
        }

        .busLine {
          min-width: 94px;
          height: 61px;
          padding: 0 12px;
          display: grid;
          place-items: center;
          background: #1c8c74;
          color: #fff;
          border-radius: 6px;
          font-size: 28px;
          font-weight: 800;
        }

        .stopLabel {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.13em;
          color: #777;
        }

        .busHeader h2 {
          margin: 4px 0 0;
          font-size: 29px;
          line-height: 1;
        }

        .busDirection {
          padding: 21px 24px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          background: #1c8c74;
          color: #fff;
        }

        .busDirection span {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.12em;
          opacity: 0.8;
        }

        .busDirection strong {
          font-size: 24px;
        }

        .busDirection small {
          font-size: 13px;
          opacity: 0.82;
        }

        .busContent {
          background: #e8ebeb;
        }

        .busPassage {
          min-height: 143px;
          padding: 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          background: #fff;
          border-bottom: 1px solid #ccd1d1;
        }

        .firstBus {
          min-height: 175px;
        }

        .busPassageInfo {
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }

        .passageLabel {
          margin-bottom: 8px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.1em;
          color: #747474;
        }

        .busPassageInfo strong {
          font-size: 18px;
        }

        .busPassageInfo small {
          margin-top: 7px;
          font-size: 12px;
          color: #666;
        }

        .busPassageInfo .busDelay {
          color: #a33a24;
          font-weight: 700;
        }

        .busCountdown {
          min-width: 90px;
          color: #1c8c74;
          text-align: right;
          white-space: nowrap;
        }

        .busCountdown > strong:not(.approaching) {
          font-size: 50px;
          line-height: 1;
        }

        .busCountdown span {
          margin-left: 4px;
          font-size: 16px;
          font-weight: 700;
        }

        .approaching {
          font-size: 17px;
        }

        .busMessage {
          padding: 35px 24px;
          background: #fff;
          font-size: 16px;
        }

        .busFooter {
          margin-top: auto;
          padding: 17px 24px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          background: #202020;
          color: #fff;
          font-size: 11px;
        }

        .busFooter strong {
          font-size: 13px;
        }

        @media (max-width: 900px) {
          .screen {
            padding: 0;
            display: block;
          }

          .rail,
          .bus {
            min-height: 100vh;
            border-radius: 0;
            box-shadow: none;
          }

          .heroMain {
            grid-template-columns: 1fr;
          }

          .platformBlock {
            justify-self: start;
          }

          .followingHeader,
          .followingRow {
            grid-template-columns: 0.8fr 0.7fr 1.6fr 0.55fr;
          }

          .followingHeader span:nth-child(4),
          .rowStatus {
            display: none;
          }

          .bus {
            min-height: auto;
          }
        }
      `}</style>
    </main>
  );
}
