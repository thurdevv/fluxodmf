"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Money } from "@/components/Money";
import { useFetchData } from "@/components/panel/useFetchData";

type CalendarEvent = {
  id: string; type: "PAGAMENTO" | "APORTE" | "ADIANTAMENTO"; date: string;
  title: string; subtitle: string; amount: number; status: string;
  tags: Array<{ id: string; name: string; color: string }>;
};
type Response = { events: CalendarEvent[] };

function isoDay(date: Date) { return date.toISOString().slice(0, 10); }
function monthRange(anchor: Date) {
  return {
    from: new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1)),
    to: new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)),
  };
}

export function FinancialCalendarTab() {
  const [anchor, setAnchor] = useState(() => new Date());
  const [view, setView] = useState<"month" | "week">("month");
  const month = monthRange(anchor);
  const weekStart = new Date(anchor); weekStart.setUTCDate(anchor.getUTCDate() - anchor.getUTCDay());
  const weekEnd = new Date(weekStart); weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  const range = view === "month" ? month : { from: weekStart, to: weekEnd };
  const url = `/api/calendar?from=${isoDay(range.from)}&to=${isoDay(range.to)}`;
  const { data, error, loading } = useFetchData<Response>(url);
  const days = (() => {
    const result: Date[] = [];
    if (view === "week") {
      for (let i = 0; i < 7; i++) { const day = new Date(weekStart); day.setUTCDate(weekStart.getUTCDate() + i); result.push(day); }
    } else {
      const padding = month.from.getUTCDay();
      for (let i = 0; i < padding; i++) result.push(new Date(Date.UTC(month.from.getUTCFullYear(), month.from.getUTCMonth(), 1 - padding + i)));
      const cursor = new Date(result.at(-1) ?? new Date(Date.UTC(month.from.getUTCFullYear(), month.from.getUTCMonth(), 0)));
      while (result.length < 42) { cursor.setUTCDate(cursor.getUTCDate() + 1); result.push(new Date(cursor)); }
    }
    return result;
  })();
  const events = data?.events ?? [];
  const move = (delta: number) => setAnchor((current) => {
    const next = new Date(current);
    if (view === "month") next.setUTCMonth(next.getUTCMonth() + delta);
    else next.setUTCDate(next.getUTCDate() + delta * 7);
    return next;
  });

  return (
    <>
      <section className="panel pad calendar-toolbar">
        <div className="button-row"><button className="icon-button" type="button" onClick={() => move(-1)}><ChevronLeft size={18} /></button><button className="button ghost" type="button" onClick={() => setAnchor(new Date())}>Hoje</button><button className="icon-button" type="button" onClick={() => move(1)}><ChevronRight size={18} /></button></div>
        <h2>{anchor.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
        <div className="button-row"><button className={`button ${view === "month" ? "" : "secondary"}`} type="button" onClick={() => setView("month")}>Mês</button><button className={`button ${view === "week" ? "" : "secondary"}`} type="button" onClick={() => setView("week")}>Semana</button></div>
      </section>
      {error ? <div className="alert error">{error}</div> : null}
      {loading ? <div className="panel pad">Carregando agenda...</div> : (
        <section className={`calendar-grid ${view}`}>
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((label) => <strong className="calendar-weekday" key={label}>{label}</strong>)}
          {days.map((day) => {
            const key = isoDay(day); const dayEvents = events.filter((event) => event.date.slice(0, 10) === key);
            return <article className={`calendar-day ${day.getUTCMonth() !== anchor.getUTCMonth() && view === "month" ? "outside" : ""}`} key={key}><span className="calendar-number">{day.getUTCDate()}</span>{dayEvents.map((event) => <div className={`calendar-event ${event.type.toLowerCase()}`} key={event.id} title={event.subtitle}><strong>{event.title}</strong><small><Money value={event.amount} /> · {event.type}</small>{event.tags.map((tag) => <i key={tag.id} style={{ background: tag.color }}>{tag.name}</i>)}</div>)}</article>;
          })}
        </section>
      )}
    </>
  );
}
